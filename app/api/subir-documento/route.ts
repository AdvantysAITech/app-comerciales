import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { subirArchivoSa } from "@/lib/ghl/media";
import { extensionDe, motivoRechazo, type ExtensionDocumento } from "@/lib/documentos/tipos";

/**
 * Subida de documentación de proyecto (.bc3 / .xlsx / .pdf).
 *
 * Va aparte de `/api/subir-foto` a propósito: las reglas de validación son
 * distintas y mezclarlas obligaría a ramificar dentro de un endpoint que hoy
 * funciona y no conviene tocar.
 *
 * La validación se repite aquí aunque el cliente ya la haya hecho: el navegador
 * no es una frontera de confianza.
 */

export const maxDuration = 60;

export async function POST(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.subcuenta) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const formData = await request.formData();
    const archivo = formData.get("documento");

    if (!(archivo instanceof File)) {
        return NextResponse.json({ error: "No se recibió ningún documento válido" }, { status: 400 });
    }

    const rechazo = motivoRechazo(archivo.name, archivo.size);
    if (rechazo) {
        return NextResponse.json({ error: rechazo }, { status: 400 });
    }

    try {
        const subcuenta = session.user.subcuenta as "scala-valencia" | "vertical-projects";
        const { url, fileId } = await subirArchivoSa(subcuenta, archivo);

        return NextResponse.json({
            nombre: archivo.name,
            url,
            fileId,
            extension: extensionDe(archivo.name) as ExtensionDocumento,
            bytes: archivo.size,
            origen: "subido" as const,
        });
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        console.error("[subir-documento]", archivo.name, mensaje);
        return NextResponse.json({ error: mensaje }, { status: 500 });
    }
}