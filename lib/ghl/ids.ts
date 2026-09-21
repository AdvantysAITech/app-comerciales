import type { SubcuentaSlug as Subcuenta } from "../subcuenta";

/**
 * lib/ghl/ids.ts
 *
 * IDs de GHL de cada subcuenta: pipeline, etapas, custom fields de oportunidad
 * y asociaciones. ÚNICO sitio donde viven.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ EXISTE (16/09/2026)
 * ---------------------------------------------------------------------------
 * Vertical Projects se ha creado con el snapshot de Scala Valencia. El snapshot
 * copia la estructura, pero GHL asigna IDs NUEVOS en la location de destino
 * (verificado por API: ningún ID coincide). Hasta hoy los IDs de Scala estaban
 * escritos a mano en cuatro ficheros, así que desde la sesión de Toni la app
 * pedía a la location de Vertical un pipeline y unos campos que allí no existen.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ EN CÓDIGO Y NO EN VARIABLES DE ENTORNO
 * ---------------------------------------------------------------------------
 * No son secretos, son 17 por subcuenta, y un valor mal pegado en Vercel no se
 * ve en ningún diff. Aquí quedan versionados y `npm run ghl:comparar` los
 * contrasta contra la API real de las dos locations.
 *
 * El campo "Estado documento" sigue en variable de entorno
 * (SA_CAMPO_ESTADO_DOCUMENTO / SA_VERTICAL_CAMPO_ESTADO_DOCUMENTO): su ausencia
 * es la que desactiva la generación de documentos por subcuenta, y ese
 * interruptor tiene que poder tocarse sin desplegar.
 *
 * ---------------------------------------------------------------------------
 * DE DÓNDE SALEN
 * ---------------------------------------------------------------------------
 * Scala: los que ya usaba el código, confirmados por curl/PowerShell entre el
 * 31/07 y el 10/09/2026.
 * Vertical: API de la location KBsOef9D6vxu8FY6Ap2n el 16/09/2026.
 *   - Etapas emparejadas por `originId` (Base64 del ID de la etapa de Scala de
 *     la que proceden), no por nombre: en Vertical "Ganada" y "Pérdida" se
 *     llaman "GANADA" y "PERDIDA".
 *   - Campos emparejados por `fieldKey`.
 *   - Asociaciones por `key`, con el mismo orden de objetos que en Scala.
 *
 * Si se vuelve a aplicar un snapshot sobre una subcuenta, estos IDs pueden
 * cambiar: lanza `npm run ghl:comparar` antes de desplegar.
 */

export const CLAVES_ETAPA = [
    "AVISO_RECIBIDO",
    "VISITA_CONCERTADA",
    "DATOS_RECOGIDOS",
    "PRESUPUESTO_EN_REVISION",
    "PRESUPUESTO_ENVIADO",
    "EN_NEGOCIACION",
    "GANADA",
    "PERDIDA",
] as const;

export type ClaveEtapa = (typeof CLAVES_ETAPA)[number];

export type CampoOportunidad =
    | "MODELO_NEGOCIO"
    | "DESCRIPCION"
    | "FECHA_VISITA"
    | "COMUNIDAD"
    /** LARGE_TEXT con el JSON canónico de la visita. */
    | "DATOS_VISITA"
    /** FILE_UPLOAD donde se adjunta el presupuesto generado. */
    | "PRESUPUESTO"
    /**
     * LARGE_TEXT con los ajustes de dirección sobre el presupuesto calculado.
     *
     * Lo escribe la pantalla de revisión. Va en su propio campo y NO dentro del
     * registro de estado: el registro es la máquina de estados de una generación
     * concreta y es terminal, mientras que los ajustes tienen que sobrevivir a
     * todas las versiones del documento.
     */
    | "AJUSTES_PRESUPUESTO";

/**
 * Casillas (CHECKBOX) de la oportunidad que gobiernan el circuito de validación.
 *
 * ---------------------------------------------------------------------------
 * COMPORTAMIENTO VERIFICADO POR API (21/09/2026)
 * ---------------------------------------------------------------------------
 *  - El valor de un CHECKBOX es un ARRAY de etiquetas, no un booleano.
 *  - La etiqueta tiene que coincidir EXACTAMENTE con una opción del picklist.
 *    Cualquier otra cadena se guarda tal cual, GHL responde 200 y la casilla NO
 *    queda marcada. Pasó en la prueba con el literal "<OPCIÓN EXACTA>".
 *  - Para desmarcar se envía el array vacío. El campo entonces DESAPARECE de
 *    `customFields`: en GHL, ausencia = vacío. Nunca es un error.
 *  - El ciclo desmarcar -> marcar vuelve a disparar el trigger "Opportunity
 *    Changed / Added" de los workflows. De eso depende que la segunda
 *    generación de una misma oportunidad avise otra vez a dirección.
 */
export type CasillaOportunidad =
    /** La app ha publicado un documento. Dispara el aviso de revisión. */
    | "PRESUPUESTO_GENERADO"
    /** Dirección da el presupuesto por bueno. Dispara el aviso al comercial. */
    | "PRESUPUESTO_VALIDADO";

export type CampoCasilla = {
    id: string;
    /** Opción EXACTA del picklist. Ver la nota de arriba. */
    opcion: string;
};

export type AsociacionGhl =
    /** Comunidades De Propietarios -> Opportunity. */
    | "COMUNIDAD_OPORTUNIDAD"
    /** Administradores De Fincas -> Comunidades. firstRecordId = administrador. */
    | "ADMINISTRADOR_COMUNIDAD";

export type IdsGhl = {
    pipelineId: string;
    etapas: Readonly<Record<ClaveEtapa, string>>;
    /** Cadena vacía = el campo no existe todavía en esa subcuenta. */
    campos: Readonly<Record<CampoOportunidad, string>>;
    /** `null` = la casilla no existe todavía en esa subcuenta. */
    casillas: Readonly<Record<CasillaOportunidad, CampoCasilla | null>>;
    asociaciones: Readonly<Record<AsociacionGhl, string>>;
};

const IDS: Readonly<Record<Subcuenta, IdsGhl>> = {
    "scala-valencia": {
        pipelineId: "Lg3gwS0oqpYDiBm8bjcD",
        etapas: {
            AVISO_RECIBIDO: "4d3b0cf1-c995-4fa4-9cac-bcde44b24d62",
            VISITA_CONCERTADA: "2f764a91-4a30-4d3e-b4bb-ad5c654e7b6a",
            DATOS_RECOGIDOS: "c1c13b28-af25-4769-b95b-cdb89500a9b7",
            PRESUPUESTO_EN_REVISION: "c5e51f0b-763f-4cce-b581-f6919f66ba29",
            PRESUPUESTO_ENVIADO: "3d1f30db-9c7d-4391-90d7-50d98b217e42",
            EN_NEGOCIACION: "eb1fe6ae-b418-4df0-84cd-cb27b6fb051c",
            GANADA: "74963521-4c81-447e-8fb5-858bf0b8120a",
            PERDIDA: "f89b0539-1afa-4f1f-be2a-517b22f415c9",
        },
        campos: {
            MODELO_NEGOCIO: "PTtDhuZnyksZ9Tj0Sb4f",
            DESCRIPCION: "T9ubn5i7yJhutgOBSWZD",
            FECHA_VISITA: "jltp3YJ2gnMMVnoIepLn",
            COMUNIDAD: "rUPG2ZYUgBLRlEvR1tHh",
            DATOS_VISITA: "xFXns9nopnKIR4RDRf2g",
            PRESUPUESTO: "BYt6QSQIz4jpDtDtL6J0",
            AJUSTES_PRESUPUESTO: "4SKvql6JPwdb0yzdntHX",
        },
        casillas: {
            PRESUPUESTO_GENERADO: {
                id: "XU7CKhrlFDyLkcG1tHpb",
                opcion: "¿El presupuesto se ha generado?",
            },
            PRESUPUESTO_VALIDADO: {
                id: "Y1XKjicSib1ZiMJGtAhA",
                opcion: "¿El presupuesto se ha validado?",
            },
        },
        asociaciones: {
            COMUNIDAD_OPORTUNIDAD: "6a4b7ab79e37d62b69f3fced",
            ADMINISTRADOR_COMUNIDAD: "6a4b75539e37d69185f0e716",
        },
    },
    "vertical-projects": {
        pipelineId: "k3VBCitsMsatxp2sQA5M",
        etapas: {
            AVISO_RECIBIDO: "d3fecc88-6a46-45a0-8e03-eb468c43610f",
            VISITA_CONCERTADA: "78329067-e46b-4360-b4ac-235aeae9fe75",
            DATOS_RECOGIDOS: "a823c3cf-fc0b-4b29-85b8-68a610788e23",
            PRESUPUESTO_EN_REVISION: "0a48366d-b965-4d5d-850c-d21ffb43cc3f",
            PRESUPUESTO_ENVIADO: "e4ce7acc-721e-4080-8a55-2bbe9340cab5",
            EN_NEGOCIACION: "d9623e9d-1893-412a-9621-6f0425f8e712",
            GANADA: "58999a58-c9ff-4a97-a221-575b1ffaa73c",
            PERDIDA: "a2bf9870-3bc6-486b-954a-8843de842e99",
        },
        campos: {
            MODELO_NEGOCIO: "y0o6j2k09jLdEsHdDSRL",
            DESCRIPCION: "1DDMzIYCfuHKGyAkjkt1",
            FECHA_VISITA: "IeNYdX20jqsd5Sv1tDsT",
            COMUNIDAD: "YdIlhdrVMpQBfY6EUxlc",
            DATOS_VISITA: "UcIGUjPWG4irzkC8xvMK",
            PRESUPUESTO: "F7oVIuDRIZSjjJC3WzC0",
            AJUSTES_PRESUPUESTO: "RvO84KaawOdctS5G52jN",
        },
        // Creadas el 21/09/2026 con las MISMAS opciones que en Scala. El valor
        // se escribe por etiqueta, no por índice: si alguien edita el texto de
        // la opción en GHL, hay que cambiarlo también aquí o la casilla dejará
        // de marcarse, y GHL no devolverá ningún error.
        casillas: {
            PRESUPUESTO_GENERADO: {
                id: "9KzTORbBzuRrHQzrzfe9",
                opcion: "¿El presupuesto se ha generado?",
            },
            PRESUPUESTO_VALIDADO: {
                id: "XuJsSoXU5eh3U8SW3iC6",
                opcion: "¿El presupuesto se ha validado?",
            },
        },
        asociaciones: {
            COMUNIDAD_OPORTUNIDAD: "6aaaa70249f2efb5bad3ce5b",
            ADMINISTRADOR_COMUNIDAD: "6aaaa70249f2efb5bad3ce5a",
        },
    },
};

export function idsGhl(subcuenta: Subcuenta): IdsGhl {
    const ids = IDS[subcuenta];
    if (!ids) throw new Error(`No hay IDs de GHL para la subcuenta "${subcuenta}" (lib/ghl/ids.ts).`);
    return ids;
}

/** Stage ID de GHL -> clave de etapa, o `null` si no es del pipeline comercial de esa subcuenta. */
export function claveEtapa(subcuenta: Subcuenta, pipelineStageId: string | null | undefined): ClaveEtapa | null {
    if (!pipelineStageId) return null;
    const { etapas } = idsGhl(subcuenta);
    return CLAVES_ETAPA.find((clave) => etapas[clave] === pipelineStageId) ?? null;
}

/** Clave de etapa -> stage ID de GHL. */
export function idEtapa(subcuenta: Subcuenta, clave: ClaveEtapa): string {
    return idsGhl(subcuenta).etapas[clave];
}

/**
 * Id de un custom field, o `null` si esa subcuenta todavía no lo tiene creado.
 *
 * Devuelve `null` en vez de lanzar a propósito: quien escribe decide si eso es
 * un no-op (lo normal) o un error (solo si el dato es imprescindible).
 */
export function idCampo(subcuenta: Subcuenta, campo: CampoOportunidad): string | null {
    return idsGhl(subcuenta).campos[campo]?.trim() || null;
}

/** Id y opción de una casilla, o `null` si no existe en esa subcuenta. */
export function casillaGhl(subcuenta: Subcuenta, casilla: CasillaOportunidad): CampoCasilla | null {
    return idsGhl(subcuenta).casillas[casilla];
}

/**
 * Nombre visible de cada etapa en la app.
 *
 * Por clave, no por ID: así es el mismo para las dos subcuentas aunque en GHL
 * se escriban distinto ("Ganada" en Scala, "GANADA" en Vertical).
 */
export const NOMBRE_ETAPA: Readonly<Record<ClaveEtapa, string>> = {
    AVISO_RECIBIDO: "Aviso recibido",
    VISITA_CONCERTADA: "Visita concertada",
    DATOS_RECOGIDOS: "Datos recogidos",
    PRESUPUESTO_EN_REVISION: "Presupuesto en revisión",
    PRESUPUESTO_ENVIADO: "Presupuesto enviado",
    EN_NEGOCIACION: "En negociación",
    GANADA: "Ganada",
    PERDIDA: "Pérdida",
};

/** Etapas que muestra el panel de presupuestos. */
export const ETAPAS_PRESUPUESTO: readonly ClaveEtapa[] = [
    "DATOS_RECOGIDOS",
    "PRESUPUESTO_EN_REVISION",
    "PRESUPUESTO_ENVIADO",
    "EN_NEGOCIACION",
    "GANADA",
    "PERDIDA",
];