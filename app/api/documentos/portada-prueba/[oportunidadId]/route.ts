import { NextRequest, NextResponse } from "next/server";
import { sesionApp } from "@/lib/sesion";
import { oportunidadAutorizada } from "@/lib/permisos";
import { obtenerComunidad } from "@/lib/ghl/comunidades";
import { obtenerAdministrador } from "@/lib/ghl/administradores";
import { leerPayloadVisita } from "@/lib/documentos/visitaGuardada";
import { leerAjustes } from "@/lib/documentos/ajustes";
import { presupuestarConAjustes } from "@/lib/documentos/mapeo-capitulos";
import { calcularFechaValidez } from "@/lib/documentos/payloadDocumento";
import { leerRegistro } from "@/lib/documentos/estado";
import { consultarEstado } from "@/lib/documentos/soluciona";
import { construirPortada, verificarPortada } from "@/lib/documentos/portada";
import { renderizarPortada } from "@/lib/documentos/portada.svg";
import { prepararImagenPortada } from "@/lib/documentos/imagenPortada";
import { rasterizarSvg } from "@/lib/documentos/rasterizar";

/**
 * PRUEBA: genera SOLO la portada de una oportunidad (29/09/2026).
 *
 *   GET /api/documentos/portada-prueba/<oportunidadId>
 *       ?imagen=<url>   usa esa foto en vez de la de la visita
 *       &titulo=<txt>   título a mano (si no, el de la última generación)
 *       &formato=svg    devuelve el SVG en vez del PNG
 *
 * Hace exactamente lo mismo que el cierre de la generación (mismo cálculo con
 * los ajustes de dirección, misma foto, misma verificación y mismo
 * rasterizador), pero se para ahí: NO llama a Soluciona para generar, NO toca
 * el ODT ni el PDF y NO escribe nada en GHL. Solo lee.
 *
 * El título de la IA solo existe en la traza de Soluciona de la última
 * generación: si la oportunidad ya tiene una, se lee de ahí (lectura, no
 * genera nada). Si no, el de `?titulo=` o el de respaldo.
 *
 * Mismo control de acceso que la ficha: sesión y oportunidad visible para
 * quien la pide. Es una herramienta de prueba: se puede borrar la carpeta
 * `app/api/documentos/portada-prueba/` cuando ya no haga falta.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ oportunidadId: string }> }
) {
    const sesion = await sesionApp();
    if (!sesion) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { oportunidadId } = await params;
    const subcuenta = sesion.subcuenta;
    const consulta = request.nextUrl.searchParams;

    try {
        if (!(await oportunidadAutorizada(sesion, oportunidadId))) {
            return NextResponse.json({ error: "No encontrado" }, { status: 404 });
        }

        const payload = await leerPayloadVisita(subcuenta, oportunidadId);
        if (!payload) {
            return NextResponse.json(
                { error: "La oportunidad no tiene datos de visita guardados." },
                { status: 422 }
            );
        }
        if (!payload.comunidad.id || !payload.administrador.id) {
            return NextResponse.json(
                { error: "La visita no tiene comunidad o administrador del CRM." },
                { status: 422 }
            );
        }

        const ajustes = await leerAjustes(subcuenta, oportunidadId);
        const presupuesto = presupuestarConAjustes(payload, ajustes);

        const [comunidad, administrador, registro] = await Promise.all([
            obtenerComunidad(subcuenta, payload.comunidad.id),
            obtenerAdministrador(subcuenta, payload.administrador.id),
            leerRegistro(subcuenta, oportunidadId),
        ]);

        // Título: el que se pase a mano, o el de la última generación.
        let titulo = consulta.get("titulo")?.trim() || null;
        if (!titulo && registro?.requestId) {
            try {
                const detalle = await consultarEstado(registro.requestId);
                titulo =
                    (detalle.sectionTraces ?? [])
                        .find((t) => t.markerKey === "presup.TituloPresupuesto")
                        ?.aiResponse?.trim() || null;
            } catch {
                // Sin título de la IA: la portada usa el de respaldo.
            }
        }

        // Foto: la de `?imagen=` si se pasa (solo http/https), si no la de la visita.
        const imagenManual = consulta.get("imagen")?.trim();
        const avisos: string[] = [];
        const imagen = await prepararImagenPortada(
            imagenManual && /^https?:\/\//i.test(imagenManual) ? { ...payload, imagenPortada: imagenManual } : payload,
            avisos
        );

        const portada = construirPortada(presupuesto, {
            subcuenta,
            titulo,
            comunidad: comunidad?.nombreDireccion ?? payload.comunidad.nombre,
            localidad: comunidad?.localidad ?? "",
            expediente: registro?.numeroReferencia ?? "PRUEBA",
            fecha: payload.fechaVisita.split("-").reverse().join("/"),
            fechaValidez: calcularFechaValidez(payload.fechaVisita),
            administrador: administrador?.nombreDespacho ?? "",
            administradorLocalidad: administrador?.localidad,
            imagen,
            tiposTrabajo: payload.modulos.map((m) => m.label),
        });

        const fallos = verificarPortada(portada, presupuesto);
        if (fallos.length > 0) {
            return NextResponse.json({ error: "La portada no cuadra con el presupuesto.", fallos }, { status: 422 });
        }

        const svg = renderizarPortada(portada);
        // Los avisos van en una cabecera (codificada: puede llevar acentos).
        const cabeceras = {
            "Cache-Control": "no-store",
            "X-Portada-Avisos": encodeURIComponent(avisos.join(" | ") || "ninguno"),
        };

        if (consulta.get("formato") === "svg") {
            return new NextResponse(svg, { headers: { ...cabeceras, "Content-Type": "image/svg+xml; charset=utf-8" } });
        }

        const png = rasterizarSvg(svg);
        return new NextResponse(Buffer.from(png), { headers: { ...cabeceras, "Content-Type": "image/png" } });
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        console.error(`[portada-prueba] ${oportunidadId}: ${mensaje}`);
        return NextResponse.json({ error: mensaje }, { status: 500 });
    }
}