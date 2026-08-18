import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { transcribirAudio } from "@/lib/gemini/transcripcion";

/**
 * Transcripción de las observaciones dictadas en el formulario de visita.
 *
 * La clave de Gemini vive solo en el servidor: el navegador nunca la ve. Por eso
 * el audio pasa por aquí en lugar de llamar a Gemini desde el cliente.
 */

// Vercel corta las funciones a 10s en el plan Hobby. Un minuto de audio tarda
// bastante menos, pero con cobertura mala en obra la subida se alarga.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.subcuenta) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const formData = await request.formData();
    const archivo = formData.get("audio");

    if (!(archivo instanceof File)) {
        return NextResponse.json({ error: "No se recibió ningún audio válido" }, { status: 400 });
    }

    try {
        const { texto, vacio } = await transcribirAudio(archivo);
        return NextResponse.json({ texto, vacio });
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        // El detalle se queda en los logs de Vercel; al comercial en obra no le
        // sirve de nada un volcado de la API de Google.
        console.error("[transcribir-audio]", mensaje);
        return NextResponse.json({ error: mensaje }, { status: 500 });
    }
}