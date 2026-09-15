/**
 * lib/documentos/pdf.ts
 *
 * Conversión del ODT a PDF.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ HACE FALTA
 * ---------------------------------------------------------------------------
 * El ODT es correcto, pero cada visor lo renderiza a su manera. Comprobado el
 * 10/09/2026: el mismo documento sale con 5 páginas limpias en LibreOffice y
 * con una página fantasma -- solo cabecera y pie -- en Google Docs, que es
 * justo donde va a abrirlo cualquiera que reciba un enlace de Drive.
 *
 * Eso no se arregla peleándose con el ODF. Se arregla enviando PDF, que se ve
 * igual en todas partes. Y es además lo que Miguel espera ver (decisión de
 * Jacob, 10/09/2026).
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ UN SERVICIO EXTERNO Y NO AQUÍ
 * ---------------------------------------------------------------------------
 * Convertir ODF a PDF con fidelidad es LibreOffice. No cabe en una función
 * serverless ni por tamaño ni por tiempo de arranque. Se delega en Gotenberg,
 * que es LibreOffice detrás de una API HTTP: el MISMO motor con el que hemos
 * verificado que el documento se ve bien.
 *
 * El contrato es una sola función. Cambiar a otro proveedor es reescribir
 * `convertirAPdf` y nada más: ni las rutas ni el resto del pipeline lo saben.
 *
 * ---------------------------------------------------------------------------
 * AUTENTICACIÓN (añadido 14/09/2026)
 * ---------------------------------------------------------------------------
 * Gotenberg no tiene autenticación propia: cualquiera que alcance el puerto
 * puede convertir documentos. Nuestra instancia (gotenberg.advantys.ai, EC2
 * eu-north-1) está detrás de un Caddy que exige basic auth, así que toda
 * petición debe llevar cabecera Authorization o responde 401.
 *
 * Credenciales en GOTENBERG_USER / GOTENBERG_PASSWORD, en texto plano: el
 * hash bcrypt vive en el Caddyfile del servidor y solo sirve para verificar.
 */

/** Extensión y tipo del resultado, para quien tenga que nombrarlo o subirlo. */
export const MIMETYPE_PDF = "application/pdf";

export class ConversionPdfError extends Error {
    constructor(mensaje: string) {
        super(mensaje);
        this.name = "ConversionPdfError";
    }
}

function urlServicio(): string {
    const url = process.env.GOTENBERG_URL?.trim();
    if (!url) {
        throw new ConversionPdfError(
            "Falta GOTENBERG_URL en .env.local. Sin servicio de conversión no se puede producir " +
                "el PDF; el presupuesto se publicará en ODT."
        );
    }
    return url.replace(/\/+$/, "");
}

/**
 * Cabecera de autenticación del servicio.
 *
 * Devuelve un objeto vacío si no hay credenciales configuradas: así el módulo
 * sigue funcionando contra una instancia sin proteger (desarrollo local con
 * Gotenberg en Docker, por ejemplo) sin necesidad de tocar código.
 */
function cabeceras(): Record<string, string> {
    const usuario = process.env.GOTENBERG_USER?.trim();
    const password = process.env.GOTENBERG_PASSWORD;

    if (!usuario || !password) return {};

    const credencial = Buffer.from(`${usuario}:${password}`).toString("base64");
    return { Authorization: `Basic ${credencial}` };
}

/** Si el servicio está configurado. Para decidir sin provocar una excepción. */
export function conversionDisponible(): boolean {
    return Boolean(process.env.GOTENBERG_URL?.trim());
}

/**
 * Convierte un ODT a PDF.
 *
 * `nombre` importa: Gotenberg decide el conversor por la EXTENSIÓN del fichero
 * que recibe. Si se le manda como "documento" sin extensión, o con una que no
 * reconoce, responde 400.
 */
export async function convertirAPdf(odt: ArrayBuffer, nombre: string): Promise<ArrayBuffer> {
    const base = urlServicio();

    if (!nombre.toLowerCase().endsWith(".odt")) {
        throw new ConversionPdfError(
            `El fichero a convertir debe llamarse *.odt (recibido: "${nombre}"). ` +
                `El servicio elige el conversor por la extensión.`
        );
    }

    const formulario = new FormData();
    formulario.append("files", new Blob([odt], { type: "application/vnd.oasis.opendocument.text" }), nombre);

    // Un ODT de 3 MB con LibreOffice arrancando de cero puede irse a varios
    // segundos. Se corta a 45 s: por encima de eso, el comercial lleva
    // demasiado tiempo esperando y sale mejor publicar en ODT.
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), 45_000);

    let respuesta: Response;
    try {
        respuesta = await fetch(`${base}/forms/libreoffice/convert`, {
            method: "POST",
            headers: cabeceras(),
            // OBLIGATORIO. El fetch parcheado de Next.js corrompe el stream
            // binario del FormData al intentar cachear la petición. Mismo
            // motivo que en Soluciona y en GHL Media Storage.
            cache: "no-store",
            body: formulario,
            signal: control.signal,
        });
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new ConversionPdfError("El servicio de conversión ha tardado más de 45 s.");
        }
        const motivo = error instanceof Error ? error.message : "error desconocido";
        throw new ConversionPdfError(`No se ha podido contactar con el servicio de conversión: ${motivo}`);
    } finally {
        clearTimeout(temporizador);
    }

    // El 401 se distingue del resto: no es un problema del documento sino de
    // configuración, y el mensaje genérico manda a mirar donde no es.
    if (respuesta.status === 401) {
        throw new ConversionPdfError(
            "El servicio de conversión rechazó las credenciales (401). Revisa GOTENBERG_USER y " +
                "GOTENBERG_PASSWORD en .env.local y en las variables de entorno de Vercel. " +
                "La contraseña va en texto plano, no el hash del Caddyfile."
        );
    }

    if (!respuesta.ok) {
        const cuerpo = await respuesta.text().catch(() => "");
        throw new ConversionPdfError(
            `El servicio de conversión rechazó la petición (${respuesta.status}): ${cuerpo.slice(0, 300)}`
        );
    }

    const pdf = await respuesta.arrayBuffer();

    // Un 200 no garantiza un PDF: un proxy mal configurado devuelve HTML con
    // 200 tan tranquilo, y ese HTML acabaría adjuntado a la oportunidad con
    // extensión .pdf. Un PDF empieza por "%PDF".
    const cabecera = new Uint8Array(pdf.slice(0, 4));
    const esPdf =
        cabecera[0] === 0x25 && cabecera[1] === 0x50 && cabecera[2] === 0x44 && cabecera[3] === 0x46;

    if (!esPdf) {
        throw new ConversionPdfError(
            `Lo devuelto por el servicio de conversión no es un PDF (${pdf.byteLength} bytes, ` +
                `no empieza por "%PDF"). Comprueba GOTENBERG_URL.`
        );
    }

    return pdf;
}

/** "SV-2026-0005.odt" -> "SV-2026-0005.pdf" */
export function nombrePdf(nombreOdt: string): string {
    return nombreOdt.replace(/\.odt$/i, "") + ".pdf";
}