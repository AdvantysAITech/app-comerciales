import type { PayloadVisita } from "@/lib/visita/payload";
import {
    getModulos,
    recorrerArbol,
    buscarNodoPorRuta,
    esPartida,
    ETIQUETA_UNIDAD,
    type NodoCatalogo,
} from "@/lib/catalogo";
import { SUBRUTAS_SIN_PRECIO } from "@/lib/catalogo/disponibilidad";
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
 *
 * ---------------------------------------------------------------------------
 * SINÓNIMOS Y TEXTO LIBRE (09/09/2026, Bloque A)
 * ---------------------------------------------------------------------------
 * Dos huecos detectados con el primer formulario real (C/ Islas Canarias, 180):
 *
 * 1. La misma obra tiene dos `key` distintas según el módulo. "Picado de
 *    cantos" es `picado.picado_cantos` en fachadas y `picado.cantos_forjado` en
 *    Reparaciones puntuales. Es el mismo trabajo y el mismo precio, pero el
 *    mapa lo veía como dos cosas y bloqueaba la segunda. Se resuelve con
 *    `SINONIMOS_SUBRUTA`, que redirige a la subruta canónica ANTES de consultar
 *    el mapa: una decisión por trabajo real, no por clave del árbol.
 *
 *    No se resuelve con IA en tiempo de generación. La partida determina el
 *    precio que se imprime en un documento contractual: tiene que ser
 *    determinista, reproducible y auditable. La IA se usa fuera de línea, para
 *    PROPONER entradas de esta tabla (Bloque B), nunca para consultarlas.
 *
 * 2. Los nodos sin medición ("Varios", "Otros") no son presupuestables por
 *    diseño: no tienen unidad, luego no tienen cantidad ni importe. El mapa no
 *    los contempla, así que `auditarPayload` los metía en `desconocidas` y
 *    bloqueaba el presupuesto entero. Ahora se separan en `textoLibre`: no
 *    bloquean, no generan línea económica y salen como aviso al comercial.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export const SUBCUENTAS = ["scala-valencia", "vertical-projects"] as const;
export type Subcuenta = (typeof SUBCUENTAS)[number];

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
// Sinónimos de subruta
// ---------------------------------------------------------------------------

/**
 * Subrutas que son el MISMO trabajo con distinta clave.
 * Clave: subruta tal cual aparece en el catálogo. Valor: subruta canónica, la
 * que está en `MAPA_SUBRUTAS`.
 *
 * Requisitos (los verifica `validarMapeo`):
 *  - El destino existe en `MAPA_SUBRUTAS`.
 *  - El origen NO está también en `MAPA_SUBRUTAS`: dos fuentes de verdad para
 *    el mismo trabajo es justo el fallo que esto viene a evitar.
 *  - No se encadenan: un sinónimo apunta a una subruta canónica, no a otro
 *    sinónimo.
 *
 * Solo para trabajos IDÉNTICOS. Si dos trabajos se parecen pero no son el
 * mismo, cada uno lleva su entrada propia en `MAPA_SUBRUTAS`.
 */
export const SINONIMOS_SUBRUTA: Record<string, string> = {
    // Reparaciones puntuales llama "Cantos de forjado" a lo que las fachadas
    // llaman "Picado de cantos". Mismo trabajo, misma unidad (ml).
    "picado.cantos_forjado": "picado.picado_cantos",

    // Reparaciones puntuales llama "Grietas" a lo que las fachadas llaman
    // "Picado de grietas". Mismo trabajo, misma unidad (ml).
    "picado.grietas": "picado.picado_grietas",

    // Cubiertas llama "Saneado > Mortero M-7,5 + arena" a lo que Reparaciones
    // puntuales llama "Reparación > Mortero M-7,5 + arena".
    "saneado.mortero_m75_arena": "reparacion.mortero_m75_arena",
    "pintura.revestimiento_acrilico": "revestimiento_pintura.acrilico",
    "reparacion.geolite_t40": "saneado.geolite_t40",
    "exterior.medios_auxiliares.andamio": "medios_auxiliares.andamio",
    "exterior.medios_auxiliares.descuelgues.tubular": "medios_auxiliares.descuelgues.tubular",
    "exterior.medios_auxiliares.descuelgues.colgante": "medios_auxiliares.descuelgues.colgante",
    "exterior.medios_auxiliares.descuelgues.brazo": "medios_auxiliares.descuelgues.brazo",
};

/** Resuelve una subruta a su forma canónica. Idempotente. */
export function canonizarSubruta(subruta: string): string {
    return SINONIMOS_SUBRUTA[subruta] ?? subruta;
}

// ---------------------------------------------------------------------------
// Tabla de mapeo
// ---------------------------------------------------------------------------

/**
 * Clave: SUBRUTA CANÓNICA. Aplica a todos los módulos que la tengan, salvo que
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
    "medios_auxiliares.andamio.tubular": {
        codigo: "AND002",
        estado: "propuesto",
        nota:
            "Mismo criterio que medios_auxiliares.andamio (módulos donde el andamio es hoja). " +
            "AND002 es h=10-20 m; por debajo AND001, por encima AND003. La altura no se captura.",
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

    "reparacion.mortero_m75_arena": {
        codigo: "FAC002",
        estado: "propuesto",
        nota:
            "FAC002 es enfoscado de cemento maestreado fratasado ext. 20 mm (29,38 €/m²). " +
            "Alternativas: FAC001 buena vista 15 mm (27,23) o FAC008 con malla de fibra (48,91). " +
            "Confirmar con Miguel si el M-7,5 + arena lleva maestreado.",
    },
    "revestimiento_pintura.acrilico": {
        codigo: "PIN001",
        estado: "propuesto",
        nota: "PIN001 es pintura plástica acrílica exterior, 2 manos + imprimación (20,54 €/m²).",
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

    // =======================================================================
    // MAPEO MASIVO 09/09/2026 (Bloque B)
    // -----------------------------------------------------------------------
    // Las 50 subrutas que quedaban sin decidir, resueltas contra las 199
    // partidas de tarifa-2026.json. TODAS entran como "propuesto": son
    // equivalencias elegidas por Advantys y ninguna está validada por
    // dirección (DERCAS §6.3). La nota dice qué hay que mirar en cada una.
    // =======================================================================

    // --- Medios auxiliares no tubulares -------------------------------------
    // Familia completa sin equivalencia: la tarifa 2026 solo contempla andamio
    // tubular, plataformas elevadoras y grúas. Ni suspendido ni bimástil ni
    // descuelgue medido por unidad. El capítulo 11 (VP) factura por jornada de
    // equipo, no por m² ni por descuelgue, así que no se puede remapear sin
    // cambiar antes la medición del formulario. UNA decisión de Miguel
    // desbloquea las cinco.
    "medios_auxiliares.andamio.bimastil": {
        codigo: "",
        estado: "sin_equivalencia",
        nota: "No hay andamio bimástil en la tarifa. Misma decisión que andamio colgante.",
    },
    "medios_auxiliares.descuelgues.tubular": {
        codigo: "",
        estado: "sin_equivalencia",
        nota:
            "El formulario mide descuelgues en ud. La tarifa solo tiene VP004 (equipo 2 " +
            "técnicos media jornada, 475 €/ud) y VP005 (jornada completa, 900 €/ud). " +
            "Mapear ud de descuelgue a ud de jornada multiplicaría el importe por un " +
            "factor desconocido. Requiere partida propia o cambiar la medición.",
    },
    "medios_auxiliares.descuelgues.colgante": {
        codigo: "",
        estado: "sin_equivalencia",
        nota: "Igual que descuelgues.tubular: no hay partida por unidad de descuelgue.",
    },
    "medios_auxiliares.descuelgues.brazo": {
        codigo: "",
        estado: "sin_equivalencia",
        nota: "Igual que descuelgues.tubular: no hay partida por unidad de descuelgue.",
    },

    // --- Saneado en fachadas -------------------------------------------------
    "saneado.geolite_t40_t10": {
        codigo: "FAC016",
        estado: "propuesto",
        nota:
            "Geolite T40/T10 son morteros de reparación estructural (clase R4). FAC016 es " +
            "reparación con mortero R4, 122,79 €/m². OJO: la descripción de FAC016 dice " +
            "\"canto de forjado\"; en paramento general el precio puede estar alto. " +
            "Alternativa a la baja: FAC015 (saneado de armadura + pasivado, 56,25 €/m²).",
    },
    "saneado.geolite_t40": {
        codigo: "FAC016",
        estado: "propuesto",
        nota: "Mismo criterio que saneado.geolite_t40_t10. La tarifa no distingue T40 de T10.",
    },
    "saneado.geolite_t10": {
        codigo: "FAC016",
        estado: "propuesto",
        nota:
            "Mismo código que T40 porque la tarifa solo tiene un mortero R4. El T10 es " +
            "menos resistente y debería ser más barato: si Miguel quiere diferenciarlos " +
            "hay que añadir partida.",
    },

    // --- Picado adicional ----------------------------------------------------
    "picado.picado_revestimiento": {
        codigo: "DEM008",
        estado: "propuesto",
        nota: "DEM008, demolición de revestimiento continuo de mortero por medios manuales, exterior.",
    },
    "picado.abombamientos_flechados": {
        codigo: "DEM008",
        estado: "propuesto",
        nota:
            "Un abombamiento es revestimiento despegado del soporte: mismo trabajo de " +
            "retirada que DEM008. Si además hay que reponer, la reposición va aparte.",
    },
    "picado.plaquetas_caravista": {
        codigo: "DEM002",
        estado: "propuesto",
        nota: "DEM002 es demolición manual de aplacado cerámico exterior pegado (19,25 €/m²).",
    },
    "picado.zonas_mal_estado": {
        codigo: "DEM010",
        estado: "propuesto",
        nota:
            "Escaleras y zaguán es interior: DEM010 (picado de enlucido de yeso, 8,50 €/m²) " +
            "en lugar de DEM009, que es exterior sobre enfoscado.",
    },

    // --- Pintura adicional ---------------------------------------------------
    "pintura.hidrofugo": {
        codigo: "PIN010",
        estado: "propuesto",
        nota: "PIN010, tratamiento hidrofugante siloxánico (10,63 €/m²). Mismo criterio que hidrofugo_caravista.",
    },
    "pintura.revestimiento_silicato": {
        codigo: "",
        estado: "sin_equivalencia",
        nota:
            "No hay pintura al silicato en la tarifa. PIN006 es siloxano, que es otro " +
            "producto químico: ponerlo en el documento describiría un material que no se " +
            "va a aplicar. Decisión de Miguel: ¿se añade partida o se retira la opción?",
    },
    "pintura.esmalte_sintetico_metalicos": {
        codigo: "PIN014",
        estado: "propuesto",
        nota: "PIN014, pintado de carpintería metálica exterior a dos manos (27,50 €/m²).",
    },
    "pintura.plastica_interior": {
        codigo: "PIN003",
        estado: "propuesto",
        nota:
            "PIN003 es plástica interior sobre yeso o escayola (8,45 €/m²), lo habitual en " +
            "zaguán. Si el soporte es mortero, va PIN002 (12,06 €/m²).",
    },
    "pintura.esmalte_barandillas_rejas": {
        codigo: "PIN014",
        estado: "propuesto",
        nota:
            "PIN014 es pintado de carpintería metálica. DESVIACIÓN DE UNIDAD: la captura " +
            "mide en ml y la partida es m². En barandilla de 90 cm de altura, 1 ml ≈ 1,8 m² " +
            "de superficie a dos caras: el importe se queda corto. Revisar con Miguel.",
    },
    "revestimiento_pintura.hidrofugo_caravista.incoloro": {
        codigo: "PIN010",
        estado: "propuesto",
        nota: "PIN010, hidrofugante siloxánico (10,63 €/m²).",
    },
    "revestimiento_pintura.hidrofugo_caravista.brillante": {
        codigo: "PIN010",
        estado: "propuesto",
        nota: "Mismo código que el incoloro: la tarifa no distingue el acabado.",
    },

    // --- Reparación y revestimientos ----------------------------------------
    "reparacion.plaquetas_caravista": {
        codigo: "REV001",
        estado: "propuesto",
        nota:
            "REV001 es aplacado de gres porcelánico 30x30 con mortero cola (61,88 €/m²). " +
            "NO es plaqueta de caravista: es lo más próximo que hay. Si Scala repone " +
            "plaqueta cerámica tipo ladrillo, conviene partida propia.",
    },
    "saneado.masilla": {
        codigo: "",
        estado: "sin_equivalencia",
        nota:
            "No hay partida de plastecido con masilla en paramento interior. FAC009 es " +
            "masilla elástica en grieta y se mide en ml, no en m².",
    },
    "saneado.mortero": {
        codigo: "FAC003",
        estado: "propuesto",
        nota: "FAC003, enfoscado de cemento interior a buena vista 15 mm (20,67 €/m²).",
    },
    "saneado.yeso": {
        codigo: "",
        estado: "sin_equivalencia",
        nota:
            "La tarifa tiene el picado de enlucido de yeso (DEM010) pero no su ejecución. " +
            "Falta la partida de enlucido/guarnecido de yeso.",
    },
    "varios.puerta_zaguan": {
        codigo: "CER005",
        estado: "propuesto",
        nota:
            "CER005, puerta metálica de chapa galvanizada de acceso a escalera (525 €/ud). " +
            "Si la puerta del zaguán es de aluminio o lleva vidrio, no sirve.",
    },

    // --- Cubiertas: impermeabilización y pavimento --------------------------
    "impermeabilizacion.tela_asfaltica.retirada_manual": {
        codigo: "DEM012",
        estado: "propuesto",
        nota: "DEM012, levantado manual de lámina de impermeabilización en cubierta plana (9,25 €/m²).",
    },
    "impermeabilizacion.tela_asfaltica.retirada_automatica": {
        codigo: "DEM012",
        estado: "propuesto",
        nota:
            "Mismo código que la manual: la tarifa solo tiene el levantado manual. Si la " +
            "retirada mecánica tiene rendimiento y coste distintos, hay que añadir partida.",
    },
    "impermeabilizacion.colocacion_pavimento.retirada_antigua": {
        codigo: "DEM005",
        estado: "propuesto",
        nota:
            "DEM005, demolición de pavimento cerámico en cubierta plana (14,75 €/m²). Si el " +
            "solado arrastra capa de mortero va DEM013 (17,75 €/m²).",
    },
    "impermeabilizacion.colocacion_pavimento.colocacion_doblada": {
        codigo: "REV014",
        estado: "propuesto",
        nota:
            "REV014, pavimento de terraza en gres porcelánico antideslizante 60x60 " +
            "(65 €/m²). La tarifa no distingue colocación doblada de nueva: la diferencia " +
            "real es que la doblada se ahorra la demolición previa, que ya va aparte.",
    },
    "impermeabilizacion.colocacion_pavimento.colocacion_nueva": {
        codigo: "REV014",
        estado: "propuesto",
        nota: "Mismo código que la colocación doblada. Ver nota anterior.",
    },

    // --- Cubiertas: petos y casetones ---------------------------------------
    "petos_y_casetones.peto": {
        codigo: "IMP009",
        estado: "propuesto",
        nota:
            "IMP009, impermeabilización de murete perimetral de cubierta con lámina " +
            "asfáltica (60,94 €/m). La unidad nativa es m y la captura mide ml: encaja.",
    },
    "petos_y_casetones.casetones": {
        codigo: "",
        estado: "sin_equivalencia",
        nota:
            "No hay partida de casetón por unidad. El trabajo real se descompone en " +
            "impermeabilización + pintura + peto, que ya tienen partida propia. Decisión " +
            "de Miguel: ¿se descompone en el formulario o se crea partida alzada?",
    },
    "petos_y_casetones.techo_caseton": {
        codigo: "IMP001",
        estado: "propuesto",
        nota:
            "IMP001, sustitución de lámina bituminosa autoprotegida monocapa en cubierta " +
            "plana (29,38 €/m²). Si el techo del casetón es de obra nueva y no sustitución, " +
            "va IMP005 (81,25 €/m²).",
    },

    // --- Bajantes: interior --------------------------------------------------
    "interior.demolicion.tabique": {
        codigo: "",
        estado: "sin_equivalencia",
        nota:
            "El capítulo 01 no tiene demolición de tabique: solo revestimientos, alicatados " +
            "y pavimentos. Falta partida.",
    },
    "interior.demolicion.azulejo": {
        codigo: "DEM003",
        estado: "propuesto",
        nota: "DEM003, demolición de alicatado de azulejo por medios manuales (13,69 €/m²).",
    },
    "interior.retirada.pvc": {
        codigo: "",
        estado: "sin_equivalencia",
        nota:
            "No hay partida de retirada de bajante de PVC. El capítulo 12 solo tiene la " +
            "colocación (INS003/INS004). Falta partida.",
    },
    "interior.retirada.fibrocemento.con_documentacion": {
        codigo: "AMI003",
        estado: "propuesto",
        nota:
            "AMI003, retirada de tuberías de fibrocemento de saneamiento por empresa RERA " +
            "(40,24 €/m). Solo Scala: Vertical Projects no tiene licencia (DERCAS §4.1). " +
            "El presupuesto debería arrastrar también AMI008 (plan de trabajo) y AMI007 " +
            "(transporte a vertedero), que hoy no se capturan.",
    },
    "interior.retirada.fibrocemento.normal": {
        codigo: "AMI003",
        estado: "propuesto",
        nota:
            "MISMO CÓDIGO que \"con documentación\", y esto hay que hablarlo: el " +
            "fibrocemento es amianto lleve o no papeles, y su retirada exige empresa RERA " +
            "y plan de trabajo. La opción \"Normal\" del formulario sugiere que se puede " +
            "retirar sin ese circuito. Decisión de Miguel y revisión del catálogo de captura.",
    },
    "interior.colocacion.pvc": {
        codigo: "INS004",
        estado: "propuesto",
        nota: "INS004, bajante de PVC serie B D=110 mm (49,18 €/m). Para D=90 mm va INS003 (45,15 €/m).",
    },
    "interior.cierre_rozas.pared_o_tabique": {
        codigo: "FAC019",
        estado: "propuesto",
        nota:
            "FAC019, cerramiento de ladrillo hueco doble tabicón de 9 cm (35 €/m²). No " +
            "incluye el enfoscado posterior: si se cobra, va FAC003 aparte.",
    },
    "interior.cierre_rozas.azulejo": {
        codigo: "REV007",
        estado: "propuesto",
        nota: "REV007, alicatado de azulejo cerámico hasta 25x40 interior (35,63 €/m²).",
    },

    // --- Bajantes: exterior --------------------------------------------------
    // Mismos trabajos que en interior pero con acceso distinto, así que van con
    // entrada propia y no como sinónimo: si Miguel decide repercutir el
    // sobrecoste de trabajar en fachada, se toca solo esta mitad.
    "exterior.retirada.pvc": {
        codigo: "",
        estado: "sin_equivalencia",
        nota: "Igual que interior.retirada.pvc: no existe la partida de retirada.",
    },
    "exterior.retirada.fibrocemento.con_documentacion": {
        codigo: "AMI003",
        estado: "propuesto",
        nota: "AMI003. Mismas advertencias que en la retirada interior con documentación.",
    },
    "exterior.retirada.fibrocemento.normal": {
        codigo: "AMI003",
        estado: "propuesto",
        nota: "AMI003. Mismas advertencias que en interior.retirada.fibrocemento.normal.",
    },
    "exterior.colocacion.pvc": {
        codigo: "INS004",
        estado: "propuesto",
        nota: "INS004, bajante de PVC serie B D=110 mm (49,18 €/m).",
    },
};

/**
 * Excepciones por módulo. Gana sobre `MAPA_SUBRUTAS`.
 * Clave externa: `key` del módulo. Clave interna: subruta (ya canonizada).
 *
 * Vacío hoy. Se llenará cuando Miguel confirme que un mismo trabajo cambia de
 * partida según la zona.
 */
export const EXCEPCIONES_MODULO: Record<string, Record<string, MapeoPartida>> = {};

// ---------------------------------------------------------------------------
// Texto libre
// ---------------------------------------------------------------------------

/**
 * Un nodo es presupuestable si es hoja Y tiene medición. Sin unidad no hay
 * cantidad, y sin cantidad no hay importe: no es que falte mapearlo, es que no
 * puede llevar partida.
 *
 * Hoy coincide con `permiteTextoLibre`, pero el criterio bueno es la medición:
 * si mañana alguien añade una hoja sin unidad y sin marcar texto libre, esta
 * comprobación la caza igual.
 */
export function esNodoPresupuestable(nodo: NodoCatalogo): boolean {
    return esPartida(nodo) && Boolean(nodo.medicion);
}

function subcuentaDe(payload: PayloadVisita): Subcuenta {
    return (SUBCUENTAS as readonly string[]).includes(payload.subcuenta)
        ? (payload.subcuenta as Subcuenta)
        : "scala-valencia";
}

/**
 * True si la ruta corresponde a un nodo de texto libre ("Varios", "Otros").
 * False si la ruta no existe en el catálogo: eso es una ruta desconocida, un
 * problema distinto que sí debe bloquear.
 */
export function esRutaTextoLibre(ruta: string, subcuenta: Subcuenta = "scala-valencia"): boolean {
    const encontrado = buscarNodoPorRuta(subcuenta, ruta);
    if (!encontrado) return false;
    return !esNodoPresupuestable(encontrado.nodo);
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export function mapearRuta(ruta: string): MapeoPartida | undefined {
    const modulo = moduloDeRuta(ruta);
    const subruta = canonizarSubruta(subrutaDe(ruta));
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

export type AuditoriaPayload = {
    /** Rutas que no están en el mapa. Bloquean. */
    desconocidas: string[];
    /** Rutas sin partida posible en la tarifa. Bloquean. */
    sinEquivalencia: { ruta: string; nota?: string }[];
    /** Rutas valoradas con equivalencia pendiente de validar por Miguel. No bloquean. */
    propuestas: { ruta: string; codigo: string; nota?: string }[];
    /** Nodos sin medición. No son presupuestables por diseño. No bloquean. */
    textoLibre: { ruta: string; nota?: string }[];
};

export function auditarPayload(payload: PayloadVisita): AuditoriaPayload {
    const subcuenta = subcuentaDe(payload);

    const desconocidas: string[] = [];
    const sinEquivalencia: { ruta: string; nota?: string }[] = [];
    const propuestas: { ruta: string; codigo: string; nota?: string }[] = [];
    const textoLibre: { ruta: string; nota?: string }[] = [];

    const rutas = new Set(payload.modulos.flatMap((m) => m.partidas).map((p) => p.ruta));

    for (const ruta of rutas) {
        // Antes que nada: un nodo de texto libre nunca es un fallo de mapeo.
        // Comprobarlo primero evita que un "Varios" bloquee el presupuesto
        // entero, que es lo que pasaba hasta el 09/09/2026.
        if (esRutaTextoLibre(ruta, subcuenta)) {
            textoLibre.push({
                ruta,
                nota: "Nodo sin medición: se excluye del cálculo y se avisa al comercial.",
            });
            continue;
        }

        const m = mapearRuta(ruta);
        if (!m) desconocidas.push(ruta);
        else if (m.estado === "sin_equivalencia" || !m.codigo) sinEquivalencia.push({ ruta, nota: m.nota });
        else if (m.estado === "propuesto") propuestas.push({ ruta, codigo: m.codigo, nota: m.nota });
    }

    return { desconocidas, sinEquivalencia, propuestas, textoLibre };
}

/** Compatibilidad con la API anterior. */
export function rutasSinPrecio(payload: PayloadVisita): string[] {
    const a = auditarPayload(payload);
    return [...a.desconocidas, ...a.sinEquivalencia.map((s) => s.ruta)];
}

/**
 * Rutas de texto libre presentes en la visita. La API las convierte en avisos:
 * el comercial escribió algo que no va a aparecer valorado en el documento y
 * tiene que saberlo antes de enviarlo.
 */
export function rutasTextoLibre(payload: PayloadVisita): string[] {
    return auditarPayload(payload).textoLibre.map((t) => t.ruta);
}

/** Rutas valoradas con una equivalencia que Miguel todavía no ha validado. */
export function rutasConEquivalenciaPropuesta(payload: PayloadVisita): string[] {
    return auditarPayload(payload).propuestas.map((p) => p.ruta);
}

// ---------------------------------------------------------------------------
// Auditoría del catálogo completo
// ---------------------------------------------------------------------------

export type PartidaCatalogo = {
    moduloKey: string;
    moduloLabel: string;
    ruta: string;
    /** Subruta tal cual está en el árbol. */
    subruta: string;
    /** Subruta canónica: la que decide el mapeo. Igual a `subruta` si no hay sinónimo. */
    subrutaCanonica: string;
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
export function recorrerCatalogo(subcuenta: Subcuenta = "scala-valencia"): PartidaCatalogo[] {
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

            const subruta = subrutaDe(ruta);

            resultado.push({
                moduloKey: modulo.key,
                moduloLabel: modulo.label,
                ruta,
                subruta,
                subrutaCanonica: canonizarSubruta(subruta),
                camino: caminos.get(ruta) ?? ruta,
                unidad: nodo.medicion ? ETIQUETA_UNIDAD[nodo.medicion.unidad] : "—",
                textoLibre: !esNodoPresupuestable(nodo),
                mapeo: mapearRuta(ruta),
            });
        });
    }

    return resultado;
}

export type ResumenCobertura = {
    partidas: number;
    /** Subrutas distintas del árbol, texto libre incluido. */
    subrutas: number;
    /** Subrutas que pueden llevar partida de tarifa. Es la base real de la cobertura. */
    subrutasPresupuestables: number;
    confirmado: number;
    propuesto: number;
    sinEquivalencia: number;
    sinMapear: number;
    textoLibre: number;
    /** Subrutas resueltas vía `SINONIMOS_SUBRUTA`. */
    sinonimos: number;
};

/** Cobertura contada por SUBRUTA, que es la unidad real de decisión. */
export function resumenCobertura(subcuenta: Subcuenta = "scala-valencia"): ResumenCobertura {
    const partidas = recorrerCatalogo(subcuenta);
    const porSubruta = new Map<string, PartidaCatalogo>();
    for (const p of partidas) if (!porSubruta.has(p.subruta)) porSubruta.set(p.subruta, p);

    const r: ResumenCobertura = {
        partidas: partidas.length,
        subrutas: porSubruta.size,
        subrutasPresupuestables: 0,
        confirmado: 0,
        propuesto: 0,
        sinEquivalencia: 0,
        sinMapear: 0,
        textoLibre: 0,
        sinonimos: 0,
    };

    for (const p of porSubruta.values()) {
        // El texto libre no compite por cobertura: no hay nada que mapear.
        // Contarlo como "sin mapear" ensuciaba el informe de Miguel con dos
        // decisiones que no son suyas.
        if (p.textoLibre) {
            r.textoLibre++;
            continue;
        }

        r.subrutasPresupuestables++;
        if (p.subrutaCanonica !== p.subruta) r.sinonimos++;

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

    const excluidas = new Set(auditoria.textoLibre.map((t) => t.ruta));
    const lineas: LineaSolicitada[] = [];

    for (const modulo of payload.modulos) {
        for (const partida of modulo.partidas) {
            // Texto libre: no tiene unidad ni precio. Va a los avisos de la API,
            // no al cálculo.
            if (excluidas.has(partida.ruta)) continue;

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

    // --- Sinónimos ----------------------------------------------------------
    const delCatalogo = recorrerCatalogo();
    const subrutasCatalogo = new Set(delCatalogo.map((p) => p.subruta));

    for (const [origen, destino] of Object.entries(SINONIMOS_SUBRUTA)) {
        if (!subrutasCatalogo.has(origen)) {
            fallos.push(`sinónimo ${origen}: no existe en el catálogo de captura. ¿Sobra?`);
        }
        if (origen === destino) {
            fallos.push(`sinónimo ${origen}: apunta a sí mismo.`);
        }
        if (SINONIMOS_SUBRUTA[destino]) {
            fallos.push(
                `sinónimo ${origen} -> ${destino}: el destino es a su vez un sinónimo. ` +
                    `Los sinónimos no se encadenan: apunta directo a la subruta canónica.`
            );
        }
        if (MAPA_SUBRUTAS[origen]) {
            fallos.push(
                `sinónimo ${origen}: está también en MAPA_SUBRUTAS. Dos fuentes de verdad ` +
                    `para el mismo trabajo. Borra una de las dos.`
            );
        }
        if (!MAPA_SUBRUTAS[destino]) {
            // Puede pasar legítimamente si el destino aún no está mapeado, pero
            // entonces el sinónimo no desbloquea nada y conviene saberlo.
            fallos.push(
                `sinónimo ${origen} -> ${destino}: el destino no está en MAPA_SUBRUTAS, ` +
                    `así que el sinónimo no resuelve nada todavía.`
            );
        }
    }

    // Subrutas mapeadas que ya no existen en el catálogo: basura que confunde.
    for (const subruta of Object.keys(MAPA_SUBRUTAS)) {
        if (!subrutasCatalogo.has(subruta)) {
            fallos.push(`${subruta}: mapeada pero no existe en el catálogo de captura. ¿Sobra?`);
        }
    }

    // Nodos de texto libre que alguien haya mapeado por error.
    for (const p of delCatalogo) {
        if (p.textoLibre && p.mapeo) {
            fallos.push(
                `${p.subruta}: es texto libre (sin medición) pero tiene mapeo. ` +
                    `No puede llevar partida: no hay cantidad que multiplicar.`
            );
        }
    }

    // --- Coherencia con lo que se oculta en el formulario -------------------
    //
    // `lib/catalogo/disponibilidad.ts` mantiene la lista de subrutas que NO se
    // le ofrecen al comercial. Se duplica a propósito, para no arrastrar la
    // tarifa entera al bundle de cliente, y por eso hay que comprobar que las
    // dos dicen lo mismo. Si divergen pasa una de dos cosas, ambas malas:
    // se oculta un trabajo que sí se puede valorar (venta perdida), o se ofrece
    // uno que no (el comercial vuelve de la visita y se come un 422).
    const sinEquivalencia = new Set(
        delCatalogo.filter((p) => p.mapeo?.estado === "sin_equivalencia").map((p) => p.subruta)
    );

    for (const subruta of sinEquivalencia) {
        if (!SUBRUTAS_SIN_PRECIO.has(subruta)) {
            fallos.push(
                `${subruta}: no tiene partida en la tarifa pero SIGUE VISIBLE en el ` +
                    `formulario. Añádela a SUBRUTAS_SIN_PRECIO en lib/catalogo/disponibilidad.ts.`
            );
        }
    }

    for (const subruta of SUBRUTAS_SIN_PRECIO) {
        if (!subrutasCatalogo.has(subruta)) {
            fallos.push(
                `${subruta}: está oculta en el formulario pero no existe en el catálogo ` +
                    `de captura. Bórrala de SUBRUTAS_SIN_PRECIO.`
            );
            continue;
        }
        if (!sinEquivalencia.has(subruta)) {
            fallos.push(
                `${subruta}: está oculta en el formulario pero SÍ tiene partida de tarifa. ` +
                    `Bórrala de SUBRUTAS_SIN_PRECIO: se está perdiendo trabajo presupuestable.`
            );
        }
    }

    return fallos;
}

export { UNIDADES_SELECCIONABLES };