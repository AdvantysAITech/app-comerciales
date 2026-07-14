import { getDefaultResultOrder } from "dns";
import { saFetch, getLocationId, type Subcuenta } from "./client";
import { pipeline } from "stream";

const PIPELINE_ID = "Lg3gwS0oqpYDiBm8bjcD";
const STAGE_AVISO_RECIBIDO = "4d3b0cf1-c995-4fa4-9cac-bcde44b24d62";

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

function construirDescripcion(datos: DatosOportunidad): string {
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
            pipelineStageId: STAGE_AVISO_RECIBIDO,
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