import { cookies } from "next/headers";
import { auth } from "@/auth";
import { esSubcuentaValida, type SubcuentaSlug } from "@/lib/subcuenta";
import type { Rol } from "@/lib/roles";

/**
 * lib/sesion.ts
 *
 * Quien es el usuario y QUE SUBCUENTA ESTA MIRANDO. Punto unico: ninguna
 * pagina ni ruta de API vuelve a deducir la subcuenta por su cuenta.
 *
 * ---------------------------------------------------------------------------
 * POR QUE EXISTE (22/09/2026)
 * ---------------------------------------------------------------------------
 * Hasta hoy cada usuario tenia UNA subcuenta escrita en el token, y veinte
 * sitios leian `session.user.subcuenta`. Con eso Miguel -- perfil direccion,
 * el que valida los presupuestos -- solo podia ver Scala Valencia: las
 * oportunidades de Vertical Projects no le aparecian, aunque el DERCAS 9.1 le
 * da acceso a las dos.
 *
 * Ahora el token trae la LISTA de subcuentas del usuario (lo que puede ver) y
 * una cookie guarda la ACTIVA (lo que esta viendo). Se separan a proposito:
 * el JWT se firma al hacer login, asi que meter ahi la subcuenta activa
 * obligaria a reemitirlo en cada conmutacion.
 *
 * ---------------------------------------------------------------------------
 * LA COOKIE NO ES UN PERMISO
 * ---------------------------------------------------------------------------
 * La cookie solo dice "queria mirar esta". El permiso esta en el token, y
 * `sesionApp` cruza las dos: una cookie con una subcuenta que no esta en la
 * lista del usuario se ignora y se cae a la primera suya. Asi, un comercial
 * que se invente el valor a mano sigue viendo lo de siempre.
 */

/**
 * Subcuenta que el usuario esta mirando.
 *
 * httpOnly a proposito: no la lee nadie en el navegador, solo el servidor.
 * Se escribe desde el server action de app/actions/subcuenta.ts.
 */
export const COOKIE_SUBCUENTA = "sa_subcuenta";

const UN_ANO_EN_SEGUNDOS = 60 * 60 * 24 * 365;

export const OPCIONES_COOKIE_SUBCUENTA = {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: UN_ANO_EN_SEGUNDOS,
    secure: process.env.NODE_ENV === "production",
} as const;

export type SesionApp = {
    nombre: string | null;
    email: string | null;
    rol: Rol;
    /** Id del usuario en GHL, para `assignedTo`. */
    usuarioGhl: string | null;
    /** Todas las subcuentas a las que puede entrar. Nunca vacia. */
    subcuentas: readonly SubcuentaSlug[];
    /** La que esta viendo ahora. Siempre una de `subcuentas`. */
    subcuenta: SubcuentaSlug;
    /** Atajo para la UI: hay selector que pintar. */
    multiSubcuenta: boolean;
};

function subcuentasDelUsuario(valor: unknown): SubcuentaSlug[] {
    if (!Array.isArray(valor)) return [];
    return valor.filter(esSubcuentaValida);
}

/**
 * Sesion resuelta, o `null` si no hay usuario o su configuracion no tiene
 * ninguna subcuenta valida.
 *
 * `null` es "no puedes estar aqui": quien la llame corta. Nunca devuelve una
 * sesion a medias con una subcuenta inventada.
 */
export async function sesionApp(): Promise<SesionApp | null> {
    const session = await auth();
    if (!session?.user) return null;

    const subcuentas = subcuentasDelUsuario(session.user.subcuentas);
    if (subcuentas.length === 0) return null;

    const almacenCookies = await cookies();
    const pedida = almacenCookies.get(COOKIE_SUBCUENTA)?.value;

    // El cruce: la cookie solo vale si esa subcuenta esta entre las suyas.
    const subcuenta =
        esSubcuentaValida(pedida) && subcuentas.includes(pedida) ? pedida : subcuentas[0];

    return {
        nombre: session.user.name ?? null,
        email: session.user.email ?? null,
        rol: session.user.rol,
        usuarioGhl: session.user.usuarioGhl ?? null,
        subcuentas,
        subcuenta,
        multiSubcuenta: subcuentas.length > 1,
    };
}

/**
 * Comprueba si el usuario puede entrar en una subcuenta concreta.
 *
 * Para cuando la subcuenta llega de fuera (un parametro, un cuerpo de
 * peticion) en vez de de la cookie.
 */
export function puedeVer(sesion: SesionApp, subcuenta: unknown): subcuenta is SubcuentaSlug {
    return esSubcuentaValida(subcuenta) && sesion.subcuentas.includes(subcuenta);
}
