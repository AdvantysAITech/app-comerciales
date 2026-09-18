import { saFetch, type Subcuenta, getLocationId } from "./client";
import { normalizarNombre } from "../texto";

const OBJECT_KEY_ADMINISTRADOR = "custom_objects.administradores_de_fincas";

/**
 * Tope de páginas al listar. Existe para que un fallo de paginación nunca se
 * convierta en un bucle infinito. Mismo criterio que en `comunidades.ts`.
 */
const MAX_PAGINAS = 20;
const PAGE_LIMIT = 100;

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
 *
 * ESCRITURA (18/09/2026): el alta usa estas mismas claves. Verificado con
 * `npm run ghl:probar-altas`, que crea un registro real y lo borra. Si una
 * clave de escritura difiere de la de lectura, ese script lo detecta antes de
 * que llegue a producción; no se asume.
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

/**
 * Lista todos los administradores de la subcuenta, paginando hasta agotar el
 * total.
 *
 * POR QUÉ PAGINA (18/09/2026): la versión anterior pedía una sola página de 50
 * sin comprobar `total`. Con los 10-12 despachos de Jose no fallaba, pero al
 * superar 50 habría dejado administradores fuera del desplegable SIN ERROR: el
 * comercial no los encontraría y, ahora que puede crear, daría de alta un
 * duplicado. Es el mismo fallo que se corrigió en `listarComunidades`.
 */
export async function listarAdministradores(subcuenta: Subcuenta): Promise<Administrador[]> {
    const locationId = getLocationId(subcuenta);
    const acumulado: SaRecord[] = [];

    for (let page = 1; page <= MAX_PAGINAS; page++) {
        const data = await saFetch(subcuenta, `/objects/${OBJECT_KEY_ADMINISTRADOR}/records/search`, {
            method: "POST",
            body: JSON.stringify({ locationId, page, pageLimit: PAGE_LIMIT }),
        });

        const records: SaRecord[] = data.records ?? [];
        acumulado.push(...records);

        const total: number = typeof data.total === "number" ? data.total : acumulado.length;
        if (records.length === 0 || acumulado.length >= total) break;
    }

    return acumulado.map(mapearAdministrador);
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

/**
 * Busca un administrador ya existente por nombre de despacho.
 *
 * Se filtra en memoria a propósito, igual que en comunidades: el volumen es de
 * decenas de registros y el filtro por propiedad de custom object en servidor
 * no está verificado.
 */
export function buscarAdministradorPorNombre(
    administradores: Administrador[],
    nombreDespacho: string
): Administrador | undefined {
    const objetivo = normalizarNombre(nombreDespacho);
    return administradores.find(
        (a) => a.nombreDespacho !== undefined && normalizarNombre(a.nombreDespacho) === objetivo
    );
}

/**
 * Candidatos "parecidos" para el aviso antidduplicados del formulario.
 *
 * POR QUÉ EXISTE: en cuanto el comercial puede crear, "Administración Álvarez
 * Casado", "Alvarez Casado" y "Adm. Álvarez Casado" acaban siendo tres
 * registros distintos, y las comisiones del administrador (DERCAS §7.2) dejan
 * de cuadrar. No bloquea el alta: avisa y deja decidir a la persona.
 *
 * Coincidencia por inclusión sobre el nombre normalizado. Es deliberadamente
 * simple: una distancia de edición daría falsos positivos con nombres cortos y
 * aquí el coste de un falso negativo lo paga dirección una vez, no el comercial
 * en obra.
 */
export function administradoresParecidos(
    administradores: Administrador[],
    nombreDespacho: string,
    maximo = 3
): Administrador[] {
    const objetivo = normalizarNombre(nombreDespacho);
    if (objetivo.length < 3) return [];

    return administradores
        .filter((a) => {
            if (!a.nombreDespacho) return false;
            const candidato = normalizarNombre(a.nombreDespacho);
            return candidato.includes(objetivo) || objetivo.includes(candidato);
        })
        .slice(0, maximo);
}

export type DatosNuevoAdministrador = {
    nombreDespacho: string;
    contactoPrincipal?: string;
    telefono?: string;
    email?: string;
    localidad?: string;
    provincia?: string;
    /**
     * Campo INTERNO de dirección (DERCAS §3.3). El alta del comercial nunca lo
     * envía: la ruta `/api/administradores` lo descarta si el rol de la sesión
     * no es `direccion`.
     */
    comisionPactada?: number;
};

/**
 * Crea un administrador de fincas en el custom object de la subcuenta.
 *
 * Respuesta con la misma forma que `crearComunidad`: el id llega en
 * `data.record.id`, NO en la raíz. Verificado el 18/09/2026 con
 * `npm run ghl:probar-altas`.
 *
 * Solo se envían las propiedades informadas: mandar `undefined` sobrescribiría
 * con vacío si esta misma forma se reutiliza algún día en un update.
 */
export async function crearAdministrador(
    subcuenta: Subcuenta,
    datos: DatosNuevoAdministrador
): Promise<Administrador> {
    const nombreDespacho = datos.nombreDespacho.trim();

    if (!nombreDespacho) {
        throw new Error("El nombre del despacho es obligatorio para crear un administrador");
    }

    const properties: Record<string, unknown> = {
        [PROP.nombreDespacho]: nombreDespacho,
    };

    const opcionales: Array<[string, string | undefined]> = [
        [PROP.contactoPrincipal, datos.contactoPrincipal],
        [PROP.telefono, datos.telefono],
        [PROP.email, datos.email],
        [PROP.localidad, datos.localidad],
        [PROP.provincia, datos.provincia],
    ];

    for (const [clave, valor] of opcionales) {
        const limpio = valor?.trim();
        if (limpio) properties[clave] = limpio;
    }

    if (datos.comisionPactada !== undefined) {
        properties[PROP.comisionPactada] = datos.comisionPactada;
    }

    const data = await saFetch(subcuenta, `/objects/${OBJECT_KEY_ADMINISTRADOR}/records`, {
        method: "POST",
        body: JSON.stringify({
            locationId: getLocationId(subcuenta),
            properties,
        }),
    });

    const record: SaRecord | undefined = data.record;

    if (!record?.id) {
        throw new Error(
            `El Sistema Advantys no devolvió id al crear el administrador. Respuesta: ${JSON.stringify(data)}`
        );
    }

    // Si la respuesta trae las propiedades, se mapea: es la verdad del servidor.
    // Si no, se reconstruye con lo enviado, que es lo que acaba de persistirse.
    if (record.properties) return mapearAdministrador(record);

    return {
        id: record.id,
        nombreDespacho,
        contactoPrincipal: datos.contactoPrincipal?.trim() || undefined,
        telefono: datos.telefono?.trim() || undefined,
        email: datos.email?.trim() || undefined,
        localidad: datos.localidad?.trim() || undefined,
        provincia: datos.provincia?.trim() || undefined,
        comisionPactada: datos.comisionPactada,
    };
}

/**
 * Devuelve el administrador existente con ese nombre de despacho o lo crea.
 *
 * Mismo contrato que `obtenerOCrearComunidad`: el servidor es quien decide, no
 * el formulario. Si el comercial escribe un nombre que ya existe con idéntica
 * grafía normalizada, se reutiliza el registro en vez de duplicarlo, aunque el
 * cliente creyera que estaba creando uno nuevo.
 */
export async function obtenerOCrearAdministrador(
    subcuenta: Subcuenta,
    datos: DatosNuevoAdministrador
): Promise<{ administrador: Administrador; creado: boolean }> {
    const existentes = await listarAdministradores(subcuenta);
    const encontrado = buscarAdministradorPorNombre(existentes, datos.nombreDespacho);

    if (encontrado) {
        return { administrador: encontrado, creado: false };
    }

    const administrador = await crearAdministrador(subcuenta, datos);
    return { administrador, creado: true };
}