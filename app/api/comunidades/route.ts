import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
    listarComunidades,
    obtenerOCrearComunidad,
    type DatosNuevaComunidad,
} from "@/lib/ghl/comunidades";
import type { SubcuentaSlug } from "@/lib/subcuenta";

/**
 * Alta y consulta de comunidades de propietarios.
 *
 * La comunidad ya se creaba al vuelo al enviar el presupuesto
 * (`lib/ghl/presupuestos.ts`), pero solo con el nombre. Esta ruta permite darla
 * de alta COMPLETA antes de empezar la visita: localidad, provincia, viviendas,
 * notas de acceso y administrador enlazado. Las dos vías acaban en
 * `obtenerOCrearComunidad`, así que no hay riesgo de duplicado entre ellas.
 *
 * La subcuenta sale de la sesión, nunca del cuerpo. Ver la nota de
 * `/api/administradores`.
 */

function textoDe(body: Record<string, unknown>, clave: string): string | undefined {
    const valor = body[clave];
    if (typeof valor !== "string") return undefined;
    const limpio = valor.trim();
    return limpio === "" ? undefined : limpio;
}

export async function GET() {
    const session = await auth();

    if (!session?.user?.subcuenta) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    try {
        const comunidades = await listarComunidades(session.user.subcuenta as SubcuentaSlug);
        return NextResponse.json({ comunidades });
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        console.error("[comunidades:GET]", mensaje);
        return NextResponse.json({ error: mensaje }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.subcuenta) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const subcuenta = session.user.subcuenta as SubcuentaSlug;
    const body = (await request.json()) as Record<string, unknown>;

    const nombreDireccion = textoDe(body, "nombreDireccion");

    if (!nombreDireccion) {
        return NextResponse.json(
            { error: "El nombre o dirección de la comunidad es obligatorio" },
            { status: 400 }
        );
    }

    const datos: DatosNuevaComunidad = { nombreDireccion };

    const localidad = textoDe(body, "localidad");
    if (localidad) datos.localidad = localidad;

    const provincia = textoDe(body, "provincia");
    if (provincia) datos.provincia = provincia;

    const notasAcceso = textoDe(body, "notasAcceso");
    if (notasAcceso) datos.notasAcceso = notasAcceso;

    const administradorId = textoDe(body, "administradorId");
    if (administradorId) datos.administradorId = administradorId;

    // El número de viviendas llega como número o como el string del input.
    // `Number("")` es 0, que aquí sería un dato falso, así que se filtra antes.
    if (body.numeroViviendas !== undefined && body.numeroViviendas !== null && body.numeroViviendas !== "") {
        const viviendas = Number(body.numeroViviendas);
        if (!Number.isFinite(viviendas) || viviendas < 0) {
            return NextResponse.json(
                { error: "El número de viviendas debe ser un número positivo" },
                { status: 400 }
            );
        }
        datos.numeroViviendas = viviendas;
    }

    try {
        const { comunidad, creada } = await obtenerOCrearComunidad(subcuenta, datos);
        return NextResponse.json({ comunidad, creada }, { status: creada ? 201 : 200 });
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        console.error("[comunidades:POST]", mensaje);
        return NextResponse.json({ error: mensaje }, { status: 500 });
    }
}