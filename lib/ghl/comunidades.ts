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
    /**
     * Localidad y provincia de la comunidad. Se imprimen en el presupuesto
     * (`presup.ComunidadLocalidad`, `presup.ComunidadProvincia`) y la localidad
     * es además la de la línea de firma (`doc.Localidad`).
     *
     * Opcionales aquí porque GHL OMITE las propiedades vacías en la respuesta:
     * que lleguen `undefined` significa "ese registro no lo tiene relleno", no
     * "el campo no existe". Verificado por API el 09/09/2026.
     */
    localidad?: string;
    provincia?: string;
    administradorId?: string;
};

type SaRecord = {
    id: string;
    properties: Record<string, unknown>;
    relations?: Array<{ objectKey: string; recordId: string }>;
};

/**
 * Claves de propiedad tal cual las devuelve la API.
 *
 * NO se deducen de la etiqueta: GHL genera la clave a partir del nombre visible
 * y la deforma ("Nombre / Dirección" -> `nombre_direcci_n`, "Número de
 * viviendas" -> `nmero_de_viviendas`). Peor: si alguien corrige la etiqueta
 * desde la interfaz, la clave puede quedarse con la errata original. Ya pasó en
 * el objeto de administradores.
 *
 * Verificadas por PowerShell contra un registro real el 09/09/2026
 * (C/ Islas Canarias, 180 -> localidad "Náquera", provincia "Valencia").
 */
const PROP = {
    nombreDireccion: "nombre_direcci_n",
    numeroViviendas: "nmero_de_viviendas",
    notasAcceso: "notas_de_acceso",
    localidad: "localidad",
    provincia: "provincia",
} as const;

/** Texto de una propiedad, o undefined si no viene o viene en blanco. */
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

/**
 * Lee una comunidad concreta por su id.
 *
 * Verificado por PowerShell el 09/09/2026: el GET responde y el registro llega
 * en `data.record`, NO en la raíz. Misma forma que el POST de creación y
 * distinta de `/opportunities/`, que devuelve `data.opportunity`. Aquí no hay
 * regla general: cada endpoint se comprueba.
 *
 * Se usa en la generación de documentos, donde hace falta una sola comunidad y
 * listar las de la subcuenta entera sería traerse todas para descartar N-1.
 */
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