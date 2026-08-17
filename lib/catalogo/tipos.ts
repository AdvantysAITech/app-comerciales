/**
 * Tipos del catálogo de trabajos.
 *
 * Requisito del cliente: "La aplicación deberá diseñarse para permitir ampliar
 * el árbol de opciones sin modificar la estructura principal."
 *
 * Por eso el árbol es DATO, no código: añadir una partida = añadir un objeto a
 * un array. El renderizador (B1.2) es recursivo y no conoce ningún módulo
 * concreto, así que nunca hay que tocarlo para ampliar el catálogo.
 */

/** Unidades de medición admitidas por partida. */
export type Unidad = "m2" | "ml" | "ud" | "pa";

export const ETIQUETA_UNIDAD: Record<Unidad, string> = {
    m2: "m²",
    ml: "ml",
    ud: "ud",
    pa: "partida alzada",
};

/** Modelos de negocio del DERCAS §4.1. Se conservan para no romper el reporting. */
export type ModeloNegocioDercas =
    | "rehabilitacion_impermeabilizacion"
    | "descuelgues_verticales"
    | "retirada_amianto"
    | "reformas_zonas_comunes";

/**
 * Nodo del árbol de opciones. Un nodo puede ser:
 *  - Grupo   -> tiene `hijos`. Al marcarlo se despliegan sus hijos.
 *  - Partida -> no tiene `hijos`. Es lo que acaba en el presupuesto y lo que
 *               lleva medición.
 * No hay límite de profundidad: el renderizador se llama a sí mismo.
 */
export type NodoCatalogo = {
    /** Clave estable. snake_case, sin acentos: viaja al JSON de GHL. NO renombrar una vez en producción. */
    key: string;
    /** Texto que ve el comercial. */
    label: string;
    /** Hijos del nodo. Su ausencia es lo que convierte al nodo en partida. */
    hijos?: NodoCatalogo[];
    /**
     * Medición asociada a la partida. Solo tiene sentido en nodos sin hijos.
     * `obligatoria` bloquea el envío si el comercial marca la partida y no mide.
     */
    medicion?: { unidad: Unidad; obligatoria?: boolean };
    /** Si es true, permite marcar varios hijos a la vez. Por defecto: true. */
    seleccionMultiple?: boolean;
    /** Habilita un campo de texto libre bajo el nodo (caso "Varios"). */
    permiteTextoLibre?: boolean;
    /** Aviso que la UI muestra al marcar el nodo. Ver `fibrocemento` en Bajantes. */
    alerta?: string;
};

/** Cómo se captura la información de un módulo. */
export type TipoCaptura =
    /** Árbol de opciones estándar. */
    | "arbol"
    /** Importación de documentos del arquitecto (Excel / BC3 / PDF). Ver B6. */
    | "importacion"
    /** Módulo sin estructura definida todavía: texto libre + partidas manuales + adjuntos. */
    | "libre";

export type ModuloTrabajo = {
    /** Clave estable. Viaja al custom field "Tipo de trabajo" de GHL. */
    key: string;
    label: string;
    /** Orden de presentación en el selector. */
    orden: number;
    captura: TipoCaptura;
    /** Árbol de opciones. Vacío en módulos `importacion` y `libre`. */
    estructura: NodoCatalogo[];
    /** Mapeo al modelo de negocio del DERCAS, para conservar el reporting existente. */
    modeloNegocioDercas: ModeloNegocioDercas | null;
    /** Nº mínimo de fotos exigido para poder enviar. 0 = sin mínimo. */
    fotosMinimas?: number;
    /** Nota interna para el equipo. No se muestra al comercial. */
    notaInterna?: string;
};

export type Catalogo = {
    version: number;
    modulos: ModuloTrabajo[];
};