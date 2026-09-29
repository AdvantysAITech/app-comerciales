import type { Unidad } from "@/lib/documentos/tarifa";

/**
 * lib/propuesta/tipos.ts
 *
 * Propuesta de partidas generada por IA a partir del dictado (27/09/2026).
 *
 * Solo tipos: lo importan el formulario (navegador), las rutas de la propuesta
 * y el motor. `Unidad` se importa como tipo, así que el catálogo de tarifa (con
 * los costes internos) NO viaja al navegador por este fichero.
 */

/** De dónde sale la partida. */
export type OrigenLinea =
    /** Partida de la tarifa 2026 (CYPE x 1,25 ya calculado). */
    | "tarifa"
    /** Unidad de obra del Generador de Precios de CYPE, fuera de la tarifa. */
    | "cype"
    /** La ha escrito el comercial: sin código de tarifa ni de CYPE. */
    | "manual";

/** Línea de la propuesta tal como la edita el comercial. */
export type LineaPropuesta = {
    id: string;
    /** Tipo de trabajo (módulo) al que pertenece. Agrupa la pantalla y el anexo. */
    moduloKey: string;
    /** Frase del dictado de la que sale. Para que el comercial compruebe. */
    textoOriginal: string;
    /** Código de tarifa ("IMP003"), de CYPE ("QAW060") o manual ("MAN-3F2A"). */
    codigo: string;
    origen: OrigenLinea;
    descripcionCorta: string;
    descripcionLarga: string | null;
    /** Unidad que se imprime. Libre: el comercial puede poner "ud" por comodidad. */
    unidad: Unidad;
    /** Medición. `null` = el comercial no la dijo: hay que ponerla. */
    cantidad: number | null;
    /** Precio de venta unitario. `null` = sin precio: hay que ponerlo. */
    precioUnitario: number | null;
    /** Precio que propuso el sistema (tarifa o CYPE x margen). Para avisar si se aleja. */
    precioReferencia: number | null;
    /** Precio CYPE sin margen, si se conoce. Interno: no se imprime. */
    precioCype: number | null;
    /** Capítulo del documento ("01".."12"). */
    capitulo: string;
    /** Página de CYPE de la que se ha transcrito, para poder comprobarla. */
    url: string | null;
    /** Algo que el comercial tiene que mirar (duda del dictado, confianza baja...). */
    aviso: string | null;
    /** Pendiente de buscar en CYPE (la propuesta todavía se está completando). */
    pendienteCype?: boolean;
    /** Lo que se le pregunta a CYPE para esta línea. Permite reintentar la búsqueda. */
    consulta?: ConsultaCype | null;
};

/** El trabajo tal como salió del dictado, para buscarlo en CYPE. */
export type ConsultaCype = {
    tipoTrabajo: string;
    accion: string;
    elemento: string;
    detalle: string;
    unidad: string | null;
    textoOriginal: string;
};

/** Dictado de un tipo de trabajo, tal como lo envía el formulario, con sus fotos. */
export type DictadoModulo = { key: string; label: string; dictado: string; fotos?: string[] };

export type Propuesta = {
    generadaEn: string;
    lineas: LineaPropuesta[];
    /** Lo del dictado que no es un trabajo (accesos, avisos del vecino...). */
    observaciones: string[];
    /** Trabajos que la IA cree que faltan. NO se añaden solos. */
    sugerencias: string[];
    /** Fotos que la IA ha mirado para hacer la propuesta. */
    fotosAnalizadas?: number;
    /** Avisos del proceso (p. ej. fotos que no se han podido enviar). */
    avisos?: string[];
};

/**
 * Lo que de la línea viaja en el payload de la visita (DATOS_VISITA) y usa el
 * motor para calcular. Sin `id`, `aviso` ni `textoOriginal`: son de la pantalla.
 */
export type LineaDocumento = Pick<
    LineaPropuesta,
    | "codigo"
    | "origen"
    | "descripcionCorta"
    | "descripcionLarga"
    | "unidad"
    | "precioUnitario"
    | "precioCype"
    | "capitulo"
    | "url"
>;

/** Prefijo de ruta de las partidas propuestas en el payload. Nunca choca con el catálogo. */
export const PREFIJO_RUTA_PROPUESTA = "ia:";

/** Mismas 8 unidades que la tarifa. El formulario las ofrece todas. */
export const UNIDADES_PROPUESTA = ["ud", "m²", "m", "m³", "h", "kg", "día", "mes"] as const satisfies readonly Unidad[];

/** Normaliza lo que diga la IA o el comercial a una unidad válida, o `null`. */
export function normalizarUnidad(bruta: string | null | undefined): Unidad | null {
    if (!bruta) return null;
    const v = bruta.trim().toLowerCase().replace(/\.$/, "");
    if (["ud", "uds", "u", "unidad", "unidades", "pa", "p.a"].includes(v)) return "ud";
    if (["m2", "m²", "metros cuadrados"].includes(v)) return "m²";
    if (["m", "ml", "metro", "metros", "metros lineales"].includes(v)) return "m";
    if (["m3", "m³", "metros cubicos", "metros cúbicos"].includes(v)) return "m³";
    if (["h", "hora", "horas"].includes(v)) return "h";
    if (["kg", "kilo", "kilos"].includes(v)) return "kg";
    if (["día", "dia", "días", "dias", "d"].includes(v)) return "día";
    if (["mes", "meses"].includes(v)) return "mes";
    return null;
}

/** Partida de la tarifa tal como la usa el formulario (SIN coste CYPE: viaja al navegador). */
export type PartidaCatalogo = {
    codigo: string;
    descripcion: string;
    unidad: Unidad;
    precio: number;
    capitulo: string;
};

export type CapituloCatalogo = { codigo: string; nombre: string };
