import { geminiGenerateContent } from "./client";

/**
 * Transcripción de las observaciones dictadas por el comercial (DERCAS §6.2:
 * "descripción libre en texto o audio").
 *
 * El audio viaja como `inlineData` en base64. El límite duro de la petición
 * completa son 20 MB, así que aquí se corta antes para dejar margen al resto
 * del cuerpo. Un WAV mono a 16 kHz ocupa ~1,9 MB por minuto: con 15 MB caben
 * unos 8 minutos de dictado, de sobra para una observación de visita.
 */

/**
 * MIME admitidos por Gemini para audio. `audio/webm` NO está en la lista, que
 * es justo lo que graba Chrome en Android: el cliente convierte a WAV antes de
 * subir (ver `lib/audio/wav.ts`). Esta comprobación es la red de seguridad.
 */
const MIME_ADMITIDOS = [
    "audio/wav",
    "audio/mp3",
    "audio/mpeg",
    "audio/aiff",
    "audio/aac",
    "audio/ogg",
    "audio/flac",
];

const TAMANO_MAXIMO_BYTES = 15 * 1024 * 1024;

/**
 * El vocabulario de obra se le da explícito al modelo. Sin esto, "Geolite T40"
 * sale como "geo light" y "peto" como "petó". Los términos vienen del catálogo
 * de partidas: si crece el árbol, conviene ampliar esta lista.
 */
const INSTRUCCION = [
    "Transcribe literalmente el audio, que está en español de España.",
    "Es el dictado de un comercial durante una visita técnica a una comunidad de propietarios,",
    "en el sector de rehabilitación de fachadas y cubiertas.",
    "",
    "Reglas:",
    "- Devuelve ÚNICAMENTE la transcripción. Sin preámbulos, sin comillas, sin comentarios.",
    "- No resumas, no corrijas el contenido y no añadas nada que no se haya dicho.",
    "- Corrige solo puntuación y mayúsculas para que el texto se lea bien.",
    "- Escribe las cifras en dígitos y las unidades abreviadas: 25 m2, 12 ml, 3 ud.",
    "- Si el audio está vacío o es ininteligible, devuelve una cadena vacía.",
    "",
    "Vocabulario habitual: peto, casetón, bajante, fibrocemento, caravista, zaguán,",
    "medianera, patio de luces, descuelgue, bimástil, andamio tubular, tela asfáltica,",
    "EPDM, Geolite T40, mortero M-7,5, hidrófugo, revestimiento elástico, forjado, roza.",
].join("\n");

export type ResultadoTranscripcion = {
    texto: string;
    /** Vacío cuando el modelo no ha oído nada aprovechable. Lo decide la UI. */
    vacio: boolean;
};

export async function transcribirAudio(archivo: File): Promise<ResultadoTranscripcion> {
    const mimeType = normalizarMime(archivo.type);

    if (!MIME_ADMITIDOS.includes(mimeType)) {
        throw new Error(
            `Formato de audio no admitido por Gemini: "${archivo.type || "desconocido"}". ` +
                `Admitidos: ${MIME_ADMITIDOS.join(", ")}.`
        );
    }

    if (archivo.size === 0) {
        throw new Error("El audio recibido está vacío");
    }

    if (archivo.size > TAMANO_MAXIMO_BYTES) {
        throw new Error(
            `El audio pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el máximo son ` +
                `${TAMANO_MAXIMO_BYTES / 1024 / 1024} MB. Graba una nota más corta.`
        );
    }

    const base64 = Buffer.from(await archivo.arrayBuffer()).toString("base64");

    const respuesta = await geminiGenerateContent({
        contents: [
            {
                role: "user",
                parts: [{ text: INSTRUCCION }, { inlineData: { mimeType, data: base64 } }],
            },
        ],
        generationConfig: {
            // Transcribir no es una tarea creativa: cuanto más determinista, mejor.
            temperature: 0,
        },
    });

    if (respuesta.promptFeedback?.blockReason) {
        throw new Error(`Gemini bloqueó la petición: ${respuesta.promptFeedback.blockReason}`);
    }

    const texto = (respuesta.candidates?.[0]?.content?.parts ?? [])
        .map((parte) => parte.text ?? "")
        .join("")
        .trim();

    return { texto, vacio: texto.length === 0 };
}

/** `MediaRecorder` devuelve cosas como "audio/wav;codecs=1". Gemini quiere el MIME pelado. */
function normalizarMime(mime: string): string {
    return mime.split(";")[0].trim().toLowerCase();
}