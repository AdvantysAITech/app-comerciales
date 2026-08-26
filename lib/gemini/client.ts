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

export async function geminiGenerateContent(body: unknown): Promise<GeminiRespuesta> {
    const { apiKey, modelo } = getGeminiConfig();

    const response = await fetch(`${GEMINI_BASE_URL}/models/${modelo}:generateContent`, {
        method: "POST",
        headers: {
            "x-goog-api-key": apiKey,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        // Igual que en la subida de media a GHL: sin esto el fetch parcheado de
        // Next.js puede intentar cachear la petición.
        cache: "no-store",
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Error en Gemini (${response.status}): ${errorBody}`);
    }

    return response.json();
}

export { getGeminiConfig };