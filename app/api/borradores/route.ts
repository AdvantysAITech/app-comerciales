import { NextRequest, NextResponse } from "next/server";
import { sesionApp } from "@/lib/sesion";
import { oportunidadAutorizada } from "@/lib/permisos";
import { normalizarDatos } from "@/lib/visita/borrador";
import {
    AlmacenNoDisponibleError,
    almacenDisponible,
    crearBorrador,
    listarBorradores,
} from "@/lib/borradores/almacen";
import { respuestaError, TAMANO_MAXIMO } from "./comun";

/**
 * Borradores de presupuesto (almacén de la app, no GHL). Ver
 * lib/borradores/almacen.ts.
 *
 * GET  -> los borradores que esta sesión puede ver en la subcuenta activa.
 * POST -> crea uno. Cuerpo: { datos, oportunidadId?, administrador? }.
 */

export async function GET() {
    const sesion = await sesionApp();
    if (!sesion) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (!almacenDisponible()) return respuestaError(new AlmacenNoDisponibleError());

    try {
        return NextResponse.json({ borradores: await listarBorradores(sesion) });
    } catch (error) {
        return respuestaError(error);
    }
}

export async function POST(request: NextRequest) {
    const sesion = await sesionApp();
    if (!sesion) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (!almacenDisponible()) return respuestaError(new AlmacenNoDisponibleError());

    const crudo = await request.text();
    if (crudo.length > TAMANO_MAXIMO) {
        return NextResponse.json({ error: "El borrador es demasiado grande." }, { status: 413 });
    }

    let cuerpo: { datos?: unknown; oportunidadId?: unknown; administrador?: unknown };
    try {
        cuerpo = JSON.parse(crudo);
    } catch {
        return NextResponse.json({ error: "Cuerpo de la peticion invalido" }, { status: 400 });
    }

    const datos = normalizarDatos(cuerpo.datos);
    if (!datos.nombreComunidad.trim()) {
        return NextResponse.json({ error: "Un borrador necesita al menos la comunidad." }, { status: 400 });
    }

    // Un borrador enlazado a una oportunidad solo si esa oportunidad es suya.
    let oportunidadId: string | null = null;
    if (typeof cuerpo.oportunidadId === "string" && cuerpo.oportunidadId.trim()) {
        try {
            const oportunidad = await oportunidadAutorizada(sesion, cuerpo.oportunidadId);
            if (!oportunidad) {
                return NextResponse.json({ error: "No se ha encontrado la oportunidad" }, { status: 404 });
            }
            oportunidadId = oportunidad.id;
        } catch (error) {
            return respuestaError(error);
        }
    }

    try {
        const borrador = await crearBorrador(sesion, {
            datos,
            oportunidadId,
            administrador: typeof cuerpo.administrador === "string" ? cuerpo.administrador.trim() || null : null,
        });
        return NextResponse.json({ id: borrador.id, actualizadoEn: borrador.actualizadoEn }, { status: 201 });
    } catch (error) {
        return respuestaError(error);
    }
}
