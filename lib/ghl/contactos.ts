import { saFetch, getLocationId, type Subcuenta } from "./client";

type DatosContacto = {
    nombre: string;
    email?: string;
    telefono?: string;
};

export async function upsertContact(subcuenta: Subcuenta, datos: DatosContacto): Promise<string> {
    const data = await saFetch(subcuenta, "/contacts/upsert", {
        method: 'POST',
        body: JSON.stringify({
            locationId: getLocationId(subcuenta),
            name: datos.nombre,
            email: datos.email,
            phone: datos.telefono,
        }),
    });

    return data.contact.id;
}