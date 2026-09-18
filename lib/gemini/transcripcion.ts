import { ErrorGemini, geminiGenerateContent } from "./client";

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

/**
 * Tope por petición.
 *
 * El límite duro de Gemini son 20 MB, pero el que manda es otro: el cuerpo de
 * una petición a una función de Vercel no puede pasar de 4,5 MB (413
 * FUNCTION_PAYLOAD_TOO_LARGE). Se corta en 4 MB para dejar margen al resto del
 * multipart. El cliente trocea en segmentos de 30 s (~960 KB), así que en la
 * práctica nunca se llega aquí: esto es la red de seguridad.
 */
const TAMANO_MAXIMO_BYTES = 4 * 1024 * 1024;

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
    "Formato de salida: UN ÚNICO PÁRRAFO DE TEXTO CORRIDO.",
    "",
    "PROHIBIDO, sin excepción:",
    "- Marcas de tiempo de cualquier tipo. Nada de 00:03.221, 00:00:03,221 ni '-->'.",
    "- Formato de subtítulos (SRT, WebVTT), numeración de líneas o saltos por frase.",
    "- Etiquetas de hablante, viñetas, encabezados, comillas o comentarios tuyos.",
    "- Repetir una frase que ya has transcrito.",
    "",
    "Reglas:",
    "- Devuelve ÚNICAMENTE la transcripción. Sin preámbulos.",
    "- No resumas, no corrijas el contenido y no añadas nada que no se haya dicho.",
    "- Corrige solo puntuación y mayúsculas para que el texto se lea bien.",
    "- Escribe las cifras en dígitos y las unidades abreviadas: 25 m2, 12 ml, 3 ud.",
    "- El audio puede ser un fragmento de un dictado más largo: puede empezar o",
    "  terminar a media frase. Transcribe lo que oigas y no intentes completarlo.",
    "- Si el audio está vacío o es ininteligible, devuelve una cadena vacía.",
    "",
    "Vocabulario habitual: peto, casetón, bajante, fibrocemento, caravista, zaguán,",
    "medianera, patio de luces, descuelgue, bimástil, andamio tubular, tela asfáltica,",
    "EPDM, Geolite T40, mortero M-7,5, hidrófugo, revestimiento elástico, forjado, roza,",
    "canto de forjado, armadura vista, coronación, cota cero, zanja, rodapié.",
].join("\n");

/**
 * Red de seguridad sobre la salida del modelo.
 *
 * POR QUÉ EXISTE (18/09/2026): con el prompt anterior, un fragmento salió en
 * formato WebVTT entero ("00:03.221 --> 00:08.061"), partiendo palabras por la
 * mitad ("caset|ón", "ami|anto"). El prompt nuevo lo prohíbe explícitamente,
 * pero una instrucción no es una garantía: si vuelve a ocurrir, es preferible
 * limpiarlo aquí a que el comercial reciba subtítulos en el campo de
 * observaciones.
 *
 * También colapsa frases repetidas consecutivas, que es como se manifiesta el
 * atasco del modelo cuando un fragmento empieza a media palabra.
 */
export function limpiarTranscripcion(texto: string): string {
    /**
     * Las marcas se sustituyen por un espacio y NO se intenta reconstruir las
     * palabras que hayan quedado partidas ("caset ón").
     *
     * Se probó a reunirlas mirando si a la derecha había una minúscula, y el
     * resultado fue peor: "2 bajantes [marca] de fibrocemento" se convertía en
     * "bajantesde". Sin diccionario no hay forma de distinguir una palabra
     * partida de un espacio legítimo, y estropear texto correcto es peor que
     * dejar un espacio feo en un caso raro. La defensa de verdad está en el
     * prompt, que prohíbe las marcas, y en cortar el audio en silencio.
     */
    const sinMarcas = texto
        // 00:03.221 --> 00:08.061  y  00:00:03,221 --> 00:00:08,061
        .replace(/\d{1,2}:\d{2}(:\d{2})?[.,]\d{1,3}\s*-->\s*\d{1,2}:\d{2}(:\d{2})?[.,]\d{1,3}/g, " ")
        // Marcas sueltas tipo [00:12] o (00:12.3)
        .replace(/[[(]\s*\d{1,2}:\d{2}(:\d{2})?([.,]\d{1,3})?\s*[\])]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    // Frases idénticas seguidas: se deja una.
    const frases = sinMarcas.split(/(?<=[.!?])\s+/);
    const limpias: string[] = [];

    for (const frase of frases) {
        const anterior = limpias[limpias.length - 1];
        if (anterior && anterior.toLowerCase() === frase.toLowerCase()) continue;
        limpias.push(frase);
    }

    return limpias.join(" ").trim();
}

export type ResultadoTranscripcion = {
    texto: string;
    /** Vacío cuando el modelo no ha oído nada aprovechable. Lo decide la UI. */
    vacio: boolean;
};

/**
 * Traduce los errores de Gemini a algo que un comercial pueda entender y que
 * el cliente pueda usar para decidir si reintenta.
 *
 * El `status` se conserva en el mensaje entre corchetes porque la ruta solo
 * devuelve texto: es la forma de que el navegador sepa que un 429 NO se
 * reintenta y un 503 sí.
 */
async function llamar(cuerpo: unknown) {
    try {
        return await geminiGenerateContent(cuerpo);
    } catch (error) {
        if (!(error instanceof ErrorGemini)) throw error;

        if (error.status === 429) {
            throw new ErrorGemini(
                429,
                "[429] Se ha agotado la cuota de transcripción de Gemini. " +
                    "Escribe las observaciones a mano y avisa a Advantys."
            );
        }

        if (error.status === 503) {
            throw new ErrorGemini(503, "[503] El servicio de transcripción está saturado ahora mismo.");
        }

        if (error.status === 504) {
            throw new ErrorGemini(504, "[504] El servicio de transcripción ha tardado demasiado.");
        }

        throw error;
    }
}

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
            `El fragmento de audio pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el máximo ` +
                `son ${TAMANO_MAXIMO_BYTES / 1024 / 1024} MB.`
        );
    }

    const base64 = Buffer.from(await archivo.arrayBuffer()).toString("base64");

    const respuesta = await llamar({
        contents: [
            {
                role: "user",
                /**
                 * El AUDIO va primero y la instrucción después. Con la
                 * instrucción delante, el modelo la trataba como contexto y
                 * derivaba al formato de subtítulos; cerrando con ella, las
                 * reglas de formato son lo último que lee antes de responder.
                 */
                parts: [{ inlineData: { mimeType, data: base64 } }, { text: INSTRUCCION }],
            },
        ],
        generationConfig: {
            // Transcribir no es una tarea creativa: cuanto más determinista, mejor.
            temperature: 0,
            /**
             * Razonamiento DESACTIVADO (18/09/2026).
             *
             * Los modelos flash de esta generación razonan por defecto antes de
             * responder. En una transcripción literal ese razonamiento no
             * aporta nada y se paga entero en latencia: es tiempo que el
             * comercial pasa mirando un spinner en mitad de una visita.
             *
             * Si algún día se usa este cliente para una tarea que sí requiera
             * razonar, el presupuesto se sube AHÍ, no aquí.
             */
            thinkingConfig: { thinkingBudget: 0 },
        },
    });

    if (respuesta.promptFeedback?.blockReason) {
        throw new Error(`Gemini bloqueó la petición: ${respuesta.promptFeedback.blockReason}`);
    }

    const bruto = (respuesta.candidates?.[0]?.content?.parts ?? [])
        .map((parte) => parte.text ?? "")
        .join("")
        .trim();

    const texto = limpiarTranscripcion(bruto);

    return { texto, vacio: texto.length === 0 };
}

/** `MediaRecorder` devuelve cosas como "audio/wav;codecs=1". Gemini quiere el MIME pelado. */
function normalizarMime(mime: string): string {
    return mime.split(";")[0].trim().toLowerCase();
}