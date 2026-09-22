import { NextRequest, NextResponse } from "next/server";
import { sesionApp } from "@/lib/sesion";
import { upsertContact } from "@/lib/ghl/contactos";
import { buscarOportunidadesAbiertas, adjuntarDatosVisita, crearOportunidadDesdeVisita } from "@/lib/ghl/oportunidades";

export async function POST(request: NextRequest) {
    const sesion = await sesionApp();
    if (!sesion) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const subcuenta = sesion.subcuenta;
    const body = await request.json();

    try {
        const contactId = await upsertContact(subcuenta, {
            nombre: body.administrador.contactoPrincipal ?? body.administrador.nombreDespacho,
            email: body.administrador.email,
            telefono: body.administrador.telefono,
        });

        if (body.oportunidadId) {
            const oportunidad = await adjuntarDatosVisita(subcuenta, body.oportunidadId, body);
            return NextResponse.json({ id: oportunidad.id, estado: "actualizada" });
        }

        const candidatas = await buscarOportunidadesAbiertas(subcuenta, contactId, [
            "VISITA_CONCERTADA",
        ]);

        if (candidatas.length === 0) {
            const oportunidad = await crearOportunidadDesdeVisita(subcuenta, {
                contactId,
                comunidadId: body.comunidadId,
                comunidadNombre: body.comunidadNombre,
                modeloNegocio: body.modeloNegocio,
                fecha: body.fecha,
                contactoVisita: body.contactoVisita,
                descripcionLibre: body.descripcionLibre,
                camposEspecificos: body.camposEspecificos,
                fotos: body.fotos,
                asignadoA: sesion.usuarioGhl ?? null,
            });
            return NextResponse.json({ id: oportunidad.id, estado: "creada" });
        }

        if (candidatas.length === 1) {
            const oportunidad = await adjuntarDatosVisita(subcuenta, candidatas[0].id, body);
            return NextResponse.json({ id: oportunidad.id, estado: "actualizada" });
        }

        return NextResponse.json({ estado: "elegir", candidatas })
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        return NextResponse.json({ error: mensaje }, { status: 500 });
    }
}