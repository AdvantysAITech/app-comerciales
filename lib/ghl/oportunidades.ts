import { saFetch, getLocationId, type Subcuenta } from "./client";

const PIPELINE_ID = "Lg3gwS0oqpYDiBm8bjcD";

export const ETAPA = {
    AVISO_RECIBIDO: "4d3b0cf1-c995-4fa4-9cac-bcde44b24d62",
    VISITA_CONCERTADA: "2f764a91-4a30-4d3e-b4bb-ad5c654e7b6a",
    DATOS_RECOGIDOS: "c1c13b28-af25-4769-b95b-cdb89500a9b7",
    PRESUPUESTO_EN_REVISION: "c5e51f0b-763f-4cce-b581-f6919f66ba29",
    PRESUPUESTO_ENVIADO: "3d1f30db-9c7d-4391-90d7-50d98b217e42",
} as const;

const CUSTOM_FIELD_MODELO_NEGOCIO = "PTtDhuZnyksZ9Tj0Sb4f";
const CUSTOM_FIELD_DESCRIPCION = "T9ubn5i7yJhutgOBSWZD";
const CUSTOM_FIELD_FECHA_VISITA = "jltp3YJ2gnMMVnoIepLn";

const ETIQUETA_MODELO_NEGOCIO: Record<string, string> = {
    rehabilitacion_impermeabilizacion: "Rehabilitación e impermeabilización",
    descuelgues_verticales: "Descuelgues verticales",
    retirada_amianto: "Retirada de amianto",
    reformas_zonas_comunes: "Reformas y zonas comunes",
};

type DatosOportunidad = {
    contactId: string;
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

type DatosVisita = {
    modeloNegocio: string;
    fecha: string;
    contactoVisita: string;
    descripcionLibre: string;
    camposEspecificos: Record<string, string>;
    fotos: string[];
};

function construirDescripcion(datos: {
    contactoVisita: string;
    camposEspecificos: Record<string, string>;
    fotos: string[];
    descripcionLibre: string;
}): string {
    const detalles = 
        Object.entries(datos.camposEspecificos)
            .map(([key, value]) => `- ${key}: ${value}`)
            .join("\n") || "(sin detales)";

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

    return data.opportunity ?? data;
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
            modeloNegocio:
                op.customFields?.find(
                    (cf: any) => cf.id === CUSTOM_FIELD_MODELO_NEGOCIO
                )?.fieldValueString ?? null,
        }));
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
            ],
        }),
    });

    return data.opportunity ?? data;
}