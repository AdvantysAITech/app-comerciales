import type { PayloadVisita } from "@/lib/visita/payload";
import { dimensionesImagen } from "./anexoFotos";
import type { ImagenPortada } from "./portada";

/**
 * lib/documentos/imagenPortada.ts
 *
 * Descarga la foto que ocupa la parte de arriba de la portada (29/09/2026).
 *
 * De dónde sale, por orden (si una falla se prueba la siguiente):
 *   1. La "Imagen de portada" que sube el comercial en el formulario.
 *   2. La primera foto de cada tipo de trabajo, en orden: visitas anteriores
 *      al cambio, o la imagen de portada borrada en GHL / ilegible.
 *   3. Si ninguna vale, `null`: la portada se pinta con fondo azul noche.
 *      Nunca bloquea la emisión.
 *
 * La foto va incrustada en el SVG y de ahí al PNG de la portada. Una foto
 * normalizada en el móvil (1920 px, ~300-600 KB) va sobrada. Se limitan bytes
 * Y píxeles: un PNG muy comprimido de 10.000 x 10.000 px pesa 300 KB pero
 * rasterizarlo se come ~800 MB de memoria, y un fallo de memoria no lo recoge
 * ningún try/catch: tumbaría el cierre del documento entero, no solo la foto.
 */

const TIEMPO_MAXIMO_MS = 10_000;
const BYTES_MAXIMOS = 8 * 1024 * 1024;
/** 25 megapíxeles: una foto de móvil sin normalizar (12-48 MP) ya entra justa. */
const PIXELES_MAXIMOS = 25_000_000;
/** Candidatas que se prueban como mucho. Cada una puede tardar hasta 10 s. */
const MAXIMO_INTENTOS = 3;

const esUrl = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//i.test(v.trim());

/** URLs candidatas a foto de portada, por orden de preferencia y sin repetir. */
export function candidatasImagenPortada(payload: PayloadVisita): string[] {
    const candidatas: string[] = [];
    if (esUrl(payload.imagenPortada)) candidatas.push(payload.imagenPortada.trim());
    for (const modulo of payload.modulos ?? []) {
        const primera = (modulo.fotos ?? []).find(esUrl);
        if (primera) candidatas.push(primera.trim());
    }
    return [...new Set(candidatas)];
}

/** Primera candidata, o `null`. Para mostrar qué foto se usaría. */
export function urlImagenPortada(payload: PayloadVisita): string | null {
    return candidatasImagenPortada(payload)[0] ?? null;
}

async function descargar(url: string): Promise<ImagenPortada> {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS);

    try {
        // `no-store`: el fetch parcheado de Next.js cachea y manipula binarios
        // si no se le dice lo contrario (ver learnings).
        const respuesta = await fetch(url, { cache: "no-store", signal: control.signal });
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

        // Si el servidor anuncia el tamaño, se rechaza antes de descargar nada.
        const anunciado = Number(respuesta.headers.get("content-length"));
        if (Number.isFinite(anunciado) && anunciado > BYTES_MAXIMOS) {
            await respuesta.body?.cancel();
            throw new Error(`ocupa ${Math.round(anunciado / 1024 / 1024)} MB`);
        }

        const datos = new Uint8Array(await respuesta.arrayBuffer());
        if (datos.byteLength > BYTES_MAXIMOS) {
            throw new Error(`ocupa ${Math.round(datos.byteLength / 1024 / 1024)} MB`);
        }

        const dimensiones = dimensionesImagen(datos);
        if (!dimensiones) throw new Error("no es JPEG ni PNG");
        if (dimensiones.ancho * dimensiones.alto > PIXELES_MAXIMOS) {
            throw new Error(`demasiado grande (${dimensiones.ancho} x ${dimensiones.alto} px)`);
        }

        return { ...dimensiones, datos };
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new Error("la descarga ha tardado demasiado");
        }
        throw error;
    } finally {
        clearTimeout(temporizador);
    }
}

/**
 * Descarga y valida la foto de portada, probando las candidatas en orden.
 *
 * NUNCA lanza. Lo que falla queda en `avisos` y, si no vale ninguna, devuelve
 * `null`.
 */
export async function prepararImagenPortada(
    payload: PayloadVisita,
    avisos: string[]
): Promise<ImagenPortada | null> {
    const candidatas = candidatasImagenPortada(payload).slice(0, MAXIMO_INTENTOS);

    for (const [i, url] of candidatas.entries()) {
        try {
            return await descargar(url);
        } catch (error) {
            const motivo = error instanceof Error ? error.message : "error desconocido";
            const cual = i === 0 && esUrl(payload.imagenPortada) ? "la imagen de portada" : "una foto de los trabajos";
            avisos.push(`Portada: no se ha podido usar ${cual} (${motivo}).`);
        }
    }

    if (candidatas.length > 0) avisos.push("Portada sin foto: ninguna imagen se ha podido usar.");
    return null;
}