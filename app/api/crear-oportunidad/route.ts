import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { upsertContact } from "@/lib/ghl/contactos";
import { crearOportunidad } from "@/lib/ghl/oportunidades";
import { brotliDecompressSync } from "zlib";

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

        const oportunidad = await crearOportunidad(subcuenta, {
            contactId,
            comunidadNombre: body.comunidadNombre,
            modeloNegocio: body.modeloNegocio,
            fecha: body.fecha,
            contactoVisita: body.contactoVisita,
            descripcionLibre: body.descripcion,
            camposEspecificos: body.camposEspecificos,
            fotos: body.fotos,
        });

        return NextResponse.json({ id: oportunidad.id });
    } catch (error) {
        console.error("Error en /api/crear-oportunidad:", error);
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        return NextResponse.json({ error: mensaje }, { status: 500 });
    }
}