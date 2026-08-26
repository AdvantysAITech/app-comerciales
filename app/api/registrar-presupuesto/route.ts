import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { SUBCUENTAS, esSubcuentaValida } from "@/lib/subcuenta";
import { registrarPresupuesto, type EntradaPresupuesto } from "@/lib/ghl/presupuestos";

/**
 * Alta de un presupuesto del flujo v2.
 *
 * El cuerpo trae lo que capturo el comercial. La subcuenta, la empresa y el
 * nombre del comercial NO llegan del cliente: salen de la sesion. Un formulario
 * no deberia poder decidir en que subcuenta escribe.
 */
export async function POST(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.subcuenta || !esSubcuentaValida(session.user.subcuenta)) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const subcuenta = session.user.subcuenta;
    const empresa = SUBCUENTAS[subcuenta].nombre;
    const comercial = session.user.name ?? "";

    let entrada: EntradaPresupuesto;
    try {
        entrada = (await request.json()) as EntradaPresupuesto;
    } catch {
        return NextResponse.json({ error: "Cuerpo de la peticion invalido" }, { status: 400 });
    }

    // Validacion minima en servidor. La validacion fina de partidas y mediciones
    // ya la hace validarSeleccion() en el formulario; esto solo evita crear
    // registros huerfanos en GHL si llega una peticion incompleta.
    const faltan = [
        !entrada.comunidadNombre?.trim() && "comunidad",
        !entrada.contacto?.trim() && "contacto",
        !entrada.telefono?.trim() && "telefono",
        !entrada.fechaVisita && "fecha de visita",
        !entrada.modulosElegidos?.length && "tipo de trabajo",
    ].filter(Boolean);

    if (faltan.length > 0) {
        return NextResponse.json({ error: `Faltan datos: ${faltan.join(", ")}` }, { status: 400 });
    }

    try {
        const resultado = await registrarPresupuesto(subcuenta, empresa, comercial, {
            comunidadNombre: entrada.comunidadNombre,
            administradorId: entrada.administradorId ?? null,
            contacto: entrada.contacto,
            telefono: entrada.telefono,
            fechaVisita: entrada.fechaVisita,
            observaciones: entrada.observaciones ?? "",
            modulosElegidos: entrada.modulosElegidos,
            seleccion: entrada.seleccion ?? {},
            fotosPorModulo: entrada.fotosPorModulo ?? {},
        });

        return NextResponse.json({
            comunidad: resultado.comunidad,
            oportunidades: resultado.oportunidades,
            avisos: resultado.avisos,
        });
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        return NextResponse.json({ error: mensaje }, { status: 500 });
    }
}