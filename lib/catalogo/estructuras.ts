import type { NodoCatalogo } from "./tipos";

/**
 * Bloques de árbol reutilizables entre módulos.
 *
 * Se exportan como funciones (no como constantes) para devolver siempre una
 * copia nueva. Si se compartiera la misma referencia entre módulos, cualquier
 * mutación accidental en runtime contaminaría todos los módulos a la vez.
 */

/** 3.1 Medios auxiliares. Común a fachadas, cubiertas, reparaciones y bajantes exterior. */
export function mediosAuxiliares(): NodoCatalogo {
    return {
        key: "medios_auxiliares",
        label: "Medios auxiliares",
        hijos: [
            { key: "andamio", label: "Andamio", medicion: { unidad: "m2" } },
            {
                key: "descuelgues",
                label: "Descuelgues",
                hijos: [
                    { key: "tubular", label: "Tubular", medicion: { unidad: "ud" } },
                    { key: "colgante", label: "Colgante", medicion: { unidad: "ud" } },
                    { key: "brazo", label: "Brazo", medicion: { unidad: "ud" } },
                ],
            },
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

/** 3.5 Varios. Campo abierto para partidas especiales. */
export function varios(): NodoCatalogo {
    return {
        key: "varios",
        label: "Varios",
        permiteTextoLibre: true,
        hijos: [],
    };
}