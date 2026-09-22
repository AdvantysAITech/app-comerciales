import { NextRequest, NextResponse } from "next/server";
import { sesionApp } from "@/lib/sesion";
import { leerPayloadVisita } from "@/lib/documentos/visitaGuardada";
import { presupuestarConAjustes, RutasSinMapearError } from "@/lib/documentos/mapeo-capitulos";
import { escribirAjustes, leerAjustes, type AjustesPresupuesto } from "@/lib/documentos/ajustes";
import { construirFilas, sanearAjustes, type CuerpoAjustes } from "@/lib/documentos/revision";

/**
 * Guarda los ajustes de dirección sobre el presupuesto de una oportunidad.
 *
 * Devuelve el presupuesto RECALCULADO EN SERVIDOR. La pantalla pinta lo que
 * llega de aquí, no sus propias sumas: el cálculo del navegador es para que
 * Miguel vea el efecto mientras teclea, pero el importe que vale es este.
 *
 * Solo perfil `direccion`. La comprobación va aquí y no solo en la página: un
 * comercial que llame a esta ruta a mano estaría fijando precios.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const sesion = await sesionApp();

    if (!sesion) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (sesion.rol !== "direccion") {
        return NextResponse.json(
            { error: "Solo dirección puede ajustar un presupuesto." },
            { status: 403 }
        );
    }

    const subcuenta = sesion.subcuenta;
    const { id: oportunidadId } = await params;

    let cuerpo: CuerpoAjustes;
    try {
        cuerpo = (await request.json()) as CuerpoAjustes;
    } catch {
        return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
    }

    const saneado = sanearAjustes(cuerpo);
    if (!saneado.ok) {
        return NextResponse.json(
            {
                error: `Los ajustes tienen ${saneado.errores.length} problema(s):\n\n` +
                    saneado.errores.map((e) => `  · ${e}`).join("\n"),
                errores: saneado.errores,
            },
            { status: 422 }
        );
    }

    try {
        const payload = await leerPayloadVisita(subcuenta, oportunidadId);
        if (!payload) {
            return NextResponse.json(
                { error: "La oportunidad no tiene datos de visita guardados." },
                { status: 404 }
            );
        }

        const previos = await leerAjustes(subcuenta, oportunidadId);

        const ajustes: AjustesPresupuesto = {
            version: 1,
            lineas: saneado.lineas,
            anadidas: saneado.anadidas,
            ivaTipo: saneado.ivaTipo,
            // El autor sale de la sesión, nunca del cliente: es la firma de quien
            // ha puesto los precios y tiene que ser fiable.
            autor: sesion.nombre ?? sesion.email ?? "dirección",
            motivo: saneado.motivo ?? previos?.motivo,
            actualizadoEn: new Date().toISOString(),
        };

        // Se calcula ANTES de guardar. Si los ajustes dejan el presupuesto en un
        // estado imposible (todo excluido, una medición que no cuadra), se
        // rechaza y en la oportunidad sigue lo anterior, que sí funcionaba.
        let vista;
        try {
            const base = presupuestarConAjustes(payload, null);
            const actual = presupuestarConAjustes(payload, ajustes);
            vista = construirFilas(base, actual);
        } catch (error) {
            if (error instanceof RutasSinMapearError) throw error;
            const motivo = error instanceof Error ? error.message : "error desconocido";
            return NextResponse.json({ error: motivo, errores: [motivo] }, { status: 422 });
        }

        const guardados = await escribirAjustes(subcuenta, oportunidadId, ajustes);

        return NextResponse.json({ ajustes: guardados, vista });
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        console.error(`[revision] ajustes ${oportunidadId}: ${mensaje}`);
        return NextResponse.json({ error: mensaje }, { status: 500 });
    }
}
