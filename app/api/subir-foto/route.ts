import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { subirFotoSa } from "@/lib/ghl/media";

export async function POST(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.subcuenta) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const formData = await request.formData();
    const archivo = formData.get("foto");

    if (!(archivo instanceof File)) {
        return NextResponse.json({ error: "No se recibió ninigún archivo válido" }, { status: 400 });
    }
    
    try {
        const subcuenta = session.user.subcuenta as "scala-valencia" | "vertical-projects";
        const resultado = await subirFotoSa(subcuenta, archivo);
        return NextResponse.json(resultado); // ahora devuelve { url, fileId }
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        return NextResponse.json({ error: mensaje }, { status: 500 });
    }
}