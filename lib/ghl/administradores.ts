import { saFetch, type Subcuenta, getLocationId } from "./client";

const OBJECT_KEY_ADMINISTRADOR = "custom_objects.administradores_de_fincas";

type SaRecord = {
    id: string;
    properties: Record<string, unknown>;
};

export async function listarAdministradores(subcuenta: Subcuenta) {
    const data = await saFetch(subcuenta, `/objects/${OBJECT_KEY_ADMINISTRADOR}/records/search`, {
        method: 'POST',
        body: JSON.stringify({
            locationId: getLocationId(subcuenta),
            page: 1,
            pageLimit: 50,
        }),
    });

    return (data.records as SaRecord[]).map((record) => ({
        id: record.id,
        nombreDespacho: record.properties.nombre_del_despacho as string | undefined,
        contactoPrincipal: record.properties.nombre_contact_princiapl as string | undefined,
        comisionPactada: record.properties.comisin_pactada as number | undefined,
        telefono: record.properties.telfono as string | undefined,
        email: record.properties.email as string | undefined,
    }));
}