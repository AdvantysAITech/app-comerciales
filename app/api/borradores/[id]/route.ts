import { NextRequest, NextResponse } from "next/server";
import { sesionApp } from "@/lib/sesion";
import { normalizarDatos } from "@/lib/visita/borrador";
import {
    AlmacenNoDisponibleError,
    almacenDisponible,
    eliminarBorrador,
    guardarBorrador,
    leerBorrador,
} from "@/lib/borradores/almacen";
import { respuestaError, TAMANO_MAXIMO } from "../comun";

/**
 * Un borrador. "No existe" y "no es tuyo" responden igual (404).
 *
 * GET    -> el borrador completo.
 * PUT    -> sustituye los datos. Cuerpo: { datos, administrador? }.
 * DELETE -> lo elimina.
 */

type Contexto = { params: Promise<{ id: string }> };

const NO_ENCONTRADO = () =>
    NextResponse.json({ error: "Este borrador ya no existe o no es tuyo." }, { status: 404 });

export async function GET(_request: NextRequest, { params }: Contexto) {
    const sesion = await sesionApp();
    if (!sesion) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (!almacenDisponible()) return respuestaError(new AlmacenNoDisponibleError());

    try {
        const borrador = await leerBorrador(sesion, (await params).id);
        return borrador ? NextResponse.json({ borrador }) : NO_ENCONTRADO();
    } catch (error) {
        return respuestaError(error);
    }
}

export async function PUT(request: NextRequest, { params }: Contexto) {
    const sesion = await sesionApp();
    if (!sesion) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (!almacenDisponible()) return respuestaError(new AlmacenNoDisponibleError());

    const crudo = await request.text();
    if (crudo.length > TAMANO_MAXIMO) {
        return NextResponse.json({ error: "El borrador es demasiado grande." }, { status: 413 });
    }

    let cuerpo: { datos?: unknown; administrador?: unknown };
    try {
        cuerpo = JSON.parse(crudo);
    } catch {
        return NextResponse.json({ error: "Cuerpo de la peticion invalido" }, { status: 400 });
    }

    const datos = normalizarDatos(cuerpo.datos);
    if (!datos.nombreComunidad.trim()) {
        return NextResponse.json({ error: "Un borrador necesita al menos la comunidad." }, { status: 400 });
    }

    try {
        const borrador = await guardarBorrador(sesion, (await params).id, {
            datos,
            administrador: typeof cuerpo.administrador === "string" ? cuerpo.administrador.trim() || null : null,
        });
        return borrador ? NextResponse.json({ id: borrador.id, actualizadoEn: borrador.actualizadoEn }) : NO_ENCONTRADO();
    } catch (error) {
        return respuestaError(error);
    }
}

export async function DELETE(_request: NextRequest, { params }: Contexto) {
    const sesion = await sesionApp();
    if (!sesion) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (!almacenDisponible()) return respuestaError(new AlmacenNoDisponibleError());

    try {
        return (await eliminarBorrador(sesion, (await params).id))
            ? NextResponse.json({ ok: true })
            : NO_ENCONTRADO();
    } catch (error) {
        return respuestaError(error);
    }
}
