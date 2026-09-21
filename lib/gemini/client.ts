/**
 * Cliente de la API de Gemini.
 *
 * Mismo patrón que `lib/ghl/client.ts`: credenciales desde entorno, un único
 * punto de salida a la red y errores con el cuerpo real de la respuesta, que es
 * lo que ahorra tiempo cuando algo falla en producción.
 *
 * Se usa `generateContent` y no la Interactions API: la propia documentación de
 * Google recomienda seguir en generateContent para despliegues estables.
 */

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/** Modelo por defecto si no se fija en entorno. GA desde el 21/07/2026. */
const MODELO_POR_DEFECTO = "gemini-3.6-flash";

type GeminiConfig = {
    apiKey: string;
    modelo: string;
};

function getGeminiConfig(): GeminiConfig {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error("Falta GEMINI_API_KEY en .env.local");
    }

    return {
        apiKey,
        modelo: process.env.GEMINI_MODELO_TRANSCRIPCION || MODELO_POR_DEFECTO,
    };
}

/** Forma mínima de la respuesta de generateContent que nos interesa. */
export type GeminiRespuesta = {
    candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
    }>;
    promptFeedback?: { blockReason?: string };
};

/**
 * Error de Gemini con el código HTTP accesible.
 *
 * POR QUÉ NO BASTA UN `Error` NORMAL (18/09/2026): quien llama necesita
 * distinguir un 429 (cuota agotada: reintentar es contraproducente) de un 503
 * (modelo saturado: reintentar con espera es justo lo correcto). Con el código
 * enterrado en el texto del mensaje habría que parsear cadenas.
 */
export class ErrorGemini extends Error {
    constructor(
        public readonly status: number,
        mensaje: string
    ) {
        super(mensaje);
        this.name = "ErrorGemini";
    }
}

/**
 * Corte de la llamada a Gemini.
 *
 * ES OBLIGATORIO Y FALTABA. Sin él, una llamada que se queda colgada agota los
 * 60 s de la función y Vercel devuelve un 504 de plataforma que NI SIQUIERA ES
 * JSON: el cliente reventaba al parsearlo. Detectado en producción el
 * 18/09/2026 con tres 504 seguidos de 60.001 ms exactos.
 *
 * 35 s deja margen para responder con un error legible dentro del minuto.
 */
const TIEMPO_MAXIMO_MS = 35000;

export async function geminiGenerateContent(body: unknown): Promise<GeminiRespuesta> {
    const { apiKey, modelo } = getGeminiConfig();

    const controlador = new AbortController();
    const corte = setTimeout(() => controlador.abort(), TIEMPO_MAXIMO_MS);

    let response: Response;

    try {
        response = await fetch(`${GEMINI_BASE_URL}/models/${modelo}:generateContent`, {
            method: "POST",
            headers: {
                "x-goog-api-key": apiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal: controlador.signal,
            // Igual que en la subida de media a GHL: sin esto el fetch parcheado de
            // Next.js puede intentar cachear la petición.
            cache: "no-store",
        });
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            throw new ErrorGemini(504, `Gemini no ha respondido en ${TIEMPO_MAXIMO_MS / 1000} segundos`);
        }
        throw error;
    } finally {
        clearTimeout(corte);
    }

    if (!response.ok) {
        const errorBody = await response.text();
        throw new ErrorGemini(response.status, `Error en Gemini (${response.status}): ${errorBody}`);
    }

    return response.json();
}

export { getGeminiConfig };