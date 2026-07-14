import { saFetch, type Subcuenta, getLocationId } from "./client";

const OBJECT_KEY_COMUNIDAD = "custom_objects.comunidades_de_propietarios";

type SaRecord = {
    id: string;
    properties: Record<string, unknown>;
    relations?: Array<{ objectKey: string; recordId: string }>;
};

export async function listarComunidades(subcuenta: Subcuenta) {
    const data = await saFetch(subcuenta, `/objects/${OBJECT_KEY_COMUNIDAD}/records/search`, {
        method: 'POST',
        body: JSON.stringify({
            locationId: getLocationId(subcuenta),
            page: 1,
            pageLimit: 50,
        }),
    });

    return (data.records as SaRecord[]).map((record) => {
        const administrador = record.relations?.find(
            (r) => r.objectKey === "custom_objects.administradores_de_fincas"
        );

        return {
            id: record.id,
            nombreDireccion: record.properties.nombre_direcci_n as string,
            numeroViviendas: record.properties.nmero_de_viviendas as number | undefined,
            notasAcceso: record.properties.notas_de_acceso as string | undefined,
            administradorId: administrador?.recordId,
        };
    });

}