import { saFetch, getLocationId, type Subcuenta } from "./client";
import { asociarComunidadConOportunidad } from "./comunidades";

const PIPELINE_ID = "Lg3gwS0oqpYDiBm8bjcD";

export const ETAPA = {
    AVISO_RECIBIDO: "4d3b0cf1-c995-4fa4-9cac-bcde44b24d62",
    VISITA_CONCERTADA: "2f764a91-4a30-4d3e-b4bb-ad5c654e7b6a",
    DATOS_RECOGIDOS: "c1c13b28-af25-4769-b95b-cdb89500a9b7",
    PRESUPUESTO_EN_REVISION: "c5e51f0b-763f-4cce-b581-f6919f66ba29",
    PRESUPUESTO_ENVIADO: "3d1f30db-9c7d-4391-90d7-50d98b217e42",
    EN_NEGOCIACION: "eb1fe6ae-b418-4df0-84cd-cb27b6fb051c",
    GANADA: "74963521-4c81-447e-8fb5-858bf0b8120a",
    PERDIDA: "f89b0539-1afa-4f1f-be2a-517b22f415c9",
} as const;

export const ETAPAS_PRESUPUESTO = [
    ETAPA.DATOS_RECOGIDOS,
    ETAPA.PRESUPUESTO_EN_REVISION,
    ETAPA.PRESUPUESTO_ENVIADO,
    ETAPA.EN_NEGOCIACION,
    ETAPA.GANADA,
    ETAPA.PERDIDA,
];

const CUSTOM_FIELD_MODELO_NEGOCIO = "PTtDhuZnyksZ9Tj0Sb4f";
const CUSTOM_FIELD_DESCRIPCION = "T9ubn5i7yJhutgOBSWZD";
const CUSTOM_FIELD_FECHA_VISITA = "jltp3YJ2gnMMVnoIepLn";
const CUSTOM_FIELD_COMUNIDAD = "rUPG2ZYUgBLRlEvR1tHh";

/**
 * Etiquetas EXACTAS del picklist "Modelo de negocio" en GHL.
 *
 * No tocar sin comprobar antes el picklist en la subcuenta. GHL acepta y guarda
 * valores que no estan en la lista sin devolver error, asi que una mayuscula
 * mal puesta no rompe nada a la vista: simplemente esa oportunidad deja de
 * aparecer al filtrar por modelo de negocio y el reporting de direccion sale
 * incompleto sin que nadie se entere.
 */
const ETIQUETA_MODELO_NEGOCIO: Record<string, string> = {
    rehabilitacion_impermeabilizacion: "Rehabilitación e Impermeabilización",
    descuelgues_verticales: "Descuelgues Verticales",
    retirada_amianto: "Retirada de Amianto",
    reformas_zonas_comunes: "Reformas y Zonas Comunes",
};

export const NOMBRE_ETAPA: Record<string, string> = {
    [ETAPA.AVISO_RECIBIDO]: "Aviso recibido",
    [ETAPA.VISITA_CONCERTADA]: "Visita concertada",
    [ETAPA.DATOS_RECOGIDOS]: "Datos recogidos",
    [ETAPA.PRESUPUESTO_EN_REVISION]: "Presupuesto en revisión",
    [ETAPA.PRESUPUESTO_ENVIADO]: "Presupuesto enviado",
    [ETAPA.EN_NEGOCIACION]: "En negociación",
    [ETAPA.GANADA]: "Ganada",
    [ETAPA.PERDIDA]: "Pérdida",
};

type DatosOportunidad = {
    contactId: string;
    comunidadId: string;
    comunidadNombre: string;
    modeloNegocio: string;
    fecha: string;
    contactoVisita: string;
    descripcionLibre: string;
    camposEspecificos: Record<string, string>;
    fotos: string[];
};

type OportunidadAbierta = {
    id: string;
    name: string;
    pipelineStageId: string;
    createdAt: string;
    modeloNegocio: string | null;
}

export type OportunidadListado = {
    id: string;
    name: string;
    pipelineStageId: string;
    createdAt: string;
    modeloNegocio: string | null;
    comunidadNombre: string | null;
    fechaVisita: string | null;
    descripcionVisita: string | null;
    administrador: {
        id: string | null;
        nombre: string | null;
        email: string | null;
        telefono: string | null;
    };
};

type DatosVisita = {
    comunidadNombre: string;
    modeloNegocio: string;
    fecha: string;
    contactoVisita: string;
    descripcionLibre: string;
    camposEspecificos: Record<string, string>;
    fotos: string[];
};

/**
 * Lee un custom field sin dar por hecho en que clave viene el valor.
 *
 * GHL no es consistente: /opportunities/search devuelve `fieldValueString` y
 * /opportunities/{id} devuelve `fieldValue` para el mismo campo. Como este
 * mapeador se usa para las dos respuestas, leer una sola clave dejaba la ficha
 * de detalle completamente vacia. Se prueban por orden y gana la primera que
 * traiga algo.
 */
function valorCampo(op: any, campoId: string): string | null {
    const campo = op.customFields?.find((cf: any) => cf.id === campoId);
    if (!campo) return null;

    const bruto = campo.fieldValueString ?? campo.fieldValue ?? campo.value ?? null;
    if (bruto === null || bruto === undefined || bruto === "") return null;

    return typeof bruto === "string" ? bruto : String(bruto);
}

/**
 * Lee un custom field de tipo DATE y lo devuelve como dd/mm/aaaa.
 *
 * Los campos DATE llegan en `fieldValueDate` como timestamp en milisegundos, no
 * en `fieldValueString`. Se usan getters UTC a proposito: con los locales, una
 * fecha guardada a medianoche UTC puede pintarse con un dia de menos segun la
 * zona horaria del servidor.
 */
function valorFecha(op: any, campoId: string): string | null {
    const campo = op.customFields?.find((cf: any) => cf.id === campoId);
    if (!campo) return null;

    const bruto =
        campo.fieldValueDate ?? campo.fieldValue ?? campo.fieldValueString ?? null;
    if (bruto === null || bruto === undefined || bruto === "") return null;

    // El timestamp puede llegar como numero o como cadena de digitos.
    const comoTexto = String(bruto);
    const milisegundos =
        typeof bruto === "number"
            ? bruto
            : /^\d+$/.test(comoTexto)
              ? Number(comoTexto)
              : null;

    const fecha = milisegundos !== null ? new Date(milisegundos) : new Date(comoTexto);

    // Si no hay forma de interpretarla, se devuelve tal cual antes que perder el dato.
    if (Number.isNaN(fecha.getTime())) return comoTexto;

    const dia = String(fecha.getUTCDate()).padStart(2, "0");
    const mes = String(fecha.getUTCMonth() + 1).padStart(2, "0");

    return `${dia}/${mes}/${fecha.getUTCFullYear()}`;
}

function construirDescripcion(datos: {
    contactoVisita: string;
    camposEspecificos: Record<string, string>;
    fotos: string[];
    descripcionLibre: string;
}): string {
    const detalles = 
        Object.entries(datos.camposEspecificos)
            .map(([key, value]) => `- ${key}: ${value}`)
            .join("\n") || "(sin detalles)";

    const fotos =
        datos.fotos.map((url, i) => `Foto ${i + 1}: ${url}`).join("\n") || "(sin fotos)";

    return [
        `Contacto de la visita: ${datos.contactoVisita || "(no especificado)"}`,
        "",
        "Detalles del trabajo",
        detalles,
        "",
        "Fotos: ",
        fotos,
        "",
        "Descripción del comercial: ",
        datos.descripcionLibre || "(sin descripción adicional)",
    ].join("\n");
}

function mapearOportunidadListado(op: any): OportunidadListado {
    return {
        id: op.id,
        name: op.name,
        pipelineStageId: op.pipelineStageId,
        createdAt: op.createdAt,
        modeloNegocio: valorCampo(op, CUSTOM_FIELD_MODELO_NEGOCIO),
        comunidadNombre: valorCampo(op, CUSTOM_FIELD_COMUNIDAD),
        fechaVisita: valorFecha(op, CUSTOM_FIELD_FECHA_VISITA),
        descripcionVisita: valorCampo(op, CUSTOM_FIELD_DESCRIPCION),
        administrador: {
            id: op.contactId ?? op.contact?.id ?? null,
            nombre: op.contact?.name ?? null,
            email: op.contact?.email ?? null,
            telefono: op.contact?.phone ?? null,
        },
    };
}

export async function crearOportunidad(subcuenta: Subcuenta, datos: DatosOportunidad) {
    const descripcionCompleta = construirDescripcion(datos);

    const data = await saFetch(subcuenta, "/opportunities/", {
        method: "POST",
        body: JSON.stringify({
            locationId: getLocationId(subcuenta),
            pipelineId: PIPELINE_ID,
            pipelineStageId: ETAPA.AVISO_RECIBIDO,
            contactId: datos.contactId,
            name: `${datos.comunidadNombre} - ${ETIQUETA_MODELO_NEGOCIO[datos.modeloNegocio]}`,
            status: "open",
            customFields: [
                { id: CUSTOM_FIELD_MODELO_NEGOCIO, field_value: ETIQUETA_MODELO_NEGOCIO[datos.modeloNegocio] },
                { id: CUSTOM_FIELD_DESCRIPCION, field_value: descripcionCompleta },
                { id: CUSTOM_FIELD_FECHA_VISITA, field_value: datos.fecha },
            ],
        }),
    });

    const oportunidad = data.opportunity ?? data;
    await asociarComunidadConOportunidad(subcuenta, datos.comunidadId, oportunidad.id);
    return oportunidad;
}

export async function crearOportunidadDesdeVisita(subcuenta: Subcuenta, datos: DatosOportunidad) {
    const descripcionCompleta = construirDescripcion(datos);

    const data = await saFetch(subcuenta, "/opportunities/", {
        method: "POST",
        body: JSON.stringify({
            locationId: getLocationId(subcuenta),
            pipelineId: PIPELINE_ID,
            pipelineStageId: ETAPA.DATOS_RECOGIDOS,
            contactId: datos.contactId,
            name: `${datos.comunidadNombre} - ${ETIQUETA_MODELO_NEGOCIO[datos.modeloNegocio]}`,
            status: "open",
            customFields: [
                { id: CUSTOM_FIELD_MODELO_NEGOCIO, field_value: ETIQUETA_MODELO_NEGOCIO[datos.modeloNegocio] },
                { id: CUSTOM_FIELD_DESCRIPCION, field_value: descripcionCompleta },
                { id: CUSTOM_FIELD_FECHA_VISITA, field_value: datos.fecha },
                { id: CUSTOM_FIELD_COMUNIDAD, field_value: datos.comunidadNombre },
            ],
        }),
    });

    const oportunidad = data.opportunity ?? data;
    await asociarComunidadConOportunidad(subcuenta, datos.comunidadId, oportunidad.id);
    return oportunidad;
}

export async function buscarOportunidadesAbiertas(
    subcuenta: Subcuenta,
    contactId: string,
    etapasCandidatas: string[]
): Promise<OportunidadAbierta[]> {
    const locationId = getLocationId(subcuenta);

    const data = await saFetch(
        subcuenta,
        `/opportunities/search?location_id=${locationId}&contact_id=${contactId}`
    );

    const oportunidades: any[] = data.opportunities ?? [];

    return oportunidades
        .filter(
            (op) =>
                op.pipelineId === PIPELINE_ID &&
                op.status === "open" &&
                etapasCandidatas.includes(op.pipelineStageId)
        )
        .map((op) => ({
            id: op.id,
            name: op.name,
            pipelineStageId: op.pipelineStageId,
            createdAt: op.createdAt,
            modeloNegocio: valorCampo(op, CUSTOM_FIELD_MODELO_NEGOCIO),
        }));
}

export async function listarOportunidades(
    subcuenta: Subcuenta,
    etapasIncluidas: string[]
): Promise<OportunidadListado[]> {
    const locationId = getLocationId(subcuenta);

    const data = await saFetch(
        subcuenta,
        `/opportunities/search?location_id=${locationId}&pipeline_id=${PIPELINE_ID}`
    );

    const oportunidades: any[] = data.opportunities ?? [];

    return oportunidades
        .filter(
            (op) =>
                op.pipelineId === PIPELINE_ID &&
                etapasIncluidas.includes(op.pipelineStageId)
        )
        .map(mapearOportunidadListado);
}

export async function obtenerOportunidad(
    subcuenta: Subcuenta,
    oportunidadId: string
): Promise<OportunidadListado | null> {
    try {
        const data = await saFetch(subcuenta, `/opportunities/${oportunidadId}`);
        const op = data.opportunity ?? data;
        if (!op?.id) return null;
        return mapearOportunidadListado(op);
    } catch {
        return null;
    }
}

export async function adjuntarDatosVisita(
    subcuenta: Subcuenta,
    oportunidadId: string,
    datos: DatosVisita
) {
    const descripcionCompleta = construirDescripcion(datos);

    const data = await saFetch(subcuenta, `/opportunities/${oportunidadId}`, {
        method: "PUT",
        body: JSON.stringify({
            pipelineStageId: ETAPA.DATOS_RECOGIDOS,
            customFields: [
                { id: CUSTOM_FIELD_MODELO_NEGOCIO, field_value: ETIQUETA_MODELO_NEGOCIO[datos.modeloNegocio] },
                { id: CUSTOM_FIELD_DESCRIPCION, field_value: descripcionCompleta },
                { id: CUSTOM_FIELD_FECHA_VISITA, field_value: datos.fecha },
                { id: CUSTOM_FIELD_COMUNIDAD, field_value: datos.comunidadNombre },
            ],
        }),
    });

    return data.opportunity ?? data;
}