import { NextResponse } from "next/server";
import { AlmacenNoDisponibleError } from "@/lib/borradores/almacen";

/**
 * Tope del cuerpo. Un borrador son textos y URLs de fotos ya subidas: unos
 * pocos KB. Upstash limita la petición a 1 MB en el plan gratuito.
 */
export const TAMANO_MAXIMO = 512 * 1024;

export function respuestaError(error: unknown) {
    if (error instanceof AlmacenNoDisponibleError) {
        return NextResponse.json(
            { error: "Los borradores no están disponibles ahora. Tu visita sigue guardada en este dispositivo." },
            { status: 503 }
        );
    }
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    console.error("[borradores]", mensaje);
    return NextResponse.json({ error: mensaje }, { status: 500 });
}
