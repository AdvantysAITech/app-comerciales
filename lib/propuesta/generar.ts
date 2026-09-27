import { aCentimos, aEuros } from "@/lib/documentos/motor";
import { catalogo, listarCapitulos, listarPartidas, obtenerPartida, type PartidaTarifa } from "@/lib/documentos/tarifa";
import { extraerJson, llamarClaude, textoDescargado, type BloqueRespuesta } from "@/lib/ia/claude";
import { HERRAMIENTAS_CYPE, mensajeCype, PROMPT_CASAR_TARIFA, PROMPT_CYPE, PROMPT_EXTRAER } from "@/lib/ia/prompts";
import {
    normalizarUnidad,
    type ConsultaCype,
    type DictadoModulo,
    type LineaPropuesta,
    type Propuesta,
} from "./tipos";

/**
 * lib/propuesta/generar.ts
 *
 * Dictado -> propuesta de partidas. SOLO SERVIDOR: importa la tarifa con los
 * costes internos.
 *
 *   1. extraer trabajos del dictado (Claude, sin herramientas)
 *   2. casar cada trabajo con la tarifa 2026 (candidatas por texto + Claude elige)
 *   3. lo que no case queda `pendienteCype`; el formulario lo pide por separado a
 *      /api/propuesta/cype, una llamada por línea y en paralelo, para que cada
 *      una quepa en el minuto que da Vercel.
 *
 * Aritmética (medición x %, margen) en TypeScript. El modelo solo transcribe.
 */

// ---------------------------------------------------------------------------
// 1. Extracción
// ---------------------------------------------------------------------------

export type Trabajo = {
    id: string;
    moduloKey: string;
    tipoTrabajo: string;
    accion: string;
    elemento: string;
    detalle: string;
    cantidad: number | null;
    medicionTotal: number | null;
    porcentaje: number | null;
    unidad: string | null;
    textoOriginal: string;
    dudas: string[];
};

type RespuestaExtraccion = {
    trabajos?: Partial<Trabajo>[];
    observaciones?: unknown[];
    sugerencias?: unknown[];
};

const numero = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
        const n = Number(v.replace(/\./g, "").replace(",", "."));
        return Number.isFinite(n) ? n : null;
    }
    return null;
};
const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const textos = (v: unknown): string[] => (Array.isArray(v) ? v.map(texto).filter(Boolean) : []);

export function mensajeExtraccion(modulos: DictadoModulo[]): string {
    return modulos
        .map((m) => `## ${m.label} [clave: ${m.key}]\n${m.dictado.trim()}`)
        .join("\n\n");
}

/** Valida la salida del modelo. Un trabajo sin módulo conocido se asigna al primero. */
export function sanearExtraccion(bruto: RespuestaExtraccion, modulos: DictadoModulo[]) {
    const claves = new Set(modulos.map((m) => m.key));
    const trabajos: Trabajo[] = (bruto.trabajos ?? []).map((t, i) => {
        const moduloKey = claves.has(texto(t.moduloKey)) ? texto(t.moduloKey) : modulos[0].key;
        return {
            id: `t${i + 1}`,
            moduloKey,
            tipoTrabajo: texto(t.tipoTrabajo) || modulos.find((m) => m.key === moduloKey)!.label,
            accion: texto(t.accion),
            elemento: texto(t.elemento),
            detalle: texto(t.detalle),
            cantidad: numero(t.cantidad),
            medicionTotal: numero(t.medicionTotal),
            porcentaje: numero(t.porcentaje),
            unidad: texto(t.unidad) || null,
            textoOriginal: texto(t.textoOriginal),
            dudas: textos(t.dudas),
        };
    });
    return {
        trabajos: trabajos.filter((t) => t.accion || t.elemento),
        observaciones: textos(bruto.observaciones),
        sugerencias: textos(bruto.sugerencias),
    };
}

// ---------------------------------------------------------------------------
// 2. Tarifa
// ---------------------------------------------------------------------------

const VACIAS = new Set(
    "de la el en y con por para del los las a un una al o su sus que se mas muy tipo zona".split(" ")
);

/**
 * Raíces de 4 letras sin tildes. Tosco a propósito: "pintar" ~ "pintura",
 * "impermeabilizar" ~ "impermeabilizacion". Recoge de más, pero quien elige es
 * el modelo; lo que no puede pasar es que la buena no esté en la lista.
 */
function raices(t: string): string[] {
    return t
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .split(/[^a-z0-9ñ]+/)
        .filter((p) => p.length > 2 && !VACIAS.has(p))
        .map((p) => p.slice(0, 4));
}

const indiceTarifa: { partida: PartidaTarifa; raices: Set<string> }[] = listarPartidas().map((p) => ({
    partida: p,
    raices: new Set(raices(p.descripcionCorta)),
}));

/** Partidas de la tarifa que comparten más palabras con el trabajo. */
export function candidatasTarifa(t: Pick<Trabajo, "accion" | "elemento" | "detalle">, limite = 15): PartidaTarifa[] {
    const fuertes = raices(`${t.accion} ${t.elemento}`);
    const debiles = raices(t.detalle);
    return indiceTarifa
        .map(({ partida, raices: r }) => ({
            partida,
            puntos: fuertes.filter((x) => r.has(x)).length * 2 + debiles.filter((x) => r.has(x)).length,
        }))
        .filter((c) => c.puntos > 0)
        .sort((a, b) => b.puntos - a.puntos)
        .slice(0, limite)
        .map((c) => c.partida);
}

// ---------------------------------------------------------------------------
// 3. Construcción de la propuesta
// ---------------------------------------------------------------------------

const redondear2 = (n: number) => aEuros(aCentimos(n));

/** Medición final: dicha, o total x % (en TypeScript, nunca en el modelo). */
export function medicionDe(t: Trabajo): { cantidad: number | null; nota: string | null } {
    if (t.cantidad !== null && t.cantidad > 0) return { cantidad: t.cantidad, nota: null };
    if (t.medicionTotal !== null && t.porcentaje !== null) {
        // En enteros: 33,3 x 15 % en coma flotante da 4,99499... y redondeaba a
        // 4,99. Con centésimas enteras sale 499,5 céntimos -> 5,00.
        const centimos = Math.round((Math.round(t.medicionTotal * 100) * Math.round(t.porcentaje * 100)) / 10000);
        const cantidad = centimos / 100;
        return {
            cantidad: cantidad > 0 ? cantidad : null,
            nota: `${String(t.medicionTotal).replace(".", ",")} × ${String(t.porcentaje).replace(".", ",")} %`,
        };
    }
    if (t.medicionTotal !== null && t.medicionTotal > 0) return { cantidad: t.medicionTotal, nota: null };
    return { cantidad: null, nota: null };
}

function capituloMasFrecuente(candidatas: PartidaTarifa[]): string {
    const cuenta = new Map<string, number>();
    for (const c of candidatas) cuenta.set(c.capitulo, (cuenta.get(c.capitulo) ?? 0) + 1);
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "03";
}

const nuevoId = () => crypto.randomUUID().slice(0, 8);

function avisoDe(t: Trabajo, extra: (string | null)[]): string | null {
    const partes = [...t.dudas, ...extra].filter((x): x is string => Boolean(x));
    return partes.length ? partes.join(" · ") : null;
}

export function consultaDe(t: Trabajo): ConsultaCype {
    return {
        tipoTrabajo: t.tipoTrabajo,
        accion: t.accion,
        elemento: t.elemento,
        detalle: t.detalle,
        unidad: t.unidad,
        textoOriginal: t.textoOriginal,
    };
}

/** Pasos 1 y 2. Devuelve la propuesta con las líneas sin casar `pendienteCype`. */
export async function generarPropuesta(modulos: DictadoModulo[]): Promise<Propuesta> {
    const extraccion = await llamarClaude({
        sistema: PROMPT_EXTRAER,
        mensaje: mensajeExtraccion(modulos),
        maxTokens: 8000,
        timeoutMs: 30_000,
    });
    const { trabajos, observaciones, sugerencias } = sanearExtraccion(
        extraerJson<RespuestaExtraccion>(extraccion.texto),
        modulos
    );

    if (trabajos.length === 0) {
        return { generadaEn: new Date().toISOString(), lineas: [], observaciones, sugerencias };
    }

    const candidatas = new Map(trabajos.map((t) => [t.id, candidatasTarifa(t)]));
    const elegidos = await casarConTarifa(trabajos, candidatas);

    const lineas: LineaPropuesta[] = trabajos.map((t) => {
        const { cantidad, nota } = medicionDe(t);
        const faltaMedicion = cantidad === null ? "Falta la medición" : null;
        const eleccion = elegidos.get(t.id);
        const partida = eleccion?.codigo ? obtenerPartida(eleccion.codigo) : undefined;

        if (partida) {
            return {
                id: nuevoId(),
                moduloKey: t.moduloKey,
                textoOriginal: t.textoOriginal,
                codigo: partida.codigo,
                origen: "tarifa",
                descripcionCorta: partida.descripcionCorta,
                descripcionLarga: partida.descripcionLarga,
                unidad: normalizarUnidad(t.unidad) ?? partida.unidad,
                cantidad,
                precioUnitario: partida.tarifaEmpresa,
                precioReferencia: partida.tarifaEmpresa,
                precioCype: partida.precioCype,
                capitulo: partida.capitulo,
                url: null,
                aviso: avisoDe(t, [
                    faltaMedicion,
                    nota ? `Medición calculada: ${nota}` : null,
                    eleccion?.confianza === "baja" ? `Encaje dudoso: ${eleccion.motivo}` : null,
                ]),
                consulta: consultaDe(t),
            };
        }

        return {
            id: nuevoId(),
            moduloKey: t.moduloKey,
            textoOriginal: t.textoOriginal,
            codigo: "",
            origen: "cype",
            descripcionCorta: [t.accion, t.elemento].filter(Boolean).join(" ") || t.textoOriginal,
            descripcionLarga: null,
            unidad: normalizarUnidad(t.unidad) ?? "ud",
            cantidad,
            precioUnitario: null,
            precioReferencia: null,
            precioCype: null,
            capitulo: capituloMasFrecuente(candidatas.get(t.id) ?? []),
            url: null,
            aviso: avisoDe(t, [faltaMedicion, nota ? `Medición calculada: ${nota}` : null]),
            pendienteCype: true,
            consulta: consultaDe(t),
        };
    });

    return { generadaEn: new Date().toISOString(), lineas, observaciones, sugerencias };
}

type Eleccion = { codigo: string | null; confianza: string; motivo: string };

async function casarConTarifa(
    trabajos: Trabajo[],
    candidatas: Map<string, PartidaTarifa[]>
): Promise<Map<string, Eleccion>> {
    const conCandidatas = trabajos.filter((t) => (candidatas.get(t.id)?.length ?? 0) > 0);
    const elegidos = new Map<string, Eleccion>();
    if (conCandidatas.length === 0) return elegidos;

    const mensaje = conCandidatas
        .map((t) =>
            [
                `### Trabajo ${t.id} (${t.tipoTrabajo})`,
                `Acción: ${t.accion} · Elemento: ${t.elemento} · Detalle: ${t.detalle || "-"}`,
                `Dictado: "${t.textoOriginal}"`,
                "Candidatas:",
                ...candidatas.get(t.id)!.map((p) => `- ${p.codigo} | ${p.descripcionCorta} | ${p.unidad}`),
            ].join("\n")
        )
        .join("\n\n");

    const respuesta = await llamarClaude({
        sistema: PROMPT_CASAR_TARIFA,
        mensaje,
        maxTokens: 4000,
        timeoutMs: 25_000,
    });
    const bruto = extraerJson<{ resultados?: { id?: string; codigo?: string | null; confianza?: string; motivo?: string }[] }>(
        respuesta.texto
    );

    for (const r of bruto.resultados ?? []) {
        const id = texto(r.id);
        const permitidas = new Set((candidatas.get(id) ?? []).map((p) => p.codigo));
        const codigo = texto(r.codigo).toUpperCase();
        // Un código que no estaba entre SUS candidatas se descarta: el modelo no
        // puede sacar partidas de la manga.
        elegidos.set(id, {
            codigo: permitidas.has(codigo) ? codigo : null,
            confianza: texto(r.confianza) || "media",
            motivo: texto(r.motivo),
        });
    }
    return elegidos;
}

// ---------------------------------------------------------------------------
// 4. CYPE
// ---------------------------------------------------------------------------

export type ResultadoCype =
    | {
          encontrado: true;
          codigo: string;
          unidad: LineaPropuesta["unidad"];
          descripcionCorta: string;
          descripcionLarga: string | null;
          precioCype: number;
          precioVenta: number;
          capitulo: string;
          url: string;
          aviso: string | null;
      }
    | { encontrado: false; motivo: string };

type RespuestaCype = {
    encontrado?: boolean;
    codigo?: string;
    unidad?: string;
    descripcionCorta?: string;
    descripcionLarga?: string;
    precio?: string | number;
    url?: string;
    capitulo?: string;
    opciones?: string;
    confianza?: string;
    motivo?: string;
};

/** "1.234,56" / "23,97" / 23.97 -> 23.97. */
export function leerPrecioEs(v: unknown): number | null {
    if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
    if (typeof v !== "string") return null;
    const limpio = v.replace(/[€\s]/g, "");
    if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$|^\d+(\.\d{1,2})?$/.test(limpio)) return null;
    const n = limpio.includes(",") ? Number(limpio.replace(/\./g, "").replace(",", ".")) : Number(limpio);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Comprueba la respuesta de CYPE contra lo que se descargó DE VERDAD. Si el
 * código o el precio no aparecen en las páginas de generadordeprecios.info que
 * trajo web_fetch, se descarta: preferimos "no encontrado" a un precio inventado.
 */
export function validarCype(
    bruto: RespuestaCype,
    descargado: { texto: string; urls: string[] },
    capituloPorDefecto: string
): ResultadoCype {
    if (!bruto.encontrado) return { encontrado: false, motivo: texto(bruto.motivo) || "No se ha encontrado en CYPE." };

    const codigo = texto(bruto.codigo).toUpperCase();
    if (!/^[A-Z0-9]{3,10}$/.test(codigo)) return { encontrado: false, motivo: `Código CYPE no válido: "${codigo}".` };

    const precioTexto = typeof bruto.precio === "number" ? String(bruto.precio).replace(".", ",") : texto(bruto.precio);
    const precioCype = leerPrecioEs(precioTexto);
    if (precioCype === null) return { encontrado: false, motivo: `Precio de CYPE ilegible: "${precioTexto}".` };

    if (!descargado.texto) {
        return { encontrado: false, motivo: "No se ha llegado a descargar la página de CYPE." };
    }
    if (!descargado.texto.toUpperCase().includes(codigo)) {
        return { encontrado: false, motivo: `El código ${codigo} no aparece en la página descargada.` };
    }
    const cifra = precioTexto.replace(/[€\s]/g, "");
    if (!descargado.texto.includes(cifra)) {
        return { encontrado: false, motivo: `El precio ${cifra} no aparece en la página descargada.` };
    }

    const url = texto(bruto.url);
    let host = "";
    try {
        host = new URL(url).hostname;
    } catch {
        /* se trata abajo */
    }
    if (!/(^|\.)generadordeprecios\.info$/.test(host)) {
        return { encontrado: false, motivo: "La página no es del Generador de Precios de CYPE." };
    }

    const unidad = normalizarUnidad(bruto.unidad) ?? "ud";
    const capitulos = new Set(listarCapitulos().map((c) => c.codigo));
    const capitulo = capitulos.has(texto(bruto.capitulo)) ? texto(bruto.capitulo) : capituloPorDefecto;

    // Margen de la empresa en TypeScript, igual que la tarifa (CYPE x 1,25).
    const precioVenta = redondear2(precioCype * (catalogo.meta.margenEmpresa || 1));

    const avisos = [
        texto(bruto.opciones) ? `Opciones supuestas: ${texto(bruto.opciones)}` : null,
        texto(bruto.confianza) === "baja" ? `Encaje dudoso: ${texto(bruto.motivo)}` : null,
    ].filter(Boolean);

    return {
        encontrado: true,
        codigo,
        unidad,
        descripcionCorta: texto(bruto.descripcionCorta) || codigo,
        descripcionLarga: texto(bruto.descripcionLarga) || null,
        precioCype,
        precioVenta,
        capitulo,
        url,
        aviso: avisos.length ? avisos.join(" · ") : null,
    };
}

export async function buscarEnCype(consulta: ConsultaCype, capituloPorDefecto: string): Promise<ResultadoCype> {
    let respuesta: { texto: string; bloques: BloqueRespuesta[] };
    try {
        respuesta = await llamarClaude({
            sistema: PROMPT_CYPE,
            mensaje: mensajeCype(
                consulta,
                listarCapitulos().map((c) => ({ codigo: c.codigo, nombre: c.nombre }))
            ),
            herramientas: HERRAMIENTAS_CYPE,
            maxTokens: 4000,
            timeoutMs: 52_000,
        });
    } catch (error) {
        if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
            return { encontrado: false, motivo: "CYPE ha tardado demasiado. Vuelve a intentarlo o pon el precio a mano." };
        }
        throw error;
    }

    let bruto: RespuestaCype;
    try {
        bruto = extraerJson<RespuestaCype>(respuesta.texto);
    } catch (error) {
        return { encontrado: false, motivo: error instanceof Error ? error.message : "Respuesta ilegible." };
    }
    return validarCype(bruto, textoDescargado(respuesta.bloques), capituloPorDefecto);
}
