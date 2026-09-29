import { NextRequest, NextResponse } from "next/server";
import { sesionApp } from "@/lib/sesion";
import { iaDisponible, IaNoConfiguradaError } from "@/lib/ia/claude";
import { buscarEnCype } from "@/lib/propuesta/generar";
import type { ConsultaCype } from "@/lib/propuesta/tipos";
import { capituloPermitido } from "@/lib/catalogo/licencias";

/**
 * Busca UN trabajo en el Generador de Precios de CYPE (paso 3).
 *
 * Una línea por llamada: el formulario lanza todas en paralelo y cada una cabe
 * en el minuto de Vercel. Cuerpo: { consulta, capitulo }.
 * Responde el resultado ya validado (ver `validarCype`), nunca un precio sin
 * comprobar contra la página descargada.
 */

export const maxDuration = 60;

export async function POST(request: NextRequest) {
    const sesion = await sesionApp();
    if (!sesion) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (!iaDisponible()) return NextResponse.json({ error: new IaNoConfiguradaError().message }, { status: 503 });

    let cuerpo: { consulta?: Partial<ConsultaCype>; capitulo?: unknown };
    try {
        cuerpo = await request.json();
    } catch {
        return NextResponse.json({ error: "Cuerpo de la peticion invalido" }, { status: 400 });
    }

    const c = cuerpo.consulta ?? {};
    const campo = (v: unknown) => (typeof v === "string" ? v.slice(0, 1000) : "");
    const consulta: ConsultaCype = {
        tipoTrabajo: campo(c.tipoTrabajo),
        accion: campo(c.accion),
        elemento: campo(c.elemento),
        detalle: campo(c.detalle),
        unidad: typeof c.unidad === "string" ? c.unidad.slice(0, 20) : null,
        textoOriginal: campo(c.textoOriginal),
    };
    if (!consulta.accion && !consulta.elemento && !consulta.textoOriginal) {
        return NextResponse.json({ error: "Falta el trabajo a buscar." }, { status: 400 });
    }

    try {
        const pedido = typeof cuerpo.capitulo === "string" ? cuerpo.capitulo : "03";
        const capitulo = capituloPermitido(sesion.subcuenta, pedido) ? pedido : "03";
        const resultado = await buscarEnCype(consulta, capitulo, sesion.subcuenta);
        return NextResponse.json({ resultado });
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        console.error("[propuesta] cype:", mensaje);
        return NextResponse.json({ error: `No se ha podido consultar CYPE: ${mensaje}` }, { status: 502 });
    }
}
