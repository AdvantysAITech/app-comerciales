import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { upsertContact } from "@/lib/ghl/contactos";
import { buscarOportunidadesAbiertas, adjuntarDatosVisita, ETAPA } from "@/lib/ghl/oportunidades";

export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.subcuenta) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const subcuenta = session.user.subcuenta as "scala-valencia" | "vertical-projects";
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
            ETAPA.AVISO_RECIBIDO,
        ]);

        if (candidatas.length === 0) {
            return NextResponse.json(
                { error: "No hay ninguna oportunidad abierta para este administrador. Verificar que la visita esté agendada." },
                { status: 404 }
            );
        }

        if (candidatas.length === 1) {
            const oportunidad = await adjuntarDatosVisita(subcuenta, candidatas[0].id, body);
            return NextResponse.json({ id: oportunidad.id, estado: "actualizada" });
        }

        return NextResponse.json
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        return NextResponse.json({ error: mensaje }, { status: 500 });
    }
}