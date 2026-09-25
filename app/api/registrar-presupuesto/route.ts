import { NextRequest, NextResponse } from "next/server";
import { sesionApp } from "@/lib/sesion";
import { SUBCUENTAS } from "@/lib/subcuenta";
import {
    registrarPresupuesto,
    type EntradaPresupuesto,
    type OportunidadExistente,
} from "@/lib/ghl/presupuestos";
import { oportunidadAutorizada } from "@/lib/permisos";
import { validarSeleccion } from "@/lib/visita/seleccion";

/**
 * Hasta 60 s en Vercel (24/09/2026). Sin esto vale el límite por defecto de
 * Hobby, 10 s, y el alta hace en serie: comunidades (paginado), administradores,
 * contacto, oportunidad y asociación. Con GHL lento se cortaba DESPUÉS de crear
 * la oportunidad: el móvil recibía error, el comercial reintentaba y quedaba
 * duplicada.
 */
export const maxDuration = 60;

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

    // La misma validación que el formulario, repetida en servidor (24/09/2026).
    // Sin ella, una petición con una partida sin medir (un formulario viejo en
    // caché, un fallo del cliente) se registraba y esa partida desaparecía del
    // presupuesto sin aviso.
    const errores = validarSeleccion(subcuenta, entrada.modulosElegidos, entrada.seleccion ?? {});
    if (errores.length > 0) {
        return NextResponse.json(
            { error: `Revisa las partidas: ${errores.map((e) => e.mensaje).join(" · ")}` },
            { status: 422 }
        );
    }

    // Datos tomados sobre una oportunidad en "Visita concertada".
    //
    // Se comprueba AQUI, en servidor, que la oportunidad es de quien envia y
    // que sigue en esa etapa. Lo segundo evita que un doble envio, o un
    // formulario que se quedo abierto, pise los datos de una oportunidad que
    // ya avanzo (con presupuesto generado o incluso enviado).
    let oportunidadExistente: OportunidadExistente | null = null;
    if (entrada.oportunidadId) {
        // Un fallo de GHL ya no se confunde con "no existe": el comercial está
        // en obra y "No se ha encontrado" le haría creer que ha perdido la visita.
        let oportunidad;
        try {
            oportunidad = await oportunidadAutorizada(sesion, entrada.oportunidadId);
        } catch (error) {
            const motivo = error instanceof Error ? error.message : "error desconocido";
            return NextResponse.json(
                {
                    error:
                        "No se ha podido comprobar la oportunidad. Tu visita sigue guardada en el " +
                        `borrador: vuelve a enviarla en unos segundos. (${motivo})`,
                },
                { status: 503 }
            );
        }

        if (!oportunidad) {
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