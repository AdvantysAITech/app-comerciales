import { orientacionExif } from "./exif";

const LADO_MAXIMO = 1920;
const CALIDAD = 0.8;
const BYTES_SIN_TOCAR = 1024 * 1024;

export type ResultadoNormalizacion = {
    archivo: File;
    /** true si hubo que decodificar con el WASM (el navegador no sabía leerlo). */
    convertida: boolean;
    /** Bytes antes y después. Se usa solo para los logs de diagnóstico. */
    bytesOriginales: number;
    bytesFinales: number;
};

function esImagen(archivo: File): boolean {
    if (archivo.type.startsWith("image/")) return true;
    // Los navegadores devuelven MIME vacío para algunos .heic, igual que pasaba
    // con los .bc3 en la subida de documentos: se cae a la extensión.
    return /\.(heic|heif|jpe?g|png|webp|gif|bmp|tiff?)$/i.test(archivo.name);
}

function nombreJpeg(nombre: string): string {
    return nombre.replace(/\.[^.]+$/, "") + ".jpg";
}

/**
 * Decodifica el archivo a un `ImageBitmap` con la orientación EXIF ya aplicada.
 *
 * `imageOrientation: "from-image"` es obligatorio en las dos ramas: sin él, las
 * fotos verticales del móvil llegan tumbadas al presupuesto.
 */
async function decodificar(archivo: File): Promise<{ bitmap: ImageBitmap; convertida: boolean }> {
    try {
        const bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
        return { bitmap, convertida: false };
    } catch {
        // El navegador no sabe leerlo. Puede ser un HEIC en Chrome o un archivo
        // corrupto: `isHeic` mira las cabeceras reales, no la extensión, así que
        // distingue los dos casos.
        const { isHeic, heicTo } = await import("heic-to");

        if (!(await isHeic(archivo))) {
            throw new Error(
                `No se ha podido leer "${archivo.name}". Comprueba que es una imagen válida.`
            );
        }

        const bitmap = await heicTo({
            blob: archivo,
            type: "bitmap",
            options: { imageOrientation: "from-image" },
        });

        return { bitmap, convertida: true };
    }
}

/** Dibuja el bitmap redimensionado y lo exporta a JPEG. */
async function aJpeg(bitmap: ImageBitmap, nombre: string): Promise<File> {
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;

    const contexto = canvas.getContext("2d");
    if (!contexto) throw new Error("El navegador no ha permitido procesar la imagen");

    contexto.drawImage(bitmap, 0, 0, ancho, alto);

    const blob = await new Promise<Blob | null>((resolver) => {
        canvas.toBlob(resolver, "image/jpeg", CALIDAD);
    });

    if (!blob) throw new Error("No se ha podido comprimir la imagen");

    return new File([blob], nombreJpeg(nombre), { type: "image/jpeg", lastModified: Date.now() });
}

/**
 * Deja la foto lista para subir: JPEG, orientada y por debajo de 1920 px.
 *
 * Lanza con un mensaje en castellano si el archivo no es una imagen o no se
 * puede decodificar. Quien llama lo enseña tal cual: el comercial está en obra
 * y un volcado técnico no le sirve de nada.
 */
export async function normalizarFoto(archivo: File): Promise<ResultadoNormalizacion> {
    if (!esImagen(archivo)) {
        throw new Error(`"${archivo.name}" no es una imagen.`);
    }

    const { bitmap, convertida } = await decodificar(archivo);

    try {
        // Atajo: un JPEG que ya viene ligero y dentro de medidas se sube tal
        // cual. Recomprimirlo solo restaría calidad.
        //
        // Salvo que lleve una orientación EXIF distinta de la normal: el
        // anexo fotográfico del presupuesto la pierde (LibreOffice no la
        // aplica) y la foto saldría tumbada. Recomprimida, la rotación queda
        // en los píxeles. Ver lib/imagen/exif.ts.
        const orientacion =
            archivo.type === "image/jpeg"
                ? orientacionExif(new Uint8Array(await archivo.slice(0, 128 * 1024).arrayBuffer()))
                : null;

        const yaVale =
            !convertida &&
            archivo.type === "image/jpeg" &&
            archivo.size <= BYTES_SIN_TOCAR &&
            (orientacion === null || orientacion === 1) &&
            Math.max(bitmap.width, bitmap.height) <= LADO_MAXIMO;

        if (yaVale) {
            return {
                archivo,
                convertida: false,
                bytesOriginales: archivo.size,
                bytesFinales: archivo.size,
            };
        }

        const salida = await aJpeg(bitmap, archivo.name);

        return {
            archivo: salida,
            convertida,
            bytesOriginales: archivo.size,
            bytesFinales: salida.size,
        };
    } finally {
        // Sin esto, diez fotos seguidas dejan diez bitmaps descomprimidos en
        // memoria. En un móvil de gama media eso es un cierre de pestaña.
        bitmap.close();
    }
}