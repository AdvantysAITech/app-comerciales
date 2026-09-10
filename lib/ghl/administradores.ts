import { saFetch, type Subcuenta, getLocationId } from "./client";

const OBJECT_KEY_ADMINISTRADOR = "custom_objects.administradores_de_fincas";

type SaRecord = {
    id: string;
    properties: Record<string, unknown>;
};

/**
 * Claves de propiedad tal cual las devuelve la API.
 *
 * NO se deducen de la etiqueta. GHL la deforma ("Teléfono" -> `telfono`,
 * "Comisión pactada" -> `comisin_pactada`) y, si alguien corrige la etiqueta
 * desde la interfaz, la clave puede cambiar sin que nadie se entere.
 *
 * Eso es justo lo que había pasado aquí: el código leía
 * `nombre_contact_princiapl` (con la errata original de la etiqueta) mientras
 * la API devolvía `nombre_del_contacto_principal`. `contactoPrincipal` era
 * `undefined` SIEMPRE, y como los dos consumidores tienen un `?? nombreDespacho`
 * de respaldo, el presupuesto llevaba meses imprimiendo el nombre del despacho
 * donde debería ir la persona de contacto. Detectado por API el 09/09/2026.
 */
const PROP = {
    nombreDespacho: "nombre_del_despacho",
    contactoPrincipal: "nombre_del_contacto_principal",
    comisionPactada: "comisin_pactada",
    telefono: "telfono",
    email: "email",
    localidad: "localidad",
    provincia: "provincia",
} as const;

export type Administrador = {
    id: string;
    nombreDespacho?: string;
    contactoPrincipal?: string;
    comisionPactada?: number;
    telefono?: string;
    email?: string;
    /**
     * Localidad del despacho. Se imprime en `presup.AdministradorLocalidad`.
     *
     * Opcional porque GHL OMITE las propiedades vacías: `undefined` significa
     * "ese registro no lo tiene relleno", no "el campo no existe".
     */
    localidad?: string;
    provincia?: string;
};

/** Texto de una propiedad, o undefined si no viene o viene en blanco. */
function texto(properties: Record<string, unknown>, clave: string): string | undefined {
    const valor = properties[clave];
    if (typeof valor !== "string") return undefined;
    const limpio = valor.trim();
    return limpio === "" ? undefined : limpio;
}

function mapearAdministrador(record: SaRecord): Administrador {
    return {
        id: record.id,
        nombreDespacho: texto(record.properties, PROP.nombreDespacho),
        contactoPrincipal: texto(record.properties, PROP.contactoPrincipal),
        comisionPactada: record.properties[PROP.comisionPactada] as number | undefined,
        telefono: texto(record.properties, PROP.telefono),
        email: texto(record.properties, PROP.email),
        localidad: texto(record.properties, PROP.localidad),
        provincia: texto(record.properties, PROP.provincia),
    };
}

export async function listarAdministradores(subcuenta: Subcuenta): Promise<Administrador[]> {
    const data = await saFetch(subcuenta, `/objects/${OBJECT_KEY_ADMINISTRADOR}/records/search`, {
        method: 'POST',
        body: JSON.stringify({
            locationId: getLocationId(subcuenta),
            page: 1,
            pageLimit: 50,
        }),
    });

    return (data.records as SaRecord[]).map(mapearAdministrador);
}

/**
 * Lee un administrador concreto por su id.
 *
 * Misma forma que `obtenerComunidad`: el registro llega en `data.record`.
 */
export async function obtenerAdministrador(
    subcuenta: Subcuenta,
    administradorId: string
): Promise<Administrador | null> {
    const data = await saFetch(
        subcuenta,
        `/objects/${OBJECT_KEY_ADMINISTRADOR}/records/${administradorId}`
    );

    const record: SaRecord | undefined = data.record;
    if (!record?.id) return null;

    return mapearAdministrador(record);
}