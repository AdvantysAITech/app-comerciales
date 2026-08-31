import type { PayloadVisita } from "@/lib/visita/payload";
import { getModulos, recorrerArbol, esPartida, ETIQUETA_UNIDAD } from "@/lib/catalogo";
import {
    obtenerPartida,
    UNIDADES_SELECCIONABLES,
    type PartidaTarifa,
    type UnidadSeleccionable,
} from "./tarifa";
import {
    calcularPresupuesto,
    assertCuadre,
    type EntradaPresupuesto,
    type LineaSolicitada,
    type PresupuestoCalculado,
} from "./motor";

/**
 * lib/documentos/mapeo-capitulos.ts
 *
 * Correspondencia entre el catálogo de CAPTURA y el catálogo de TARIFA.
 *
 * El catálogo de captura se organiza por MÓDULO (zona del edificio) porque es
 * como recorre el edificio el comercial. El presupuesto se organiza por
 * CAPÍTULO porque es como lo lee un administrador. No es una relación 1:1: un
 * módulo alimenta varios capítulos y un capítulo recibe partidas de varios
 * módulos. `motor.ts` agrega las mediciones que caen en la misma partida.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ SE INDEXA POR SUBRUTA Y NO POR RUTA (31/08/2026)
 * ---------------------------------------------------------------------------
 * El catálogo tiene 118 partidas pero solo 70 subrutas distintas: los cuatro
 * módulos de fachada (Medianeras, Fachada principal, Fachada trasera, Patio de
 * luces) comparten `estructuraFachadas()`, así que
 *
 *     medianeras.picado.picado_cantos
 *     fachada_trasera.picado.picado_cantos
 *
 * son el mismo trabajo y la misma partida de tarifa. Indexar por ruta completa
 * obligaba a repetir la misma decisión cuatro veces y a remapear el mundo cada
 * vez que se añade un módulo.
 *
 * La clave es la SUBRUTA: la ruta sin el prefijo del módulo.
 * `EXCEPCIONES_MODULO` cubre los casos en que un módulo concreto necesite otra
 * partida.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type EstadoMapeo =
    /** Equivalencia inequívoca. No requiere validación. */
    | "confirmado"
    /** Equivalencia razonable pero discutible. Miguel debe validarla. */
    | "propuesto"
    /** No existe partida equivalente en la tarifa. Bloquea el presupuesto. */
    | "sin_equivalencia";

export interface MapeoPartida {
    /** Código del catálogo de tarifa. Vacío si estado es "sin_equivalencia". */
    codigo: string;
    estado: EstadoMapeo;
    /** Por qué se eligió ese código, o qué falta. Se lee en la auditoría. */
    nota?: string;
}

// ---------------------------------------------------------------------------
// Descomposición de rutas
// ---------------------------------------------------------------------------

/** "medianeras.picado.picado_cantos" -> "medianeras" */
export function moduloDeRuta(ruta: string): string {
    return ruta.split(".")[0] ?? "";
}

/** "medianeras.picado.picado_cantos" -> "picado.picado_cantos" */
export function subrutaDe(ruta: string): string {
    return ruta.split(".").slice(1).join(".");
}

// ---------------------------------------------------------------------------
// Tabla de mapeo
// ---------------------------------------------------------------------------

/**
 * Clave: SUBRUTA. Aplica a todos los módulos que la tengan, salvo que
 * `EXCEPCIONES_MODULO` diga otra cosa.
 *
 * INCOMPLETA. Pendiente de la sesión de mapeo con Miguel.
 * `npm run mapeo:auditar` da el recuento exacto.
 */
export const MAPA_SUBRUTAS: Record<string, MapeoPartida> = {
    // --- Medios auxiliares ---------------------------------------------------
    "medios_auxiliares.andamio.colgante": {
        codigo: "",
        estado: "sin_equivalencia",
        nota:
            "La tarifa solo tiene andamio tubular multidireccional (AND001-AND003). " +
            "No hay andamio colgante. Decisión de Miguel: ¿se añade partida o se " +
            "remapea a AND001 a tanto alzado?",
    },
    "medios_auxiliares.andamio": {
        codigo: "AND002",
        estado: "propuesto",
        nota:
            "AND002 es h=10-20 m. Si el edificio es más bajo va AND001 (h<=10 m) y si " +
            "es más alto AND003 (h=20-30 m). La altura no se captura en el formulario: " +
            "en 950 m² la diferencia entre tramos ronda los 5.700 €.",
    },

    // --- Picado --------------------------------------------------------------
    "picado.picado_cantos": {
        codigo: "DEM009",
        estado: "propuesto",
        nota: "DEM009 es picado de enfoscado en paramento vertical (m²); la captura mide en ml.",
    },
    "picado.picado_grietas": {
        codigo: "FAC009",
        estado: "propuesto",
        nota: "FAC009 repara la grieta con masilla elástica (ml). Si solo es picado sin reparar, revisar.",
    },
    "picado.picado_piedra": {
        codigo: "DEM011",
        estado: "propuesto",
        nota: "DEM011 es demolición de chapado de piedra natural con grapas. Alternativa: DEM013.",
    },

    // --- Limpieza ------------------------------------------------------------
    //
    // CORRECCIÓN 31/08/2026: antes, la limpieza manual de fachada apuntaba a
    // DEM016 y la de cubiertas a DEM018. Al reindexar por subruta salió el
    // conflicto, y al mirarlo DEM016 es "lavado hidrodinámico a presión", que es
    // limpieza MECÁNICA, no manual. Queda:
    //     manual   -> DEM018 (frotado manual con cepillo)
    //     mecánica -> DEM016 (agua a presión)
    //
    // Efecto colateral: DEM016 tiene la tarifa pactada de 2,91 €, fuera del
    // margen del 25 %. Ahora solo entra cuando el comercial marca limpieza
    // mecánica, en lugar de en toda fachada.
    "picado.limpieza_manual": {
        codigo: "DEM018",
        estado: "propuesto",
        nota: "DEM018 es limpieza de juntas manual con cepillo. Confirmar que es el trabajo real.",
    },
    "picado.limpieza_mecanica": {
        codigo: "DEM016",
        estado: "propuesto",
        nota: "DEM016 es lavado hidrodinámico a presión. OJO: tarifa pactada 2,91 €, fuera del margen del 25 %.",
    },
    "limpieza.limpieza_manual": {
        codigo: "DEM018",
        estado: "propuesto",
        nota: "Mismo trabajo que picado.limpieza_manual; en Cubiertas la limpieza cuelga de su propio grupo.",
    },
    "limpieza.limpieza_mecanica": {
        codigo: "DEM016",
        estado: "propuesto",
        nota: "Mismo trabajo que picado.limpieza_mecanica. OJO: tarifa pactada 2,91 €.",
    },

    // --- Pintura -------------------------------------------------------------
    "pintura.revestimiento_elastico": {
        codigo: "PIN008",
        estado: "confirmado",
        nota: "Revestimiento elástico antifisuras armado con malla, fachada exterior.",
    },
    "pintura.hidrofugo_caravista": {
        codigo: "PIN010",
        estado: "propuesto",
        nota: "PIN010 es hidrofugante siloxánico para piedra natural, no para ladrillo caravista.",
    },

    // --- Impermeabilización --------------------------------------------------
    "impermeabilizacion.mortero_fibras": {
        codigo: "",
        estado: "sin_equivalencia",
        nota:
            "No hay mortero de impermeabilización con fibras en la tarifa. " +
            "Lo más próximo es IMP018 (membrana líquida de poliuretano), que no es lo mismo.",
    },
    "impermeabilizacion.epdm": {
        codigo: "",
        estado: "sin_equivalencia",
        nota:
            "No hay lámina EPDM en la tarifa. El capítulo 06 solo cubre bituminosa, " +
            "PU líquido y aislamientos. Decisión de Miguel: ¿se añade partida EPDM?",
    },
};

/**
 * Excepciones por módulo. Gana sobre `MAPA_SUBRUTAS`.
 * Clave externa: `key` del módulo. Clave interna: subruta.
 *
 * Vacío hoy. Se llenará cuando Miguel confirme que un mismo trabajo cambia de
 * partida según la zona.
 */
export const EXCEPCIONES_MODULO: Record<string, Record<string, MapeoPartida>> = {};

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export function mapearRuta(ruta: string): MapeoPartida | undefined {
    const modulo = moduloDeRuta(ruta);
    const subruta = subrutaDe(ruta);
    return EXCEPCIONES_MODULO[modulo]?.[subruta] ?? MAPA_SUBRUTAS[subruta];
}

/** Resuelve una ruta hasta su partida de tarifa, o `undefined`. */
export function partidaDeRuta(ruta: string): PartidaTarifa | undefined {
    const m = mapearRuta(ruta);
    if (!m || m.estado === "sin_equivalencia" || !m.codigo) return undefined;
    return obtenerPartida(m.codigo);
}

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------

export class RutasSinMapearError extends Error {
    constructor(
        public readonly desconocidas: readonly string[],
        public readonly sinEquivalencia: readonly { ruta: string; nota?: string }[]
    ) {
        const partes: string[] = ["No se puede presupuestar."];

        if (desconocidas.length) {
            partes.push(
                `\n${desconocidas.length} ruta(s) no están en MAPA_SUBRUTAS (lib/documentos/mapeo-capitulos.ts):`,
                ...desconocidas.map((r) => `  - ${r}`)
            );
        }
        if (sinEquivalencia.length) {
            partes.push(
                `\n${sinEquivalencia.length} ruta(s) sin partida equivalente en la tarifa. Requieren decisión de Miguel:`,
                ...sinEquivalencia.map((s) => `  - ${s.ruta}${s.nota ? `\n      ${s.nota}` : ""}`)
            );
        }

        super(partes.join("\n"));
        this.name = "RutasSinMapearError";
    }

    /** Listado plano de rutas que impiden presupuestar. */
    get rutasSinPrecio(): readonly string[] {
        return [...this.desconocidas, ...this.sinEquivalencia.map((s) => s.ruta)];
    }
}

/**
 * @deprecated Usa `RutasSinMapearError`.
 * Alias temporal para no romper consumidores antiguos.
 */
export const PreciosPendientesError = RutasSinMapearError;
export type PreciosPendientesError = RutasSinMapearError;

// ---------------------------------------------------------------------------
// Auditoría del payload
// ---------------------------------------------------------------------------

export function auditarPayload(payload: PayloadVisita): {
    desconocidas: string[];
    sinEquivalencia: { ruta: string; nota?: string }[];
    propuestas: { ruta: string; codigo: string; nota?: string }[];
} {
    const desconocidas: string[] = [];
    const sinEquivalencia: { ruta: string; nota?: string }[] = [];
    const propuestas: { ruta: string; codigo: string; nota?: string }[] = [];

    const rutas = new Set(payload.modulos.flatMap((m) => m.partidas).map((p) => p.ruta));

    for (const ruta of rutas) {
        const m = mapearRuta(ruta);
        if (!m) desconocidas.push(ruta);
        else if (m.estado === "sin_equivalencia" || !m.codigo) sinEquivalencia.push({ ruta, nota: m.nota });
        else if (m.estado === "propuesto") propuestas.push({ ruta, codigo: m.codigo, nota: m.nota });
    }

    return { desconocidas, sinEquivalencia, propuestas };
}

/** Compatibilidad con la API anterior. */
export function rutasSinPrecio(payload: PayloadVisita): string[] {
    const a = auditarPayload(payload);
    return [...a.desconocidas, ...a.sinEquivalencia.map((s) => s.ruta)];
}

// ---------------------------------------------------------------------------
// Auditoría del catálogo completo
// ---------------------------------------------------------------------------

export type PartidaCatalogo = {
    moduloKey: string;
    moduloLabel: string;
    ruta: string;
    subruta: string;
    camino: string;
    unidad: string;
    textoLibre: boolean;
    mapeo: MapeoPartida | undefined;
};

/**
 * Recorre el catálogo de captura entero y devuelve cada partida con su estado
 * de mapeo. Es la base del informe que se le lleva a Miguel.
 *
 * Solo módulos de captura "arbol": los de tipo "importacion" (Proyectos) y
 * "libre" (Gestión de residuos, Documentación, Varios) no producen partidas
 * presupuestables.
 */
export function recorrerCatalogo(
    subcuenta: "scala-valencia" | "vertical-projects" = "scala-valencia"
): PartidaCatalogo[] {
    const resultado: PartidaCatalogo[] = [];

    for (const modulo of getModulos(subcuenta)) {
        if (modulo.captura !== "arbol") continue;

        const caminos = new Map<string, string>();

        recorrerArbol(modulo, (nodo, ruta) => {
            const padre = ruta.split(".").slice(0, -1).join(".");
            caminos.set(
                ruta,
                padre === modulo.key ? nodo.label : `${caminos.get(padre) ?? ""} > ${nodo.label}`
            );

            if (!esPartida(nodo)) return;

            resultado.push({
                moduloKey: modulo.key,
                moduloLabel: modulo.label,
                ruta,
                subruta: subrutaDe(ruta),
                camino: caminos.get(ruta) ?? ruta,
                unidad: nodo.medicion ? ETIQUETA_UNIDAD[nodo.medicion.unidad] : "—",
                textoLibre: Boolean(nodo.permiteTextoLibre),
                mapeo: mapearRuta(ruta),
            });
        });
    }

    return resultado;
}

export type ResumenCobertura = {
    partidas: number;
    subrutas: number;
    confirmado: number;
    propuesto: number;
    sinEquivalencia: number;
    sinMapear: number;
    textoLibre: number;
};

/** Cobertura contada por SUBRUTA, que es la unidad real de decisión. */
export function resumenCobertura(
    subcuenta: "scala-valencia" | "vertical-projects" = "scala-valencia"
): ResumenCobertura {
    const partidas = recorrerCatalogo(subcuenta);
    const porSubruta = new Map<string, PartidaCatalogo>();
    for (const p of partidas) if (!porSubruta.has(p.subruta)) porSubruta.set(p.subruta, p);

    const r: ResumenCobertura = {
        partidas: partidas.length,
        subrutas: porSubruta.size,
        confirmado: 0,
        propuesto: 0,
        sinEquivalencia: 0,
        sinMapear: 0,
        textoLibre: 0,
    };

    for (const p of porSubruta.values()) {
        if (p.textoLibre) r.textoLibre++;
        if (!p.mapeo) r.sinMapear++;
        else if (p.mapeo.estado === "confirmado") r.confirmado++;
        else if (p.mapeo.estado === "propuesto") r.propuesto++;
        else r.sinEquivalencia++;
    }

    return r;
}

// ---------------------------------------------------------------------------
// Adaptador captura -> motor
// ---------------------------------------------------------------------------

function normalizarUnidadSeleccionada(bruta: string | null | undefined): UnidadSeleccionable | null {
    if (!bruta) return null;
    const v = bruta.trim().toLowerCase();
    if (v === "ud" || v === "uds" || v === "u") return "ud";
    if (v === "m2" || v === "m²") return "m²";
    // El formulario ofrece ud y m² (acuerdo 31/08/2026), pero el catálogo también
    // usa "ml" y "pa". Esos se ignoran y se imprime la unidad nativa de la tarifa.
    return null;
}

export function construirEntradaPresupuesto(
    payload: PayloadVisita,
    ivaTipo?: number
): EntradaPresupuesto {
    const auditoria = auditarPayload(payload);
    if (auditoria.desconocidas.length || auditoria.sinEquivalencia.length) {
        throw new RutasSinMapearError(auditoria.desconocidas, auditoria.sinEquivalencia);
    }

    const lineas: LineaSolicitada[] = [];

    for (const modulo of payload.modulos) {
        for (const partida of modulo.partidas) {
            const mapeo = mapearRuta(partida.ruta);
            if (!mapeo) continue; // imposible: auditarPayload ya habría lanzado

            const cantidad = partida.cantidad ?? 0;
            // Cantidad 0 o vacía = el comercial no midió esa partida. No es error.
            if (!Number.isFinite(cantidad) || cantidad <= 0) continue;

            lineas.push({
                codigo: mapeo.codigo,
                cantidad,
                unidadSeleccionada: normalizarUnidadSeleccionada(partida.unidad),
                descripcionLarga: null,
            });
        }
    }

    if (lineas.length === 0) {
        throw new Error(
            "El presupuesto no contiene ninguna partida con medición mayor que 0. " +
                "Revisa que el comercial haya introducido cantidades en el formulario."
        );
    }

    return { lineas, ivaTipo };
}

/** Punto de entrada del bloque económico: visita -> presupuesto calculado. */
export function presupuestar(payload: PayloadVisita, ivaTipo?: number): PresupuestoCalculado {
    const resultado = calcularPresupuesto(construirEntradaPresupuesto(payload, ivaTipo));
    assertCuadre(resultado);
    return resultado;
}

// ---------------------------------------------------------------------------
// Integridad
// ---------------------------------------------------------------------------

/**
 * Comprueba la coherencia interna de la tabla de mapeo. Un código mal escrito
 * aquí reventaría en tiempo de generación, con el comercial delante.
 */
export function validarMapeo(): string[] {
    const fallos: string[] = [];

    const revisar = (clave: string, m: MapeoPartida) => {
        if (m.estado === "sin_equivalencia") {
            if (m.codigo) fallos.push(`${clave}: "sin_equivalencia" pero tiene código "${m.codigo}".`);
            if (!m.nota) fallos.push(`${clave}: "sin_equivalencia" sin nota que explique qué falta.`);
            return;
        }
        if (!m.codigo) {
            fallos.push(`${clave}: estado "${m.estado}" sin código.`);
            return;
        }
        if (!obtenerPartida(m.codigo)) {
            fallos.push(`${clave}: el código "${m.codigo}" no existe en el catálogo de tarifa.`);
        }
        if (m.estado === "propuesto" && !m.nota) {
            fallos.push(`${clave}: estado "propuesto" sin nota. Miguel no sabrá qué validar.`);
        }
    };

    for (const [subruta, m] of Object.entries(MAPA_SUBRUTAS)) revisar(subruta, m);
    for (const [modulo, tabla] of Object.entries(EXCEPCIONES_MODULO)) {
        for (const [subruta, m] of Object.entries(tabla)) revisar(`${modulo}/${subruta}`, m);
    }

    // Subrutas mapeadas que ya no existen en el catálogo: basura que confunde.
    const delCatalogo = new Set(recorrerCatalogo().map((p) => p.subruta));
    for (const subruta of Object.keys(MAPA_SUBRUTAS)) {
        if (!delCatalogo.has(subruta)) {
            fallos.push(`${subruta}: mapeada pero no existe en el catálogo de captura. ¿Sobra?`);
        }
    }

    return fallos;
}

export { UNIDADES_SELECCIONABLES };