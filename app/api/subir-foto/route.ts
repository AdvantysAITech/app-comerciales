import { NextRequest, NextResponse } from "next/server";
import { sesionApp } from "@/lib/sesion";
import { subirFotoSa } from "@/lib/ghl/media";

/**
 * Hasta 60 s en Vercel (24/09/2026): una foto grande con 4G en obra más la
 * subida a GHL no siempre cabe en los 10 s por defecto de Hobby, y el corte
 * llegaba sin mensaje.
 */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
    const sesion = await sesionApp();

    if (!sesion) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const formData = await request.formData();
    const archivo = formData.get("foto");

    if (!(archivo instanceof File)) {
        return NextResponse.json({ error: "No se recibió ninigún archivo válido" }, { status: 400 });
    }
    
    try {
        const subcuenta = sesion.subcuenta;
        const resultado = await subirFotoSa(subcuenta, archivo);
        return NextResponse.json(resultado); // ahora devuelve { url, fileId }
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        return NextResponse.json({ error: mensaje }, { status: 500 });
    }
}