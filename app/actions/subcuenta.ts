"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
    COOKIE_SUBCUENTA,
    OPCIONES_COOKIE_SUBCUENTA,
    puedeVer,
    sesionApp,
} from "@/lib/sesion";

/**
 * Cambia la subcuenta que esta mirando el usuario.
 *
 * Solo la escribe si esa subcuenta esta entre las suyas: el server action es
 * un endpoint publico como cualquier otro, y el valor llega del navegador.
 *
 * Al terminar manda al dashboard a proposito. Conmutar estando en la ficha de
 * una oportunidad de Scala dejaria en pantalla un id que en Vertical no
 * existe, y el usuario se comeria un "no se ha encontrado esta oportunidad"
 * sin entender por que.
 */
export async function cambiarSubcuenta(slug: string) {
    const sesion = await sesionApp();
    if (!sesion) redirect("/login");

    if (!puedeVer(sesion, slug)) {
        throw new Error("No tienes acceso a esa subcuenta.");
    }

    const almacenCookies = await cookies();
    almacenCookies.set(COOKIE_SUBCUENTA, slug, OPCIONES_COOKIE_SUBCUENTA);

    // Todo lo cacheado cuelga de la subcuenta: oportunidades, comunidades,
    // administradores. Se invalida el layout entero, no una ruta suelta.
    revalidatePath("/", "layout");
    redirect("/");
}
