import type { ModuloTrabajo, NodoCatalogo } from "./tipos";
import { mediosAuxiliares, picado, limpieza, saneado, pintura, varios } from "./estructuras";

/**
 * Los 12 módulos de trabajo (apartado 2 del brief del cliente).
 *
 * Convención de las claves (`key`): snake_case, sin acentos. Viajan al JSON que
 * se guarda en la oportunidad de GHL, así que son contrato: renombrar una clave
 * ya usada en producción rompe el histórico y el motor de IA de Fase 2.
 *
 * Las partidas marcadas TODO(validar) proceden de los esquemas manuscritos y no
 * aparecen en el texto del cliente. Pendientes de confirmación de Miguel.
 */

/** 3. Estructura común a Fachada principal, Fachada trasera, Medianeras y Patio de luces. */
function estructuraFachadas(): NodoCatalogo[] {
    return [mediosAuxiliares(), picado(), saneado(), pintura(), varios()];
}

/** 4. Cubiertas. */
function estructuraCubiertas(): NodoCatalogo[] {
    return [
        mediosAuxiliares(),
        // En Cubiertas la limpieza es grupo propio, por eso Picado va sin ella.
        picado({ incluirLimpieza: false }),
        saneado(),
        pintura(),
        {
            key: "impermeabilizacion",
            label: "Impermeabilización",
            hijos: [
                { key: "mortero_fibras", label: "Mortero + fibras", medicion: { unidad: "m2" } },
                { key: "epdm", label: "EPDM", medicion: { unidad: "m2" } },
                {
                    key: "tela_asfaltica",
                    label: "Tela asfáltica",
                    hijos: [
                        // TODO(validar): desglose tomado del esquema manuscrito.
                        { key: "retirada_antigua", label: "Retirada de la antigua", medicion: { unidad: "m2" } },
                        { key: "colocacion_doblada", label: "Colocación doblada", medicion: { unidad: "m2" } },
                        { key: "colocacion_nueva", label: "Colocación de nueva", medicion: { unidad: "m2" } },
                    ],
                },
                { key: "colocacion_pavimento", label: "Colocación de pavimento", medicion: { unidad: "m2" } },
            ],
        },
        limpieza(),
        // TODO(validar): el esquema pide "una pestaña para contemplar también el
        // techo del casetón" y trata Peto y Casetones como ámbito propio de cubierta.
        {
            key: "petos_y_casetones",
            label: "Petos y casetones",
            hijos: [
                { key: "peto", label: "Peto", medicion: { unidad: "ml" } },
                { key: "casetones", label: "Casetones", medicion: { unidad: "ud" } },
                { key: "techo_caseton", label: "Techo del casetón", medicion: { unidad: "m2" } },
            ],
        },
        varios(),
    ];
}

/** 5. Reparaciones puntuales. */
function estructuraReparaciones(): NodoCatalogo[] {
    return [
        mediosAuxiliares(),
        {
            key: "picado",
            label: "Picado",
            // TODO(validar): desglose tomado del esquema manuscrito. El texto solo
            // enuncia el grupo "Picado" sin hojas.
            hijos: [
                { key: "cantos_forjado", label: "Cantos de forjado", medicion: { unidad: "ml" } },
                { key: "abombamientos_flechados", label: "Abombamientos o flechados", medicion: { unidad: "m2" } },
                { key: "grietas", label: "Grietas", medicion: { unidad: "ml" } },
                { key: "plaquetas_caravista", label: "Plaquetas de caravista", medicion: { unidad: "m2" } },
            ],
        },
        {
            key: "reparacion",
            label: "Reparación",
            hijos: [
                // TODO(validar): desglose tomado del esquema manuscrito.
                { key: "geolite_t40", label: "Geolite T40", medicion: { unidad: "m2" } },
                { key: "mortero_m75_arena", label: "Mortero M-7,5 + arena", medicion: { unidad: "m2" } },
                { key: "plaquetas_caravista", label: "Plaquetas de caravista", medicion: { unidad: "m2" } },
            ],
        },
        {
            key: "revestimiento_pintura",
            label: "Revestimiento / Pintura",
            hijos: [
                { key: "acrilico", label: "Acrílico", medicion: { unidad: "m2" } },
                {
                    key: "hidrofugo_caravista",
                    label: "Hidrófugo caravista",
                    hijos: [
                        { key: "incoloro", label: "Incoloro", medicion: { unidad: "m2" } },
                        { key: "brillante", label: "Brillante", medicion: { unidad: "m2" } },
                    ],
                },
            ],
        },
        varios(),
    ];
}

/** 6. Escalera y zaguán. */
function estructuraEscaleraZaguan(): NodoCatalogo[] {
    return [
        {
            key: "picado",
            label: "Picado",
            hijos: [
                { key: "zonas_mal_estado", label: "Picado de zonas en mal estado", medicion: { unidad: "m2" } },
            ],
        },
        {
            key: "saneado",
            label: "Saneado",
            // TODO(validar): desglose tomado del esquema manuscrito.
            hijos: [
                { key: "masilla", label: "Masilla", medicion: { unidad: "m2" } },
                { key: "mortero", label: "Mortero", medicion: { unidad: "m2" } },
                { key: "yeso", label: "Yeso", medicion: { unidad: "m2" } },
            ],
        },
        {
            key: "pintura",
            label: "Pintura",
            hijos: [
                { key: "plastica_interior", label: "Plástica de interior", medicion: { unidad: "m2" } },
                {
                    key: "esmalte_barandillas_rejas",
                    label: "Esmalte de barandillas y rejas",
                    medicion: { unidad: "ml" },
                },
                // TODO(validar): el esquema anota tambien la puerta del ascensor.
                {
                    key: "esmalte_puerta_ascensor",
                    label: "Esmalte de puerta de ascensor",
                    medicion: { unidad: "ud" },
                },
            ],
        },
        {
            key: "varios",
            label: "Varios",
            permiteTextoLibre: true,
            hijos: [
                { key: "puerta_zaguan", label: "Puerta del zaguán", medicion: { unidad: "ud" } },
                { key: "otros", label: "Otros" },
            ],
        },
    ];
}

/** 7. Bajantes. Dos bloques independientes: interior y exterior. */
function estructuraBajantes(): NodoCatalogo[] {
    const retiradaBajante = (key: string): NodoCatalogo => ({
        key,
        label: "Retirada de bajante",
        hijos: [
            { key: "pvc", label: "PVC", medicion: { unidad: "ml" } },
            {
                key: "fibrocemento",
                label: "Fibrocemento",
                hijos: [
                    {
                        key: "con_documentacion",
                        label: "Con documentación",
                        medicion: { unidad: "ml" },
                        // El fibrocemento con documentación es amianto: requiere licencia
                        // que Vertical Projects no tiene (DERCAS §4.1 y §5.4).
                        alerta:
                            "Trabajo con amianto: añade también el módulo Gestión de residuos, que se presupuesta y factura aparte.",
                    },
                    { key: "normal", label: "Normal", medicion: { unidad: "ml" } },
                ],
            },
        ],
    });

    return [
        {
            key: "interior",
            label: "Interior",
            hijos: [
                {
                    key: "demolicion",
                    label: "Demolición",
                    hijos: [
                        { key: "tabique", label: "Tabique", medicion: { unidad: "m2" } },
                        { key: "azulejo", label: "Azulejo", medicion: { unidad: "m2" } },
                    ],
                },
                retiradaBajante("retirada"),
                {
                    key: "colocacion",
                    label: "Colocación de la nueva",
                    hijos: [{ key: "pvc", label: "PVC", medicion: { unidad: "ml" } }],
                },
                {
                    key: "cierre_rozas",
                    label: "Cierre de la apertura realizada",
                    hijos: [
                        { key: "pared_o_tabique", label: "Pared o tabique", medicion: { unidad: "m2" } },
                        { key: "azulejo", label: "Azulejo", medicion: { unidad: "m2" } },
                    ],
                },
            ],
        },
        {
            key: "exterior",
            label: "Exterior",
            hijos: [
                mediosAuxiliares(),
                retiradaBajante("retirada"),
                {
                    key: "colocacion",
                    label: "Colocación de la nueva",
                    hijos: [{ key: "pvc", label: "PVC", medicion: { unidad: "ml" } }],
                },
            ],
        },
    ];
}

/**
 * 10. Gestion de residuos.
 *
 * El cliente confirma que la retirada de amianto vive aqui, no como modelo de
 * negocio propio. Eso lo convierte en un modulo presupuestable, no en un cajon:
 * el amianto lo factura Escala aparte (DERCAS 5.4) y necesita medicion, tipologia
 * y documentacion propias.
 *
 * TODO(validar): estructura propuesta por Advantys. Los esquemas manuscritos no
 * desarrollan este modulo; las tipologias salen de lo que si aparece en Bajantes
 * (fibrocemento con y sin documentacion).
 */
function estructuraGestionResiduos(): NodoCatalogo[] {
    return [
        {
            key: "retirada_amianto",
            label: "Retirada de amianto / fibrocemento",
            alerta: "Requiere licencia RERA y plan de trabajo. Solo Escala Valencia.",
            hijos: [
                { key: "placas_fibrocemento", label: "Placas de fibrocemento", medicion: { unidad: "m2" } },
                { key: "bajantes_fibrocemento", label: "Bajantes de fibrocemento", medicion: { unidad: "ml" } },
                { key: "depositos_fibrocemento", label: "Depósitos de fibrocemento", medicion: { unidad: "ud" } },
                { key: "otros_elementos", label: "Otros elementos", medicion: { unidad: "ud" } },
            ],
        },
        {
            key: "retirada_escombro",
            label: "Retirada de escombro",
            hijos: [
                { key: "contenedor", label: "Contenedor", medicion: { unidad: "ud" } },
                { key: "big_bag", label: "Saca / big bag", medicion: { unidad: "ud" } },
            ],
        },
        {
            key: "documentacion_gestion",
            label: "Documentación y gestión",
            hijos: [
                { key: "plan_trabajo", label: "Plan de trabajo", medicion: { unidad: "ud" } },
                { key: "seguimiento_ambiental", label: "Seguimiento ambiental", medicion: { unidad: "ud" } },
                { key: "gestor_autorizado", label: "Gestor autorizado / vertedero", medicion: { unidad: "ud" } },
            ],
        },
        varios(),
    ];
}

export const MODULOS: ModuloTrabajo[] = [
    {
        key: "medianeras",
        label: "Medianeras",
        orden: 1,
        captura: "arbol",
        estructura: estructuraFachadas(),
        modeloNegocioDercas: "rehabilitacion_impermeabilizacion",
    },
    {
        key: "fachada_principal",
        label: "Fachada principal",
        orden: 2,
        captura: "arbol",
        estructura: estructuraFachadas(),
        modeloNegocioDercas: "rehabilitacion_impermeabilizacion",
    },
    {
        key: "fachada_trasera",
        label: "Fachada trasera",
        orden: 3,
        captura: "arbol",
        estructura: estructuraFachadas(),
        modeloNegocioDercas: "rehabilitacion_impermeabilizacion",
    },
    {
        key: "patio_de_luces",
        label: "Patio de luces",
        orden: 4,
        captura: "arbol",
        estructura: estructuraFachadas(),
        modeloNegocioDercas: "rehabilitacion_impermeabilizacion",
    },
    {
        key: "cubiertas",
        label: "Cubiertas",
        orden: 5,
        captura: "arbol",
        estructura: estructuraCubiertas(),
        modeloNegocioDercas: "rehabilitacion_impermeabilizacion",
    },
    {
        key: "reparaciones_puntuales",
        label: "Reparaciones puntuales",
        orden: 6,
        captura: "arbol",
        estructura: estructuraReparaciones(),
        modeloNegocioDercas: "rehabilitacion_impermeabilizacion",
    },
    {
        key: "escaleras_y_zaguan",
        label: "Escaleras y zaguán",
        orden: 7,
        captura: "arbol",
        estructura: estructuraEscaleraZaguan(),
        modeloNegocioDercas: "reformas_zonas_comunes",
    },
    {
        key: "bajantes",
        label: "Bajantes",
        orden: 8,
        captura: "arbol",
        estructura: estructuraBajantes(),
        modeloNegocioDercas: "descuelgues_verticales",
    },
    {
        key: "proyectos",
        label: "Proyectos",
        orden: 9,
        captura: "importacion",
        estructura: [],
        modeloNegocioDercas: null,
        notaInterna:
            "Importación de Excel / BC3 / PDF del arquitecto. En B6 solo se adjunta y enlaza; el parseo de BC3 (FIEBDC-3) queda para Fase 2.",
    },
    {
        key: "gestion_de_residuos",
        label: "Gestión de residuos",
        orden: 10,
        captura: "arbol",
        estructura: estructuraGestionResiduos(),
        modeloNegocioDercas: "retirada_amianto",
        // Minimo del DERCAS 6.2 para amianto, aplicado donde el amianto vive ahora.
        fotosMinimas: 3,
        notaInterna:
            "Absorbe la retirada de amianto por decision del cliente (17/08/2026). Vertical Projects no tiene licencia: este modulo dispara la derivacion a Escala (DERCAS §5.4), pendiente de automatizar.",
    },
    {
        key: "documentacion",
        label: "Documentación",
        orden: 11,
        captura: "libre",
        estructura: [],
        modeloNegocioDercas: null,
        notaInterna: "Sin estructura definida por el cliente.",
    },
    {
        key: "varios",
        label: "Varios",
        orden: 12,
        captura: "libre",
        estructura: [],
        modeloNegocioDercas: null,
        notaInterna: "Sin estructura definida por el cliente.",
    },
];