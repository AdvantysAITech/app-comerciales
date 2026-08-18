import type { NodoCatalogo } from "./tipos";

/**
 * Bloques de árbol reutilizables entre módulos.
 *
 * Se exportan como funciones (no como constantes) para devolver siempre una
 * copia nueva. Si se compartiera la misma referencia entre módulos, cualquier
 * mutación accidental en runtime contaminaría todos los módulos a la vez.
 */

/**
 * Bloque de descuelgues. Es idéntico en las tres variantes de medios
 * auxiliares, así que se define una sola vez.
 */
function descuelgues(): NodoCatalogo {
    return {
        key: "descuelgues",
        label: "Descuelgues",
        hijos: [
            { key: "tubular", label: "Tubular", medicion: { unidad: "ud" } },
            { key: "colgante", label: "Colgante", medicion: { unidad: "ud" } },
            { key: "brazo", label: "Brazo", medicion: { unidad: "ud" } },
        ],
    };
}

/** 3.1 Medios auxiliares. Usado hoy por Cubiertas y Bajantes exterior. */
export function mediosAuxiliares(): NodoCatalogo {
    return {
        key: "medios_auxiliares",
        label: "Medios auxiliares",
        hijos: [
            { key: "andamio", label: "Andamio", medicion: { unidad: "m2" } },
            descuelgues(),
        ],
    };
}

/** 3.2 Picado. */
export function picado(): NodoCatalogo {
    return {
        key: "picado",
        label: "Picado",
        hijos: [
            { key: "limpieza_manual", label: "Limpieza manual", medicion: { unidad: "m2" } },
            { key: "limpieza_mecanica", label: "Limpieza mecánica", medicion: { unidad: "m2" } },
            { key: "picado_revestimiento", label: "Picado de revestimiento", medicion: { unidad: "m2" } },
            { key: "picado_piedra", label: "Picado de piedra", medicion: { unidad: "m2" } },
        ],
    };
}

/** 3.3 Saneado. */
export function saneado(): NodoCatalogo {
    return {
        key: "saneado",
        label: "Saneado",
        hijos: [
            { key: "mortero_m75_arena", label: "Mortero M-7,5 + arena", medicion: { unidad: "m2" } },
            { key: "geolite_t40", label: "Geolite T40", medicion: { unidad: "m2" } },
        ],
    };
}

/** 3.4 Pintura. */
export function pintura(): NodoCatalogo {
    return {
        key: "pintura",
        label: "Pintura",
        hijos: [
            { key: "revestimiento_acrilico", label: "Revestimiento acrílico", medicion: { unidad: "m2" } },
            { key: "revestimiento_silicato", label: "Revestimiento al silicato", medicion: { unidad: "m2" } },
            { key: "hidrofugo", label: "Hidrófugo", medicion: { unidad: "m2" } },
            {
                key: "esmalte_sintetico_metalicos",
                label: "Esmalte sintético (elementos metálicos)",
                medicion: { unidad: "m2" },
            },
        ],
    };
}

/*
 * Variantes específicas de los módulos de fachada (Medianeras, Fachada
 * principal, Fachada trasera y Patio de luces).
 *
 * Existen aparte de los bloques genéricos de arriba porque el criterio
 * confirmado por el cliente para fachadas diverge del que siguen usando
 * Cubiertas, Reparaciones puntuales y Bajantes exterior. Las claves de nivel
 * superior se mantienen (`medios_auxiliares`, `picado`, `saneado`, `pintura`)
 * para no alterar la ruta de los módulos que ya las usan.
 */

/** 3.1-F Medios auxiliares en fachadas. Andamio pasa a ser grupo con tipologías. */
export function mediosAuxiliaresFachada(): NodoCatalogo {
    return {
        key: "medios_auxiliares",
        label: "Medios auxiliares",
        hijos: [
            {
                key: "andamio",
                label: "Andamio",
                hijos: [
                    { key: "tubular", label: "Tubular", medicion: { unidad: "m2" } },
                    { key: "colgante", label: "Colgante", medicion: { unidad: "m2" } },
                    { key: "bimastil", label: "Bimástil", medicion: { unidad: "m2" } },
                ],
            },
            descuelgues(),
        ],
    };
}

/**
 * 3.1-R Medios auxiliares en Reparaciones puntuales. Andamio queda restringido
 * a tubular, así que se mantiene como partida y la tipología va en la etiqueta:
 * un grupo con un único hijo solo añadiría un clic al comercial.
 */
export function mediosAuxiliaresReparaciones(): NodoCatalogo {
    return {
        key: "medios_auxiliares",
        label: "Medios auxiliares",
        hijos: [
            { key: "andamio", label: "Andamio tubular", medicion: { unidad: "m2" } },
            descuelgues(),
        ],
    };
}

/** 3.2-F Picado en fachadas. */
export function picadoFachada(): NodoCatalogo {
    return {
        key: "picado",
        label: "Picado",
        hijos: [
            { key: "limpieza_manual", label: "Limpieza manual", medicion: { unidad: "m2" } },
            { key: "picado_cantos", label: "Picado de cantos", medicion: { unidad: "ml" } },
            { key: "picado_grietas", label: "Picado de grietas", medicion: { unidad: "ml" } },
        ],
    };
}

/** 3.3-F Saneado en fachadas. */
export function saneadoFachada(): NodoCatalogo {
    return {
        key: "saneado",
        label: "Saneado",
        hijos: [{ key: "geolite_t40_t10", label: "Geolite T40 · T10", medicion: { unidad: "m2" } }],
    };
}

/** 3.4-F Pintura en fachadas. */
export function pinturaFachada(): NodoCatalogo {
    return {
        key: "pintura",
        label: "Pintura",
        hijos: [
            { key: "revestimiento_elastico", label: "Revestimiento elástico", medicion: { unidad: "m2" } },
            {
                key: "hidrofugo_caravista",
                label: "Hidrófugo para ladrillo caravista",
                medicion: { unidad: "m2" },
            },
        ],
    };
}

/** 3.5 Varios. Campo abierto para partidas especiales. */
export function varios(): NodoCatalogo {
    return {
        key: "varios",
        label: "Varios",
        permiteTextoLibre: true,
        hijos: [],
    };
}