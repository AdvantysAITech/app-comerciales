import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { esSubcuentaValida } from "@/lib/subcuenta";
import { subirArchivoSa } from "@/lib/ghl/media";
import {
    consultarEstado,
    descargarOdt,
    esTerminal,
    tokensConsumidos,
    verificarResultado,
} from "@/lib/documentos/soluciona";
import { escribirRegistro, extraerVersionesPrompt, leerRegistro } from "@/lib/documentos/estado";
import { postprocesarOdt } from "@/lib/documentos/odf";

/**
 * Estado de una generación en curso. El cliente llama a esto en bucle.
 *
 * Cuando la app termina, esta ruta hace además el trabajo de cierre: verifica el
 * contenido, sube el ODT a GHL y publica. Va aquí y no en un callback porque
 * montar un endpoint público con JWT en las dos direcciones no aporta nada
 * mientras el comercial está esperando delante de la pantalla.
 */

// Verificar, descargar 3,2 MB y volver a subirlos a GHL no cabe en 10 s.
export const maxDuration = 60;

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ requestId: string }> }
) {
    const session = await auth();

    if (!session?.user?.subcuenta || !esSubcuentaValida(session.user.subcuenta)) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const subcuenta = session.user.subcuenta;
    const { requestId } = await params;

    // El requestId lleva la subcuenta por delante (instancia compartida entre
    // Scala y Vertical). Sin esta comprobación, un comercial de una subcuenta
    // podría consultar documentos de la otra manipulando la URL: sería una
    // fuga entre carteras, justo lo que prohíbe el DERCAS 11.1.
    if (!requestId.startsWith(`${subcuenta}-`)) {
        return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    // "scala-valencia-<oportunidadId>-v<n>"
    const oportunidadId = requestId.slice(subcuenta.length + 1).replace(/-v\d+$/, "");

    try {
        const detalle = await consultarEstado(requestId);

        if (!esTerminal(detalle)) {
            return NextResponse.json({ requestId, estado: "generando", status: detalle.status });
        }

        const registro = await leerRegistro(subcuenta, oportunidadId);
        if (!registro) {
            return NextResponse.json({ error: "No hay registro para esta oportunidad." }, { status: 404 });
        }

        const base = {
            ...registro,
            tokens: tokensConsumidos(detalle),
            versionesPrompt: extraerVersionesPrompt(detalle.sectionTraces ?? []),
        };

        // TODO(D2.4): pasar aquí cifrasDelCalculo(economia) para que se verifique
        // también que la IA no se ha inventado ningún importe. Requiere volver a
        // calcular la economía o guardarla en el registro.
        const veredicto = verificarResultado(detalle);

        if (!veredicto.ok) {
            const errores = "errores" in veredicto ? veredicto.errores : [];
            const guardado = await escribirRegistro(subcuenta, oportunidadId, {
                ...base,
                estado: "fallido",
                errores,
            });
            return NextResponse.json({ requestId, estado: guardado.estado, errores }, { status: 200 });
        }

        // El borrador se queda aquí. No avanza a `validado` ni a `publicado`, así
        // que no hay URL que devolver y el comercial no puede descargarlo: la
        // restricción es estructural, no una comprobación en la UI.
        if (registro.borrador) {
            const guardado = await escribirRegistro(subcuenta, oportunidadId, {
                ...base,
                estado: "recibido",
            });
            return NextResponse.json({
                requestId,
                estado: guardado.estado,
                borrador: true,
                tokens: guardado.tokens,
                aviso: "Generado sin precios reales. No es un presupuesto: no se puede enviar.",
            });
        }

        await escribirRegistro(subcuenta, oportunidadId, { ...base, estado: "recibido" });
        const validado = await escribirRegistro(subcuenta, oportunidadId, { ...base, estado: "validado" });

        // La app genera las tablas sin bordes: se los ponemos antes de publicar.
        const odt = postprocesarOdt(await descargarOdt(requestId));
        const nombre = `${registro.numeroReferencia}.odt`;
        const archivo = new File([odt], nombre, {
            type: "application/vnd.oasis.opendocument.text",
        });

        const subido = await subirArchivoSa(subcuenta, archivo);

        const publicado = await escribirRegistro(subcuenta, oportunidadId, {
            ...validado,
            estado: "publicado",
            urlDocumento: subido.url,
        });

        return NextResponse.json({
            requestId,
            estado: publicado.estado,
            urlDocumento: publicado.urlDocumento,
            tokens: publicado.tokens,
        });
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        return NextResponse.json({ error: mensaje }, { status: 500 });
    }
}