import { saFetch, type Subcuenta, getLocationId } from "./client";
import { normalizarNombre } from "../texto";
import { idsGhl } from "./ids";

const OBJECT_KEY_COMUNIDAD = "custom_objects.comunidades_de_propietarios";
const OBJECT_KEY_ADMINISTRADOR = "custom_objects.administradores_de_fincas";
const MAX_PAGINAS = 20;
const PAGE_LIMIT = 100;

export type Comunidad = {
    id: string;
    nombreDireccion: string;
    numeroViviendas?: number;
    notasAcceso?: string;
    localidad?: string;
    provincia?: string;
    administradorId?: string;
};

type SaRecord = {
    id: string;
    properties: Record<string, unknown>;
    relations?: Array<{ objectKey: string; recordId: string }>;
};

const PROP = {
    nombreDireccion: "nombre_direcci_n",
    numeroViviendas: "nmero_de_viviendas",
    notasAcceso: "notas_de_acceso",
    localidad: "localidad",
    provincia: "provincia",
} as const;

function texto(properties: Record<string, unknown>, clave: string): string | undefined {
    const valor = properties[clave];
    if (typeof valor !== "string") return undefined;
    const limpio = valor.trim();
    return limpio === "" ? undefined : limpio;
}

function mapearComunidad(record: SaRecord): Comunidad {
    const administrador = record.relations?.find(
        (r) => r.objectKey === OBJECT_KEY_ADMINISTRADOR
    );

    return {
        id: record.id,
        nombreDireccion: record.properties[PROP.nombreDireccion] as string,
        numeroViviendas: record.properties[PROP.numeroViviendas] as number | undefined,
        notasAcceso: texto(record.properties, PROP.notasAcceso),
        localidad: texto(record.properties, PROP.localidad),
        provincia: texto(record.properties, PROP.provincia),
        administradorId: administrador?.recordId,
    };
}

export async function listarComunidades(subcuenta: Subcuenta): Promise<Comunidad[]> {
    const locationId = getLocationId(subcuenta);
    const acumulado: SaRecord[] = [];

    for (let page = 1; page <= MAX_PAGINAS; page++) {
        const data = await saFetch(subcuenta, `/objects/${OBJECT_KEY_COMUNIDAD}/records/search`, {
            method: "POST",
            body: JSON.stringify({ locationId, page, pageLimit: PAGE_LIMIT }),
        });

        const records: SaRecord[] = data.records ?? [];
        acumulado.push(...records);

        const total: number = typeof data.total === "number" ? data.total : acumulado.length;
        if (records.length === 0 || acumulado.length >= total) break;
    }

    return acumulado.map(mapearComunidad);
}

export { normalizarNombre };

export function buscarComunidadPorNombre(
    comunidades: Comunidad[],
    nombre: string
): Comunidad | undefined {
    const objetivo = normalizarNombre(nombre);
    return comunidades.find((c) => normalizarNombre(c.nombreDireccion) === objetivo);
}

export async function obtenerComunidad(
    subcuenta: Subcuenta,
    comunidadId: string
): Promise<Comunidad | null> {
    const data = await saFetch(
        subcuenta,
        `/objects/${OBJECT_KEY_COMUNIDAD}/records/${comunidadId}`
    );

    const record: SaRecord | undefined = data.record;
    if (!record?.id) return null;

    return mapearComunidad(record);
}

export type DatosNuevaComunidad = {
    nombreDireccion: string;
    numeroViviendas?: number;
    notasAcceso?: string;
    /**
     * Localidad y provincia de la comunidad.
     *
     * POR QUÉ ESTÁN AQUÍ DESDE EL 18/09/2026: se imprimen en el presupuesto
     * (`presup.ComunidadLocalidad`, `presup.ComunidadProvincia`) y la localidad
     * es además la de la línea de firma (`doc.Localidad`). `crearComunidad` no
     * las enviaba, así que TODA comunidad dada de alta desde la app generaba
     * presupuestos con esos huecos en blanco y había que rellenarlos a mano en
     * GHL. Los registros creados antes de esta fecha siguen incompletos: hay
     * que repasarlos.
     */
    localidad?: string;
    provincia?: string;
    /** Si se indica, se crea además la relación administrador -> comunidad. */
    administradorId?: string;
};

/**
 * Crea una comunidad en el custom object y, si procede, la enlaza con su
 * administrador.
 *
 * Respuesta verificada por PowerShell el 17/08/2026: el id llega en
 * `data.record.id`, NO en la raíz (a diferencia de /opportunities/, que
 * devuelve `data.opportunity`). Asumir la forma habría dado un id undefined
 * justo antes de asociar.
 */
export async function crearComunidad(
    subcuenta: Subcuenta,
    datos: DatosNuevaComunidad
): Promise<Comunidad> {
    const properties: Record<string, unknown> = {
        [PROP.nombreDireccion]: datos.nombreDireccion.trim(),
    };

    // Solo se envían las propiedades informadas: mandar undefined sobrescribiría
    // con vacío si se reutiliza esta forma en un update.
    if (datos.numeroViviendas !== undefined) {
        properties[PROP.numeroViviendas] = datos.numeroViviendas;
    }
    if (datos.notasAcceso) {
        properties[PROP.notasAcceso] = datos.notasAcceso;
    }
    if (datos.localidad?.trim()) {
        properties[PROP.localidad] = datos.localidad.trim();
    }
    if (datos.provincia?.trim()) {
        properties[PROP.provincia] = datos.provincia.trim();
    }

    const data = await saFetch(subcuenta, `/objects/${OBJECT_KEY_COMUNIDAD}/records`, {
        method: "POST",
        body: JSON.stringify({
            locationId: getLocationId(subcuenta),
            properties,
        }),
    });

    const record = data.record;
    if (!record?.id) {
        throw new Error(
            `El Sistema Advantys no devolvió id al crear la comunidad. Respuesta: ${JSON.stringify(data)}`
        );
    }

    if (datos.administradorId) {
        await asociarAdministradorConComunidad(subcuenta, datos.administradorId, record.id);
    }

    return {
        id: record.id,
        nombreDireccion: datos.nombreDireccion.trim(),
        numeroViviendas: datos.numeroViviendas,
        notasAcceso: datos.notasAcceso,
        localidad: datos.localidad?.trim() || undefined,
        provincia: datos.provincia?.trim() || undefined,
        administradorId: datos.administradorId,
    };
}

/**
 * Devuelve la comunidad existente con ese nombre o la crea.
 *
 * Es el punto de entrada del formulario: el comercial escribe libremente y aquí
 * se decide si estamos ante una comunidad ya conocida o ante una nueva. Así se
 * cumple el "a mano, no desplegable" del cliente sin renunciar a la base de
 * datos estructurada que necesitan las comisiones (DERCAS §7.2) y el portal (§8).
 */
export async function obtenerOCrearComunidad(
    subcuenta: Subcuenta,
    datos: DatosNuevaComunidad
): Promise<{ comunidad: Comunidad; creada: boolean }> {
    const existentes = await listarComunidades(subcuenta);
    const encontrada = buscarComunidadPorNombre(existentes, datos.nombreDireccion);

    if (encontrada) {
        return { comunidad: encontrada, creada: false };
    }

    const comunidad = await crearComunidad(subcuenta, datos);
    return { comunidad, creada: true };
}

/** Relación administrador -> comunidad. El orden de los ids no es intercambiable. */
export async function asociarAdministradorConComunidad(
    subcuenta: Subcuenta,
    administradorId: string,
    comunidadId: string
) {
    return saFetch(subcuenta, "/associations/relations", {
        method: "POST",
        body: JSON.stringify({
            locationId: getLocationId(subcuenta),
            associationId: idsGhl(subcuenta).asociaciones.ADMINISTRADOR_COMUNIDAD,
            firstRecordId: administradorId,
            secondRecordId: comunidadId,
        }),
    });
}

export async function asociarComunidadConOportunidad(
    subcuenta: Subcuenta,
    comunidadId: string,
    oportunidadId: string
) {
    return saFetch(subcuenta, "/associations/relations", {
        method: "POST",
        body: JSON.stringify({
            locationId: getLocationId(subcuenta),
            associationId: idsGhl(subcuenta).asociaciones.COMUNIDAD_OPORTUNIDAD,
            firstRecordId: comunidadId,
            secondRecordId: oportunidadId,
        }),
    });
}