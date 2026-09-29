import type { PayloadVisita } from "@/lib/visita/payload";
import { dimensionesImagen } from "./anexoFotos";
import type { ImagenPortada } from "./portada";

/**
 * lib/documentos/imagenPortada.ts
 *
 * Descarga la foto que ocupa la parte de arriba de la portada (29/09/2026).
 *
 * De dónde sale, por orden:
 *   1. La "Imagen de portada" que sube el comercial en el formulario.
 *   2. Si no hay (visitas anteriores al cambio, o el comercial no la ha
 *      subido), la primera foto de los tipos de trabajo: la portada sale con
 *      una foto real de la obra en vez de con el fondo liso.
 *   3. Si tampoco hay fotos, o la descarga falla, `null`: la portada se pinta
 *      con fondo azul noche. Nunca bloquea la emisión.
 *
 * La foto va incrustada en el SVG y de ahí al PNG de la portada, así que se
 * limita el tamaño: una foto de 1920 px normalizada en el móvil ronda los
 * 300-600 KB. Algo muy por encima de eso no es una foto normalizada.
 */

const TIEMPO_MAXIMO_MS = 10_000;
const BYTES_MAXIMOS = 8 * 1024 * 1024;

/** URL de la foto de portada de la visita, o `null` si no hay ninguna. */
export function urlImagenPortada(payload: PayloadVisita): string | null {
    const elegida = typeof payload.imagenPortada === "string" ? payload.imagenPortada.trim() : "";
    if (elegida) return elegida;

    for (const modulo of payload.modulos) {
        const primera = (modulo.fotos ?? []).find((u) => typeof u === "string" && u.trim() !== "");
        if (primera) return primera;
    }
    return null;
}

/**
 * Descarga y valida la foto de portada.
 *
 * NUNCA lanza. Si algo falla, deja el motivo en `avisos` y devuelve `null`.
 */
export async function prepararImagenPortada(
    payload: PayloadVisita,
    avisos: string[]
): Promise<ImagenPortada | null> {
    const url = urlImagenPortada(payload);
    if (!url) return null;

    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS);

    try {
        // `no-store`: el fetch parcheado de Next.js cachea y manipula binarios
        // si no se le dice lo contrario (ver learnings).
        const respuesta = await fetch(url, { cache: "no-store", signal: control.signal });
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

        const datos = new Uint8Array(await respuesta.arrayBuffer());
        if (datos.byteLength > BYTES_MAXIMOS) {
            throw new Error(`ocupa ${Math.round(datos.byteLength / 1024 / 1024)} MB`);
        }

        const dimensiones = dimensionesImagen(datos);
        if (!dimensiones) throw new Error("no es JPEG ni PNG");

        return { ...dimensiones, datos };
    } catch (error) {
        const motivo =
            error instanceof Error && error.name === "AbortError"
                ? "la descarga ha tardado demasiado"
                : error instanceof Error
                  ? error.message
                  : "error desconocido";
        avisos.push(`Portada sin foto: no se ha podido usar la imagen de portada (${motivo}).`);
        return null;
    } finally {
        clearTimeout(temporizador);
    }
}