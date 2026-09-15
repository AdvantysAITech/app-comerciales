import type { SubcuentaSlug } from "@/lib/subcuenta";

/**
 * Plantilla ODT de presupuesto, por subcuenta.
 *
 * La app de documentos exige el fichero en CADA generación: `Template` figura
 * como opcional en su Swagger, pero el servidor responde 400 "Debe
 * proporcionarse una plantilla ODT" si falta (verificado, TEST-002). Son ~3,2 MB
 * por llamada y no hay forma de pre-registrarla.
 *
 * Por eso NO vive en /public: iría al bundle de Vercel, 3,2 MB por empresa y por
 * despliegue. Vive en GHL Media Storage, se descarga aquí y se reenvía. Así
 * Miguel puede sustituirla sin redeploy, que es justo lo que va a pasar cuando
 * cambien los datos fiscales o el logo (DERCAS 5.1).
 *
 * ADVERTENCIA sobre el fichero: la plantilla NO se abre y se vuelve a guardar
 * en LibreOffice ni en Word. El editor fragmenta los tokens {{...}} entre varios
 * <text:span> y la sustitución falla EN SILENCIO: el documento sale con el campo
 * en blanco y nadie se entera. Ya pasó con {{doc.FechaEmision}}, que llegó
 * partido en tres runs. Si hay que retocarla, se retoca y luego se verifica.
 */

/**
 * La URL se lee en CADA llamada, no al importar el módulo.
 *
 * Con una constante de módulo, el valor queda congelado en el instante en que
 * se importa este fichero. En Next.js da igual, porque el entorno ya está
 * cargado; en un script no: `import` se evalúa ANTES que el `dotenv.config()`
 * del propio script, aunque en el código aparezca después. El resultado era
 * "No hay plantilla configurada" con la variable perfectamente puesta en
 * .env.local.
 */
function urlPlantilla(subcuenta: string): string | undefined {
    const url =
        subcuenta === "scala-valencia"
            ? process.env.SOLUCIONA_PLANTILLA_SCALA_URL
            : subcuenta === "vertical-projects"
              ? process.env.SOLUCIONA_PLANTILLA_VERTICAL_URL
              : undefined;

    return url?.trim() || undefined;
}

const NOMBRE_PLANTILLA: Record<string, string> = {
    "scala-valencia": "Plantilla_Presupuesto_Scala.odt",
    "vertical-projects": "Plantilla_Presupuesto_Vertical.odt",
};

export type Plantilla = { nombre: string; contenido: ArrayBuffer };

/**
 * Caché en memoria del proceso.
 *
 * La plantilla cambia muy de tarde en tarde y pesa 3,2 MB: descargarla en cada
 * presupuesto es tiempo y ancho de banda tirados. En serverless la caché muere
 * con la instancia, que es un TTL razonable sin tener que invalidar nada.
 */
const cache = new Map<string, Plantilla>();

export async function obtenerPlantilla(subcuenta: SubcuentaSlug): Promise<Plantilla> {
    const cacheada = cache.get(subcuenta);
    if (cacheada) return cacheada;

    const url = urlPlantilla(subcuenta);
    if (!url) {
        throw new Error(
            `No hay plantilla configurada para "${subcuenta}". Sube el .odt a GHL Media Storage ` +
                `y pon su URL en .env.local (SOLUCIONA_PLANTILLA_*_URL).`
        );
    }

    // `cache: "no-store"`: el fetch parcheado de Next.js corrompe descargas
    // binarias al intentar cachearlas. Mismo motivo que en las subidas a GHL.
    const respuesta = await fetch(url, { cache: "no-store" });
    if (!respuesta.ok) {
        throw new Error(`No se pudo descargar la plantilla de "${subcuenta}" (${respuesta.status}).`);
    }

    const contenido = await respuesta.arrayBuffer();
    verificarEsOdt(contenido, subcuenta);

    const plantilla: Plantilla = { nombre: NOMBRE_PLANTILLA[subcuenta], contenido };
    cache.set(subcuenta, plantilla);
    return plantilla;
}

/**
 * Comprobación barata de que lo descargado es un ODT y no una página de error.
 *
 * Un enlace caducado de Media Storage devuelve 200 con HTML. Sin esta
 * comprobación mandaríamos ese HTML como plantilla y la app respondería algo
 * genérico, mandándonos a buscar el fallo al sitio equivocado. Un ODT es un ZIP:
 * empieza por "PK" y su primera entrada es `mimetype` sin comprimir.
 */
function verificarEsOdt(contenido: ArrayBuffer, subcuenta: string): void {
    const cabecera = new Uint8Array(contenido.slice(0, 4));
    const esZip = cabecera[0] === 0x50 && cabecera[1] === 0x4b;

    if (!esZip) {
        throw new Error(
            `Lo descargado como plantilla de "${subcuenta}" no es un ODT (${contenido.byteLength} bytes). ` +
                `Comprueba que la URL de Media Storage sigue siendo válida.`
        );
    }
}

/** Vacía la caché. Para usar tras sustituir la plantilla sin redesplegar. */
export function invalidarPlantilla(subcuenta?: SubcuentaSlug): void {
    if (subcuenta) cache.delete(subcuenta);
    else cache.clear();
}