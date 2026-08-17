import { saFetch, type Subcuenta, getLocationId } from "./client";
import { normalizarNombre } from "../texto";

const OBJECT_KEY_COMUNIDAD = "custom_objects.comunidades_de_propietarios";
const OBJECT_KEY_ADMINISTRADOR = "custom_objects.administradores_de_fincas";

// Association "comunidad_de_la_oportunidad" (Comunidades De Propietarios -> Opportunity),
// confirmada por curl el 31/07/2026. GHL no impone cardinalidad 1:1 en esta relación:
// hay que evitar crearla más de una vez por oportunidad desde el propio código.
const ASSOCIATION_ID_COMUNIDAD_OPORTUNIDAD = "6a4b7ab79e37d62b69f3fced";

// Association "administrador_asignado" (Administradores De Fincas -> Comunidades),
// confirmada por PowerShell el 17/08/2026 contra /associations/.
// El orden NO es intercambiable: firstRecordId = administrador, secondRecordId = comunidad.
const ASSOCIATION_ID_ADMINISTRADOR_COMUNIDAD = "6a4b75539e37d69185f0e716";

// Tope de páginas al listar. Con 7 comunidades reales hoy sobra de largo; existe
// para que un fallo de paginación nunca se convierta en un bucle infinito.
const MAX_PAGINAS = 20;
const PAGE_LIMIT = 100;

export type Comunidad = {
    id: string;
    nombreDireccion: string;
    numeroViviendas?: number;
    notasAcceso?: string;
    administradorId?: string;
};

type SaRecord = {
    id: string;
    properties: Record<string, unknown>;
    relations?: Array<{ objectKey: string; recordId: string }>;
};

function mapearComunidad(record: SaRecord): Comunidad {
    const administrador = record.relations?.find(
        (r) => r.objectKey === OBJECT_KEY_ADMINISTRADOR
    );

    return {
        id: record.id,
        nombreDireccion: record.properties.nombre_direcci_n as string,
        numeroViviendas: record.properties.nmero_de_viviendas as number | undefined,
        notasAcceso: record.properties.notas_de_acceso as string | undefined,
        administradorId: administrador?.recordId,
    };
}

/**
 * Lista todas las comunidades de la subcuenta, paginando hasta agotar el total.
 *
 * La versión anterior pedía una sola página de 50 sin comprobar `total`. Con 7
 * registros no fallaba, pero al superar 50 habría dejado comunidades fuera del
 * buscador SIN ERROR: el comercial no las encontraría y crearía duplicados.
 */
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

// Se reexporta para no romper a quien ya la importaba desde este módulo.
export { normalizarNombre };

/**
 * Busca una comunidad ya existente por nombre.
 *
 * Se filtra en memoria a propósito: la subcuenta tiene 7 registros y el filtro
 * por propiedad de custom object en servidor no está verificado. Cuando el
 * volumen lo justifique, se sustituye.
 */
export function buscarComunidadPorNombre(
    comunidades: Comunidad[],
    nombre: string
): Comunidad | undefined {
    const objetivo = normalizarNombre(nombre);
    return comunidades.find((c) => normalizarNombre(c.nombreDireccion) === objetivo);
}

type DatosNuevaComunidad = {
    nombreDireccion: string;
    numeroViviendas?: number;
    notasAcceso?: string;
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
        nombre_direcci_n: datos.nombreDireccion.trim(),
    };

    // Solo se envían las propiedades informadas: mandar undefined sobrescribiría
    // con vacío si se reutiliza esta forma en un update.
    if (datos.numeroViviendas !== undefined) {
        properties.nmero_de_viviendas = datos.numeroViviendas;
    }
    if (datos.notasAcceso) {
        properties.notas_de_acceso = datos.notasAcceso;
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
            associationId: ASSOCIATION_ID_ADMINISTRADOR_COMUNIDAD,
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
            associationId: ASSOCIATION_ID_COMUNIDAD_OPORTUNIDAD,
            firstRecordId: comunidadId,
            secondRecordId: oportunidadId,
        }),
    });
}