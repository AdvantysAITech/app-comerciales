/**
 * lib/ia/claude.ts
 *
 * Llamada mínima a la API de Claude (Messages) con `fetch`, sin SDK.
 *
 *   ANTHROPIC_API_KEY   obligatoria
 *   ANTHROPIC_MODEL     opcional (por defecto `claude-sonnet-5`)
 *
 * Con herramientas de servidor (web_search / web_fetch) la API puede devolver
 * `stop_reason: "pause_turn"` cuando el bucle de herramientas es largo: se
 * continúa reenviando la respuesta como turno del asistente, como indica la
 * documentación. Los bloques de todas las vueltas se devuelven juntos para poder
 * comprobar qué páginas se descargaron de verdad.
 */

const URL_API = "https://api.anthropic.com/v1/messages";
const MODELO_POR_DEFECTO = "claude-sonnet-5";
const VUELTAS_MAXIMAS = 4;

export class IaNoConfiguradaError extends Error {
    constructor() {
        super("Falta ANTHROPIC_API_KEY en las variables de entorno: la propuesta por IA no está disponible.");
        this.name = "IaNoConfiguradaError";
    }
}

export function iaDisponible(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type BloqueRespuesta = { type: string; text?: string; [clave: string]: unknown };

export type RespuestaClaude = {
    /** Texto final concatenado (sin los bloques de herramientas). */
    texto: string;
    /** Todos los bloques de todas las vueltas. */
    bloques: BloqueRespuesta[];
};

export async function llamarClaude(opciones: {
    sistema: string;
    /** Texto, o bloques de contenido (texto + imágenes) de la API de Messages. */
    mensaje: string | unknown[];
    herramientas?: readonly unknown[];
    maxTokens?: number;
    /** Corte total, en ms. Por debajo del límite de la función de Vercel. */
    timeoutMs?: number;
}): Promise<RespuestaClaude> {
    const clave = process.env.ANTHROPIC_API_KEY;
    if (!clave) throw new IaNoConfiguradaError();

    const mensajes: Array<{ role: "user" | "assistant"; content: unknown }> = [
        { role: "user", content: opciones.mensaje },
    ];
    const bloques: BloqueRespuesta[] = [];
    const limite = AbortSignal.timeout(opciones.timeoutMs ?? 50_000);

    for (let vuelta = 0; vuelta < VUELTAS_MAXIMAS; vuelta++) {
        const respuesta = await fetch(URL_API, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": clave,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: process.env.ANTHROPIC_MODEL || MODELO_POR_DEFECTO,
                max_tokens: opciones.maxTokens ?? 4096,
                system: opciones.sistema,
                messages: mensajes,
                ...(opciones.herramientas ? { tools: opciones.herramientas } : {}),
            }),
            signal: limite,
            cache: "no-store",
        });

        const cuerpo = await respuesta.json().catch(() => null);
        if (!respuesta.ok) {
            const detalle = cuerpo?.error?.message ?? `HTTP ${respuesta.status}`;
            throw new Error(`Claude ha respondido con error: ${detalle}`);
        }

        const contenido = (cuerpo?.content ?? []) as BloqueRespuesta[];
        bloques.push(...contenido);

        if (cuerpo?.stop_reason !== "pause_turn") break;
        mensajes.push({ role: "assistant", content: contenido });
    }

    const texto = bloques
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("");

    return { texto, bloques };
}

/**
 * Saca el JSON de la respuesta. El prompt pide "solo JSON", pero un modelo
 * puede envolverlo en ```json o añadir una frase: se toma del primer `{` al
 * último `}`. Si no es JSON válido, lanza con un trozo de la respuesta.
 */
export function extraerJson<T>(texto: string): T {
    const inicio = texto.indexOf("{");
    const fin = texto.lastIndexOf("}");
    if (inicio === -1 || fin <= inicio) {
        throw new Error(`La IA no ha devuelto JSON: ${texto.slice(0, 200)}`);
    }
    try {
        return JSON.parse(texto.slice(inicio, fin + 1)) as T;
    } catch {
        throw new Error(`La IA ha devuelto un JSON ilegible: ${texto.slice(inicio, inicio + 200)}`);
    }
}

/**
 * Todo el texto de las páginas que web_fetch descargó de verdad, en bruto. Es
 * contra lo que se comprueba que un código o un precio no se lo ha inventado
 * el modelo.
 */
export function textoDescargado(bloques: BloqueRespuesta[]): { texto: string; urls: string[] } {
    const resultados = bloques.filter((b) => b.type === "web_fetch_tool_result");
    const urls: string[] = [];
    const partes: string[] = [];

    const recorrer = (v: unknown) => {
        if (typeof v === "string") partes.push(v);
        else if (Array.isArray(v)) v.forEach(recorrer);
        else if (v && typeof v === "object") {
            for (const [k, valor] of Object.entries(v)) {
                if (k === "url" && typeof valor === "string") urls.push(valor);
                recorrer(valor);
            }
        }
    };
    resultados.forEach((r) => recorrer(r.content));

    return { texto: partes.join("\n"), urls };
}
