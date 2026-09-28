import { Redis } from "@upstash/redis";
import type { SubcuentaSlug } from "@/lib/subcuenta";
import type { DatosBorrador } from "@/lib/visita/borrador";

/**
 * lib/borradores/almacen.ts
 *
 * Borradores de presupuesto guardados EN LA APP (Upstash Redis), no en GHL.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ (27/09/2026)
 * ---------------------------------------------------------------------------
 * Decisión de Jacob: el borrador vive solo en la app y llega a GHL cuando el
 * comercial lo ha rellenado, revisado y ha creado el presupuesto. Hasta ahora
 * el borrador estaba en el `localStorage` del móvil: el panel (que se pinta en
 * servidor) no podía verlo, no se abría desde otro dispositivo y solo cabía uno
 * por subcuenta.
 *
 * El `localStorage` se mantiene como red de seguridad sin cobertura
 * (lib/visita/borrador.ts). Este almacén es la copia que manda.
 *
 * ---------------------------------------------------------------------------
 * CLAVES
 * ---------------------------------------------------------------------------
 *   borrador:<id>                       JSON del borrador
 *   borradores:<subcuenta>              ZSET de ids, puntuación = actualizado (ms)
 *   borrador-op:<subcuenta>:<opId>      id del borrador de esa oportunidad
 *
 * Sin caducidad: un borrador es trabajo del comercial y solo se borra al crear
 * el presupuesto o cuando él lo elimina.
 *
 * ---------------------------------------------------------------------------
 * SIN CONFIGURAR
 * ---------------------------------------------------------------------------
 * Sin variables de Upstash, en desarrollo se usa un almacén en memoria (se
 * pierde al reiniciar) y en producción `almacenDisponible()` es false: las rutas
 * responden 503 y el formulario sigue funcionando solo con el móvil.
 */

export type BorradorGuardado = {
    id: string;
    subcuenta: SubcuentaSlug;
    /** Id de GHL del comercial (o su email si no lo tiene). Decide quién lo ve. */
    propietario: string;
    /** Nombre del comercial, para que dirección sepa de quién es. */
    autor: string | null;
    /** Oportunidad en "Visita concertada" de la que sale, si sale de una. */
    oportunidadId: string | null;
    /** Lo que pinta la tarjeta del panel, para no parsear `datos` en el listado. */
    resumen: { comunidad: string; administrador: string | null };
    datos: DatosBorrador;
    creadoEn: string;
    actualizadoEn: string;
};

export type ResumenBorrador = Pick<
    BorradorGuardado,
    "id" | "oportunidadId" | "resumen" | "autor" | "creadoEn" | "actualizadoEn"
>;

/** Quien pide: lo mínimo de la sesión para decidir permisos. */
export type Solicitante = {
    subcuenta: SubcuentaSlug;
    rol: string;
    usuarioGhl: string | null;
    email: string | null;
    nombre: string | null;
};

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------

type Backend = {
    get(clave: string): Promise<BorradorGuardado | null>;
    mget(claves: string[]): Promise<(BorradorGuardado | null)[]>;
    set(clave: string, valor: BorradorGuardado): Promise<void>;
    del(...claves: string[]): Promise<void>;
    getId(clave: string): Promise<string | null>;
    setId(clave: string, id: string): Promise<void>;
    zadd(clave: string, puntuacion: number, id: string): Promise<void>;
    zrem(clave: string, id: string): Promise<void>;
    /** Ids de más reciente a más antiguo. */
    zrevrange(clave: string, limite: number): Promise<string[]>;
};

function credenciales(): { url: string; token: string } | null {
    const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
    return url && token ? { url, token } : null;
}

function backendUpstash(url: string, token: string): Backend {
    const redis = new Redis({ url, token });
    return {
        get: (c) => redis.get<BorradorGuardado>(c),
        mget: async (c) => (c.length === 0 ? [] : redis.mget<(BorradorGuardado | null)[]>(...c)),
        set: async (c, v) => {
            await redis.set(c, v);
        },
        del: async (...c) => {
            if (c.length) await redis.del(...c);
        },
        getId: (c) => redis.get<string>(c),
        setId: async (c, id) => {
            await redis.set(c, id);
        },
        zadd: async (c, p, id) => {
            await redis.zadd(c, { score: p, member: id });
        },
        zrem: async (c, id) => {
            await redis.zrem(c, id);
        },
        zrevrange: (c, limite) => redis.zrange<string[]>(c, 0, limite - 1, { rev: true }),
    };
}

/** Solo desarrollo. Vive en `globalThis` para sobrevivir a la recarga en caliente. */
function backendMemoria(): Backend {
    const g = globalThis as unknown as { __borradores?: { kv: Map<string, unknown>; z: Map<string, Map<string, number>> } };
    g.__borradores ??= { kv: new Map(), z: new Map() };
    const { kv, z } = g.__borradores;
    const copia = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

    return {
        get: async (c) => copia((kv.get(c) as BorradorGuardado) ?? null),
        mget: async (c) => c.map((k) => copia((kv.get(k) as BorradorGuardado) ?? null)),
        set: async (c, v) => void kv.set(c, copia(v)),
        del: async (...c) => c.forEach((k) => kv.delete(k)),
        getId: async (c) => (kv.get(c) as string) ?? null,
        setId: async (c, id) => void kv.set(c, id),
        zadd: async (c, p, id) => {
            const s = z.get(c) ?? new Map<string, number>();
            s.set(id, p);
            z.set(c, s);
        },
        zrem: async (c, id) => void z.get(c)?.delete(id),
        zrevrange: async (c, limite) =>
            [...(z.get(c) ?? new Map<string, number>()).entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, limite)
                .map(([id]) => id),
    };
}

let backendCache: Backend | null | undefined;

function backend(): Backend | null {
    if (backendCache !== undefined) return backendCache;
    const c = credenciales();
    if (c) backendCache = backendUpstash(c.url, c.token);
    else if (process.env.NODE_ENV !== "production") backendCache = backendMemoria();
    else {
        console.error("[borradores] Faltan UPSTASH_REDIS_REST_URL/TOKEN (o KV_REST_API_URL/TOKEN).");
        backendCache = null;
    }
    return backendCache;
}

export function almacenDisponible(): boolean {
    return backend() !== null;
}

function exigirBackend(): Backend {
    const b = backend();
    if (!b) throw new AlmacenNoDisponibleError();
    return b;
}

export class AlmacenNoDisponibleError extends Error {
    constructor() {
        super("El almacén de borradores no está configurado.");
        this.name = "AlmacenNoDisponibleError";
    }
}

const claveBorrador = (id: string) => `borrador:${id}`;
const claveIndice = (subcuenta: string) => `borradores:${subcuenta}`;
const claveOportunidad = (subcuenta: string, oportunidadId: string) => `borrador-op:${subcuenta}:${oportunidadId}`;

/** Tope del listado. Un comercial con más de esto tiene otro problema. */
const LIMITE_LISTADO = 300;

// ---------------------------------------------------------------------------
// Permisos
// ---------------------------------------------------------------------------

/** Identidad con la que se guardan los borradores de esta sesión. */
export function propietarioDe(s: Pick<Solicitante, "usuarioGhl" | "email">): string | null {
    return s.usuarioGhl?.trim() || s.email?.trim().toLowerCase() || null;
}

/**
 * Misma regla que las oportunidades: dirección ve todos los de la subcuenta
 * activa; el comercial, solo los suyos. "No existe" y "no es tuyo" se tratan
 * igual en las rutas.
 */
export function puedeUsarBorrador(s: Solicitante, b: BorradorGuardado): boolean {
    if (b.subcuenta !== s.subcuenta) return false;
    if (s.rol === "direccion") return true;
    const yo = propietarioDe(s);
    return yo !== null && b.propietario === yo;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export function aResumen(b: BorradorGuardado): ResumenBorrador {
    return {
        id: b.id,
        oportunidadId: b.oportunidadId,
        resumen: b.resumen,
        autor: b.autor,
        creadoEn: b.creadoEn,
        actualizadoEn: b.actualizadoEn,
    };
}

/** El borrador, o `null` si no existe o esta sesión no puede verlo. */
export async function leerBorrador(s: Solicitante, id: string): Promise<BorradorGuardado | null> {
    if (!/^[\w-]{8,64}$/.test(id)) return null;
    const b = await exigirBackend().get(claveBorrador(id));
    return b && puedeUsarBorrador(s, b) ? b : null;
}

/** Id del borrador ya empezado sobre esa oportunidad, si lo hay y es visible. */
export async function borradorDeOportunidad(s: Solicitante, oportunidadId: string): Promise<BorradorGuardado | null> {
    const id = await exigirBackend().getId(claveOportunidad(s.subcuenta, oportunidadId));
    return id ? leerBorrador(s, id) : null;
}

export async function listarBorradores(s: Solicitante): Promise<ResumenBorrador[]> {
    const be = exigirBackend();
    const ids = await be.zrevrange(claveIndice(s.subcuenta), LIMITE_LISTADO);
    const borradores = await be.mget(ids.map(claveBorrador));

    const visibles: ResumenBorrador[] = [];
    for (let i = 0; i < ids.length; i++) {
        const b = borradores[i];
        // Índice con un id cuyo JSON ya no está: se limpia de paso.
        if (!b) {
            await be.zrem(claveIndice(s.subcuenta), ids[i]);
            continue;
        }
        if (puedeUsarBorrador(s, b)) visibles.push(aResumen(b));
    }
    return visibles;
}

/**
 * Crea el borrador. Con oportunidad, es idempotente: si ya hay uno para ella,
 * devuelve ese (dos pestañas abiertas no crean dos borradores de la misma visita).
 */
export async function crearBorrador(
    s: Solicitante,
    entrada: { datos: DatosBorrador; oportunidadId: string | null; administrador: string | null }
): Promise<BorradorGuardado> {
    const be = exigirBackend();
    const propietario = propietarioDe(s);
    if (!propietario) throw new Error("La sesión no tiene usuario de GHL ni email: no se puede guardar el borrador.");

    if (entrada.oportunidadId) {
        const existente = await borradorDeOportunidad(s, entrada.oportunidadId);
        // Se guardan los datos que llegan (28/09/2026). Antes se devolvía el
        // existente tal cual: el formulario daba por guardado lo que acababa de
        // enviar y el servidor seguía con los datos viejos.
        if (existente) return (await guardarBorrador(s, existente.id, entrada)) ?? existente;
    }

    const ahora = new Date().toISOString();
    const borrador: BorradorGuardado = {
        id: crypto.randomUUID(),
        subcuenta: s.subcuenta,
        propietario,
        autor: s.nombre,
        oportunidadId: entrada.oportunidadId,
        resumen: { comunidad: entrada.datos.nombreComunidad.trim(), administrador: entrada.administrador },
        datos: entrada.datos,
        creadoEn: ahora,
        actualizadoEn: ahora,
    };

    await be.set(claveBorrador(borrador.id), borrador);
    await be.zadd(claveIndice(s.subcuenta), Date.now(), borrador.id);
    if (borrador.oportunidadId) await be.setId(claveOportunidad(s.subcuenta, borrador.oportunidadId), borrador.id);
    return borrador;
}

/** Sustituye los datos. `null` si no existe o no es suyo. */
export async function guardarBorrador(
    s: Solicitante,
    id: string,
    entrada: { datos: DatosBorrador; administrador: string | null }
): Promise<BorradorGuardado | null> {
    const actual = await leerBorrador(s, id);
    if (!actual) return null;

    const be = exigirBackend();
    const siguiente: BorradorGuardado = {
        ...actual,
        resumen: { comunidad: entrada.datos.nombreComunidad.trim(), administrador: entrada.administrador },
        datos: entrada.datos,
        actualizadoEn: new Date().toISOString(),
    };

    await be.set(claveBorrador(id), siguiente);
    await be.zadd(claveIndice(actual.subcuenta), Date.now(), id);
    return siguiente;
}

/** Borra el borrador. `false` si no existía o no era suyo. */
export async function eliminarBorrador(s: Solicitante, id: string): Promise<boolean> {
    const actual = await leerBorrador(s, id);
    if (!actual) return false;

    const be = exigirBackend();
    await be.del(claveBorrador(id));
    await be.zrem(claveIndice(actual.subcuenta), id);
    if (actual.oportunidadId) {
        const clave = claveOportunidad(actual.subcuenta, actual.oportunidadId);
        // Solo si el enlace sigue apuntando a ESTE borrador.
        if ((await be.getId(clave)) === id) await be.del(clave);
    }
    return true;
}
