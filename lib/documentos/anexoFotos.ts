import type { PayloadVisita } from "@/lib/visita/payload";

/**
 * lib/documentos/anexoFotos.ts
 *
 * Anexo fotográfico al final del presupuesto (23/09/2026).
 *
 * Las fotos que el comercial sube en cada tipo de trabajo se imprimen al final
 * del documento, agrupadas bajo el nombre de ese tipo de trabajo ("Medianeras",
 * "Cubiertas"...). Delante de los grupos va un índice con las fotos que tiene
 * cada uno.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ AQUÍ Y NO EN LA PLANTILLA
 * ---------------------------------------------------------------------------
 * La app de documentos (Soluciona) solo sustituye texto: no sabe meter
 * imágenes. Así que el anexo se construye en ODF nativo, igual que la portada y
 * el desglose, dentro del post-proceso que ya abre y vuelve a cerrar el ODT.
 *
 * Se añade al FINAL del cuerpo (`</office:text>`) y no en un marcador: así no
 * hay que tocar las plantillas, que no se pueden abrir y volver a guardar en un
 * editor sin partir los markerkeys (ver learnings: fragmentación de tokens).
 *
 * ---------------------------------------------------------------------------
 * NUNCA BLOQUEA LA EMISIÓN
 * ---------------------------------------------------------------------------
 * Una foto que no se descarga, que no es JPEG/PNG o que se pasa de los topes se
 * queda fuera con un aviso. El presupuesto se publica igual: sin una foto sigue
 * siendo un presupuesto; bloqueado, el comercial se queda esperando en obra.
 */

// ---------------------------------------------------------------------------
// Topes
// ---------------------------------------------------------------------------

/**
 * Máximo de fotos en el anexo. Las fotos llegan normalizadas desde el móvil
 * (JPEG, 1920 px, calidad 0,8: ~300-600 KB). 60 fotos rondan los 25 MB y ya
 * comprometen los 60 s de la función (descarga + PDF + subida a GHL).
 */
const MAX_FOTOS = 60;

/** Máximo de bytes sumando todas las fotos. Mismo motivo. */
const MAX_BYTES_TOTALES = 30 * 1024 * 1024;

/** Tiempo máximo para descargar CADA foto. Una foto colgada no puede bloquear la emisión. */
const TIEMPO_MAXIMO_FOTO_MS = 10_000;

/** Descargas simultáneas. Suficiente para no ir en serie sin saturar el CDN de GHL. */
const DESCARGAS_EN_PARALELO = 6;

// ---------------------------------------------------------------------------
// Maquetación
// ---------------------------------------------------------------------------

/** Ancho máximo de una foto: el de la caja de texto de la plantilla (6,5 in ≈ 16,5 cm), con margen. */
const ANCHO_MAX_CM = 16;

/** Alto máximo: caben dos fotos apaisadas por página y una vertical no ocupa la página entera. */
const ALTO_MAX_CM = 10.5;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type FotoAnexo = {
    /** Ruta dentro del paquete ODF, p. ej. "Pictures/anexo-003.jpg". */
    ruta: string;
    mimetype: "image/jpeg" | "image/png";
    datos: Uint8Array;
    ancho: number;
    alto: number;
};

export type GrupoFotos = {
    /** Nombre del tipo de trabajo: es el título del grupo. */
    titulo: string;
    fotos: FotoAnexo[];
};

// ---------------------------------------------------------------------------
// Dimensiones (sin dependencias: solo se lee la cabecera)
// ---------------------------------------------------------------------------

/**
 * Ancho y alto de un JPEG o un PNG leyendo su cabecera.
 *
 * Hace falta para el marco ODF (`svg:width` / `svg:height`): sin proporción
 * real, las fotos saldrían deformadas. No se añade una librería de imagen para
 * esto: son 30 líneas y el formato de las dos cabeceras no va a cambiar.
 */
export function dimensionesImagen(
    datos: Uint8Array
): { mimetype: "image/jpeg" | "image/png"; ancho: number; alto: number } | null {
    // PNG: firma de 8 bytes y el chunk IHDR justo detrás.
    if (
        datos.length >= 24 &&
        datos[0] === 0x89 &&
        datos[1] === 0x50 &&
        datos[2] === 0x4e &&
        datos[3] === 0x47
    ) {
        const vista = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
        return { mimetype: "image/png", ancho: vista.getUint32(16), alto: vista.getUint32(20) };
    }

    // JPEG: se recorren los segmentos hasta el primer SOFn.
    if (datos.length >= 4 && datos[0] === 0xff && datos[1] === 0xd8) {
        let i = 2;
        while (i + 9 < datos.length) {
            if (datos[i] !== 0xff) {
                i++;
                continue;
            }
            const marcador = datos[i + 1];
            // Relleno y marcadores sin longitud.
            if (marcador === 0xff || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) {
                i += marcador === 0xff ? 1 : 2;
                continue;
            }
            const longitud = (datos[i + 2] << 8) | datos[i + 3];
            // SOF0..SOF15 salvo DHT (C4), JPG (C8) y DAC (CC).
            const esSof =
                marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc;
            if (esSof) {
                const alto = (datos[i + 5] << 8) | datos[i + 6];
                const ancho = (datos[i + 7] << 8) | datos[i + 8];
                return { mimetype: "image/jpeg", ancho, alto };
            }
            if (longitud < 2) return null;
            i += 2 + longitud;
        }
    }

    return null;
}

// ---------------------------------------------------------------------------
// Descarga
// ---------------------------------------------------------------------------

async function descargar(url: string): Promise<Uint8Array> {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), TIEMPO_MAXIMO_FOTO_MS);
    try {
        // `no-store`: el fetch parcheado de Next.js cachea y manipula binarios
        // si no se le dice lo contrario (ver learnings).
        const respuesta = await fetch(url, { cache: "no-store", signal: control.signal });
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        return new Uint8Array(await respuesta.arrayBuffer());
    } finally {
        clearTimeout(temporizador);
    }
}

/** Ejecuta `tareas` con un máximo de `limite` a la vez, conservando el orden de los resultados. */
async function enParalelo<T>(tareas: Array<() => Promise<T>>, limite: number): Promise<PromiseSettledResult<T>[]> {
    const resultados: PromiseSettledResult<T>[] = new Array(tareas.length);
    let siguiente = 0;

    async function trabajador() {
        while (siguiente < tareas.length) {
            const indice = siguiente++;
            try {
                resultados[indice] = { status: "fulfilled", value: await tareas[indice]() };
            } catch (error) {
                resultados[indice] = { status: "rejected", reason: error };
            }
        }
    }

    await Promise.all(Array.from({ length: Math.min(limite, tareas.length) }, trabajador));
    return resultados;
}

/**
 * Descarga las fotos de la visita, agrupadas por tipo de trabajo y en el orden
 * en que el comercial las subió.
 *
 * NUNCA lanza. Lo que no se puede incluir se explica en `avisos`.
 * Devuelve `[]` si la visita no tiene fotos: entonces no hay anexo.
 */
export async function prepararAnexoFotos(payload: PayloadVisita, avisos: string[]): Promise<GrupoFotos[]> {
    try {
        const pedidas: Array<{ grupo: number; url: string }> = [];
        const grupos: GrupoFotos[] = [];

        for (const modulo of payload.modulos) {
            const urls = [...new Set(modulo.fotos ?? [])].filter((u) => typeof u === "string" && u !== "");
            if (urls.length === 0) continue;
            const indiceGrupo = grupos.push({ titulo: modulo.label, fotos: [] }) - 1;
            for (const url of urls) pedidas.push({ grupo: indiceGrupo, url });
        }

        if (pedidas.length === 0) return [];

        if (pedidas.length > MAX_FOTOS) {
            avisos.push(
                `Anexo fotográfico: la visita tiene ${pedidas.length} fotos y solo se incluyen las ${MAX_FOTOS} primeras.`
            );
        }
        const aDescargar = pedidas.slice(0, MAX_FOTOS);

        const resultados = await enParalelo(
            aDescargar.map((p) => () => descargar(p.url)),
            DESCARGAS_EN_PARALELO
        );

        let bytesTotales = 0;
        let numero = 0;
        let fueraPorTamano = 0;

        resultados.forEach((resultado, i) => {
            const { grupo, url } = aDescargar[i];

            if (resultado.status === "rejected") {
                const motivo = resultado.reason instanceof Error ? resultado.reason.message : "error desconocido";
                avisos.push(`Anexo fotográfico: no se ha podido descargar ${url} (${motivo}).`);
                return;
            }

            const datos = resultado.value;
            const medidas = dimensionesImagen(datos);
            if (!medidas || medidas.ancho === 0 || medidas.alto === 0) {
                avisos.push(`Anexo fotográfico: ${url} no es un JPEG ni un PNG legible; se omite.`);
                return;
            }

            if (bytesTotales + datos.byteLength > MAX_BYTES_TOTALES) {
                fueraPorTamano++;
                return;
            }
            bytesTotales += datos.byteLength;

            numero++;
            const extension = medidas.mimetype === "image/png" ? "png" : "jpg";
            grupos[grupo].fotos.push({
                ruta: `Pictures/anexo-${String(numero).padStart(3, "0")}.${extension}`,
                mimetype: medidas.mimetype,
                datos,
                ancho: medidas.ancho,
                alto: medidas.alto,
            });
        });

        if (fueraPorTamano > 0) {
            avisos.push(
                `Anexo fotográfico: ${fueraPorTamano} foto(s) no incluidas por superar ` +
                    `${Math.round(MAX_BYTES_TOTALES / 1024 / 1024)} MB en total.`
            );
        }

        return grupos.filter((g) => g.fotos.length > 0);
    } catch (error) {
        const motivo = error instanceof Error ? error.message : "error desconocido";
        avisos.push(`El documento se ha publicado SIN anexo fotográfico: ${motivo}`);
        return [];
    }
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

function escaparXml(texto: string): string {
    return texto
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** Tamaño del marco en cm, conservando la proporción dentro de ANCHO_MAX x ALTO_MAX. */
function tamanoMarco(foto: FotoAnexo): { ancho: string; alto: string } {
    const escala = Math.min(ANCHO_MAX_CM / foto.ancho, ALTO_MAX_CM / foto.alto);
    return {
        ancho: `${(foto.ancho * escala).toFixed(2)}cm`,
        alto: `${(foto.alto * escala).toFixed(2)}cm`,
    };
}

/**
 * Estilos automáticos del anexo.
 *
 * UN SOLO literal sin interpolaciones, por el mismo motivo que ESTILOS_TABLA_BASE
 * en odf.ts: el minificador de producción plegaba y recortaba concatenaciones
 * de constantes y dejaba el content.xml mal formado.
 *
 *  - AIFotosTitulo: título del anexo, en página nueva.
 *  - AIFotosIndice: líneas del índice.
 *  - AIFotosGrupo: título de cada tipo de trabajo; no se queda huérfano al pie.
 *  - AIFotosFoto: párrafo centrado que contiene la foto; no se parte con su pie.
 *  - AIFotosPie: "Foto n".
 *  - AIFotosMarco: marco de la imagen, sin borde ni ajuste de texto.
 */
export const ESTILOS_ANEXO_FOTOS =
    '<style:style style:name="AIFotosTitulo" style:family="paragraph"><style:paragraph-properties fo:break-before="page" fo:margin-top="0cm" fo:margin-bottom="0.4cm" fo:keep-with-next="always"/><style:text-properties fo:font-size="16pt" fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"/></style:style><style:style style:name="AIFotosIndice" style:family="paragraph"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.12cm" fo:margin-left="0.5cm"/><style:text-properties fo:font-size="10pt"/></style:style><style:style style:name="AIFotosGrupo" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.6cm" fo:margin-bottom="0.3cm" fo:keep-with-next="always" fo:border-bottom="0.5pt solid #b8b8b8" fo:padding-bottom="0.1cm"/><style:text-properties fo:font-size="12pt" fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"/></style:style><style:style style:name="AIFotosFoto" style:family="paragraph"><style:paragraph-properties fo:text-align="center" fo:margin-top="0.3cm" fo:margin-bottom="0.1cm" fo:keep-with-next="always"/></style:style><style:style style:name="AIFotosPie" style:family="paragraph"><style:paragraph-properties fo:text-align="center" fo:margin-top="0cm" fo:margin-bottom="0.3cm"/><style:text-properties fo:font-size="9pt" fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"/></style:style><style:style style:name="AIFotosMarco" style:family="graphic"><style:graphic-properties style:wrap="none" style:vertical-pos="top" style:vertical-rel="baseline" style:horizontal-pos="center" style:horizontal-rel="paragraph" fo:margin="0cm" fo:padding="0cm" fo:border="none" draw:stroke="none" draw:fill="none"/></style:style>';

/**
 * XML del anexo: título, índice y un bloque por tipo de trabajo.
 *
 * La numeración de las fotos es CORRIDA en todo el anexo ("Foto 1" a "Foto N")
 * para que el índice pueda decir "fotos 3 a 7" y un administrador pueda
 * referirse a una foto concreta por teléfono.
 */
export function anexoFotosXml(grupos: readonly GrupoFotos[]): string {
    const conFotos = grupos.filter((g) => g.fotos.length > 0);
    if (conFotos.length === 0) return "";

    let xml = `<text:p text:style-name="AIFotosTitulo">Anexo fotográfico</text:p>`;

    // Índice.
    let desde = 1;
    for (const grupo of conFotos) {
        const hasta = desde + grupo.fotos.length - 1;
        const rango = grupo.fotos.length === 1 ? `foto ${desde}` : `fotos ${desde} a ${hasta}`;
        xml += `<text:p text:style-name="AIFotosIndice">${escaparXml(grupo.titulo)} — ${rango}</text:p>`;
        desde = hasta + 1;
    }

    // Grupos.
    let numero = 0;
    for (const grupo of conFotos) {
        xml += `<text:p text:style-name="AIFotosGrupo">${escaparXml(grupo.titulo)}</text:p>`;

        for (const foto of grupo.fotos) {
            numero++;
            const { ancho, alto } = tamanoMarco(foto);
            xml +=
                `<text:p text:style-name="AIFotosFoto">` +
                `<draw:frame draw:style-name="AIFotosMarco" draw:name="Foto ${numero}" ` +
                `text:anchor-type="as-char" svg:width="${ancho}" svg:height="${alto}" draw:z-index="1">` +
                `<draw:image xlink:href="${foto.ruta}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>` +
                `</draw:frame>` +
                `</text:p>` +
                `<text:p text:style-name="AIFotosPie">Foto ${numero}</text:p>`;
        }
    }

    return xml;
}
