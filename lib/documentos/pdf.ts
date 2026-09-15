import { unzipSync, zipSync } from "fflate";

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

// ---------------------------------------------------------------------------
// Aligerado del ODT antes de convertir (15/09/2026)
// ---------------------------------------------------------------------------

/**
 * Quita las fuentes incrustadas del ODT que se envía a Gotenberg.
 *
 * La plantilla lleva incrustadas Liberation Sans y Linux Libertine G (8 ficheros
 * .ttf): son el 94 % del documento. Con ellas el ODT pesa 3,4 MB; sin ellas,
 * 0,2 MB. Linux Libertine G no se usa en ningún texto visible, y Liberation
 * Sans ya la tiene LibreOffice instalada.
 *
 * Verificado con LibreOffice sobre un presupuesto real con portada y desglose:
 * mismas 5 páginas, mismas fuentes en el PDF y las 5 páginas idénticas píxel a
 * píxel con y sin las fuentes incrustadas.
 *
 * Se hace AQUÍ y no en `postprocesarOdt` a propósito: solo afecta a la copia
 * que se convierte. Si la conversión falla y se publica el ODT, ese ODT sigue
 * llevando sus fuentes.
 */
export function aligerarParaConversion(odt: ArrayBuffer): ArrayBuffer {
    const entradas = unzipSync(new Uint8Array(odt));
    const fuentes = Object.keys(entradas).filter((n) => n.startsWith("Fonts/"));
    if (fuentes.length === 0) return odt;

    const dec = new TextDecoder("utf-8");
    const enc = new TextEncoder();

    for (const nombre of fuentes) delete entradas[nombre];

    // Sin la referencia, LibreOffice buscaría un fichero que ya no está.
    for (const nombre of ["content.xml", "styles.xml"]) {
        if (!entradas[nombre]) continue;
        entradas[nombre] = enc.encode(
            dec.decode(entradas[nombre]).replace(/<svg:font-face-src>[\s\S]*?<\/svg:font-face-src>/g, "")
        );
    }

    // Un manifiesto que declara ficheros ausentes hace que algunos lectores
    // den el documento por dañado.
    if (entradas["META-INF/manifest.xml"]) {
        entradas["META-INF/manifest.xml"] = enc.encode(
            dec
                .decode(entradas["META-INF/manifest.xml"])
                .replace(/<manifest:file-entry[^>]*manifest:full-path="Fonts\/[^"]*"[^>]*\/>/g, "")
        );
    }

    if (entradas["settings.xml"]) {
        entradas["settings.xml"] = enc.encode(
            dec
                .decode(entradas["settings.xml"])
                .replace(
                    /(config:name="EmbedFonts" config:type="boolean">)true</,
                    "$1false<"
                )
        );
    }

    // mimetype primero y sin comprimir: es como se reconoce un ODT.
    const salida: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
    if (entradas["mimetype"]) salida["mimetype"] = [entradas["mimetype"], { level: 0 }];
    for (const [nombre, datos] of Object.entries(entradas)) {
        if (nombre !== "mimetype") salida[nombre] = [datos, { level: 6 }];
    }

    const zip = zipSync(salida);
    return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Conversión
// ---------------------------------------------------------------------------

/** Intentos totales. Gotenberg indica que un fallo de recursos se puede reintentar. */
const INTENTOS = 2;

/**
 * Tiempo máximo por intento. Dos intentos más la espera tienen que caber, con
 * la descarga del ODT y la subida a GHL, en los 60 s de la función.
 */
const TIEMPO_MAXIMO_INTENTO_MS = 20_000;

const ESPERA_ENTRE_INTENTOS_MS = 1_500;

/**
 * Estados que merecen un segundo intento. 500 es "LibreOffice failed to
 * convert", que Gotenberg describe como problema de recursos y reintentable;
 * 502/503 son el proxy o el servicio saturados. Un 400 o un 401 no se arreglan
 * repitiendo.
 */
const ESTADOS_REINTENTABLES = new Set([500, 502, 503]);

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

    const ligero = aligerarParaConversion(odt);

    let ultimoError: ConversionPdfError | null = null;

    for (let intento = 1; intento <= INTENTOS; intento++) {
        const resultado = await intentarConversion(base, ligero, nombre);
        if (resultado.ok) return resultado.pdf;

        ultimoError = resultado.error;
        if (!resultado.reintentable || intento === INTENTOS) break;

        console.warn(`[pdf] ${nombre}: intento ${intento} fallido, se reintenta. ${resultado.error.message}`);
        await new Promise((r) => setTimeout(r, ESPERA_ENTRE_INTENTOS_MS));
    }

    throw ultimoError ?? new ConversionPdfError("La conversión falló sin detalle.");
}

type ResultadoIntento =
    | { ok: true; pdf: ArrayBuffer }
    | { ok: false; error: ConversionPdfError; reintentable: boolean };

async function intentarConversion(base: string, odt: ArrayBuffer, nombre: string): Promise<ResultadoIntento> {
    const formulario = new FormData();
    formulario.append("files", new Blob([odt], { type: "application/vnd.oasis.opendocument.text" }), nombre);

    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), TIEMPO_MAXIMO_INTENTO_MS);

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
        // Un tiempo agotado no se reintenta: un segundo intento igual de lento
        // se saldría del límite de la función.
        if (error instanceof Error && error.name === "AbortError") {
            return {
                ok: false,
                reintentable: false,
                error: new ConversionPdfError(
                    `El servicio de conversión ha tardado más de ${TIEMPO_MAXIMO_INTENTO_MS / 1000} s.`
                ),
            };
        }
        const motivo = error instanceof Error ? error.message : "error desconocido";
        return {
            ok: false,
            reintentable: true,
            error: new ConversionPdfError(`No se ha podido contactar con el servicio de conversión: ${motivo}`),
        };
    } finally {
        clearTimeout(temporizador);
    }

    // El 401 se distingue del resto: no es un problema del documento sino de
    // configuración, y el mensaje genérico manda a mirar donde no es.
    if (respuesta.status === 401) {
        return {
            ok: false,
            reintentable: false,
            error: new ConversionPdfError(
                "El servicio de conversión rechazó las credenciales (401). Revisa GOTENBERG_USER y " +
                    "GOTENBERG_PASSWORD en .env.local y en las variables de entorno de Vercel. " +
                    "La contraseña va en texto plano, no el hash del Caddyfile."
            ),
        };
    }

    if (!respuesta.ok) {
        const cuerpo = await respuesta.text().catch(() => "");
        return {
            ok: false,
            reintentable: ESTADOS_REINTENTABLES.has(respuesta.status),
            error: new ConversionPdfError(
                `El servicio de conversión rechazó la petición (${respuesta.status}): ${cuerpo.slice(0, 300)}`
            ),
        };
    }

    const pdf = await respuesta.arrayBuffer();

    // Un 200 no garantiza un PDF: un proxy mal configurado devuelve HTML con
    // 200 tan tranquilo, y ese HTML acabaría adjuntado a la oportunidad con
    // extensión .pdf. Un PDF empieza por "%PDF".
    const cabecera = new Uint8Array(pdf.slice(0, 4));
    const esPdf =
        cabecera[0] === 0x25 && cabecera[1] === 0x50 && cabecera[2] === 0x44 && cabecera[3] === 0x46;

    if (!esPdf) {
        return {
            ok: false,
            reintentable: false,
            error: new ConversionPdfError(
                `Lo devuelto por el servicio de conversión no es un PDF (${pdf.byteLength} bytes, ` +
                    `no empieza por "%PDF"). Comprueba GOTENBERG_URL.`
            ),
        };
    }

    return { ok: true, pdf };
}

/** "SV-2026-0005.odt" -> "SV-2026-0005.pdf" */
export function nombrePdf(nombreOdt: string): string {
    return nombreOdt.replace(/\.odt$/i, "") + ".pdf";
}