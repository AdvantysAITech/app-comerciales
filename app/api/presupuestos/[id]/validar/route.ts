import { NextRequest, NextResponse } from "next/server";
import { sesionApp } from "@/lib/sesion";
import { leerRegistro } from "@/lib/documentos/estado";
import { leerAjustes } from "@/lib/documentos/ajustes";
import { documentoAlDia } from "@/lib/documentos/revision";
import { escribirCasillas } from "@/lib/ghl/casillas";

/**
 * Da el presupuesto por bueno.
 *
 * Lo único que hace es marcar la casilla "Presupuesto validado". NO envía nada
 * a nadie: desde aquí el CRM avisa al comercial propietario de la oportunidad
 * para que sea él quien haga llegar el documento al administrador.
 *
 * ---------------------------------------------------------------------------
 * LAS DOS COMPROBACIONES ANTES DE MARCAR
 * ---------------------------------------------------------------------------
 *  1. Tiene que haber un documento PUBLICADO. Validar una oportunidad cuyo
 *     campo "Presupuesto" está vacío o trae la versión anterior deja al
 *     comercial enviando un documento que no es el aprobado.
 *  2. El documento tiene que ser POSTERIOR al último ajuste. Si dirección tocó
 *     algo después de generar, el PDF de la oportunidad no es el que está
 *     viendo en pantalla.
 */
export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const sesion = await sesionApp();

    if (!sesion) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (sesion.rol !== "direccion") {
        return NextResponse.json(
            { error: "Solo dirección puede validar un presupuesto." },
            { status: 403 }
        );
    }

    const subcuenta = sesion.subcuenta;
    const { id: oportunidadId } = await params;

    try {
        const [registro, ajustes] = await Promise.all([
            leerRegistro(subcuenta, oportunidadId),
            leerAjustes(subcuenta, oportunidadId),
        ]);

        if (!registro || registro.estado !== "publicado" || !registro.urlDocumento) {
            return NextResponse.json(
                {
                    error:
                        "No hay ningún documento publicado para esta oportunidad. " +
                        "Genera el presupuesto antes de validarlo.",
                },
                { status: 409 }
            );
        }

        if (!documentoAlDia(registro.actualizadoEn, ajustes)) {
            return NextResponse.json(
                {
                    error:
                        "Has cambiado el presupuesto después de generar el documento. " +
                        "Vuelve a generarlo para validar la versión que has dejado.",
                },
                { status: 409 }
            );
        }

        await escribirCasillas(subcuenta, oportunidadId, { PRESUPUESTO_VALIDADO: true });

        console.info(
            `[revision] ${oportunidadId}: presupuesto ${registro.numeroReferencia} validado por ` +
                `${sesion.nombre ?? sesion.email}.`
        );

        return NextResponse.json({
            validado: true,
            numeroReferencia: registro.numeroReferencia,
            urlDocumento: registro.urlDocumento,
        });
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        console.error(`[revision] validar ${oportunidadId}: ${mensaje}`);
        return NextResponse.json({ error: mensaje }, { status: 500 });
    }
}
