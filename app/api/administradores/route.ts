import { NextRequest, NextResponse } from "next/server";
import { sesionApp } from "@/lib/sesion";
import {
    listarAdministradores,
    obtenerOCrearAdministrador,
    type DatosNuevoAdministrador,
} from "@/lib/ghl/administradores";

/**
 * Alta y consulta de administradores de fincas.
 *
 * La subcuenta SIEMPRE sale de la sesión, nunca del cuerpo de la petición. Si
 * viniera del cliente, un comercial de Vertical podría escribir en la base de
 * datos de Scala cambiando un campo del formulario, y el aislamiento entre
 * subcuentas (DERCAS §3.1 y criterio de aceptación 1) dejaría de ser cierto.
 */

/** Campos de texto admitidos. Todo lo que no esté aquí se ignora. */
const CAMPOS_TEXTO = [
    "nombreDespacho",
    "contactoPrincipal",
    "telefono",
    "email",
    "localidad",
    "provincia",
] as const;

function textoDe(body: Record<string, unknown>, clave: string): string | undefined {
    const valor = body[clave];
    if (typeof valor !== "string") return undefined;
    const limpio = valor.trim();
    return limpio === "" ? undefined : limpio;
}

export async function GET() {
    const sesion = await sesionApp();

    if (!sesion) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    try {
        const administradores = await listarAdministradores(sesion.subcuenta);
        return NextResponse.json({ administradores });
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        console.error("[administradores:GET]", mensaje);
        return NextResponse.json({ error: mensaje }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const sesion = await sesionApp();

    if (!sesion) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const subcuenta = sesion.subcuenta;
    const body = (await request.json()) as Record<string, unknown>;

    const nombreDespacho = textoDe(body, "nombreDespacho");

    if (!nombreDespacho) {
        return NextResponse.json({ error: "El nombre del despacho es obligatorio" }, { status: 400 });
    }

    const datos: DatosNuevoAdministrador = { nombreDespacho };

    for (const campo of CAMPOS_TEXTO) {
        if (campo === "nombreDespacho") continue;
        const valor = textoDe(body, campo);
        if (valor) datos[campo] = valor;
    }

    /**
     * La comisión pactada es dato interno de dirección (DERCAS §3.3): entra en
     * el margen del presupuesto y en la liquidación de Jose Luis. Se descarta
     * en silencio si el rol no es `direccion`, y no se devuelve error: el
     * formulario del comercial ni siquiera pinta el campo, así que un cuerpo
     * con comisión desde un perfil comercial solo puede venir de una petición
     * manipulada.
     */
    if (sesion.rol === "direccion" && typeof body.comisionPactada === "number") {
        if (body.comisionPactada < 0 || body.comisionPactada > 100) {
            return NextResponse.json(
                { error: "La comisión pactada debe estar entre 0 y 100" },
                { status: 400 }
            );
        }
        datos.comisionPactada = body.comisionPactada;
    }

    try {
        const { administrador, creado } = await obtenerOCrearAdministrador(subcuenta, datos);
        return NextResponse.json({ administrador, creado }, { status: creado ? 201 : 200 });
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        // El detalle se queda en los logs; al comercial en obra no le sirve un
        // volcado de la API de GHL.
        console.error("[administradores:POST]", mensaje);
        return NextResponse.json({ error: mensaje }, { status: 500 });
    }
}