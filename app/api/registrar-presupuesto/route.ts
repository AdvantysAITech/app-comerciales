import { NextRequest, NextResponse } from "next/server";
import { sesionApp } from "@/lib/sesion";
import { SUBCUENTAS } from "@/lib/subcuenta";
import {
    registrarPresupuesto,
    type EntradaPresupuesto,
    type OportunidadExistente,
} from "@/lib/ghl/presupuestos";
import { filtroPropietario, obtenerOportunidad, puedeVerOportunidad } from "@/lib/ghl/oportunidades";

/**
 * Alta de un presupuesto del flujo v2.
 *
 * El cuerpo trae lo que capturo el comercial. La subcuenta, la empresa y el
 * nombre del comercial NO llegan del cliente: salen de la sesion. Un formulario
 * no deberia poder decidir en que subcuenta escribe.
 */
export async function POST(request: NextRequest) {
    const sesion = await sesionApp();

    if (!sesion) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const subcuenta = sesion.subcuenta;
    const empresa = SUBCUENTAS[subcuenta].nombre;
    const comercial = sesion.nombre ?? "";

    let entrada: EntradaPresupuesto & { oportunidadId?: string | null };
    try {
        entrada = (await request.json()) as EntradaPresupuesto & { oportunidadId?: string | null };
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

    // Datos tomados sobre una oportunidad en "Visita concertada".
    //
    // Se comprueba AQUI, en servidor, que la oportunidad es de quien envia y
    // que sigue en esa etapa. Lo segundo evita que un doble envio, o un
    // formulario que se quedo abierto, pise los datos de una oportunidad que
    // ya avanzo (con presupuesto generado o incluso enviado).
    let oportunidadExistente: OportunidadExistente | null = null;
    if (entrada.oportunidadId) {
        const oportunidad = await obtenerOportunidad(subcuenta, entrada.oportunidadId);

        if (!oportunidad || !puedeVerOportunidad(filtroPropietario(sesion), oportunidad)) {
            return NextResponse.json({ error: "No se ha encontrado la oportunidad" }, { status: 404 });
        }
        if (oportunidad.etapa !== "VISITA_CONCERTADA") {
            return NextResponse.json(
                {
                    error:
                        "Esta oportunidad ya no esta en Visita concertada: sus datos ya se tomaron. " +
                        "Abrela desde el panel para ver en que punto esta.",
                },
                { status: 409 }
            );
        }

        oportunidadExistente = { id: oportunidad.id, contactId: oportunidad.contacto.id };
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
        }, sesion.usuarioGhl ?? null, oportunidadExistente);

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