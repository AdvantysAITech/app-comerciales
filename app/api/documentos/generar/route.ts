import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { esSubcuentaValida } from "@/lib/subcuenta";
import { saFetch } from "@/lib/ghl/client";
import type { PayloadVisita } from "@/lib/visita/payload";
import { presupuestar, PreciosPendientesError } from "@/lib/documentos/mapeo-capitulos";
import { calcularEconomia, type Economia, type PartidaValorada } from "@/lib/documentos/economia";
import { prepararDocumento, formatearReferencia } from "@/lib/documentos/payloadDocumento";
import { obtenerPlantilla } from "@/lib/documentos/plantilla";
import { construirRequestId, generarDocumento } from "@/lib/documentos/soluciona";
import { documentosDisponibles, escribirRegistro, leerRegistro } from "@/lib/documentos/estado";

/**
 * Encola la generación del presupuesto de una oportunidad.
 *
 * NO espera al documento. La app tarda ~40 s reales y esperar aquí agotaría el
 * tiempo de la función. Devuelve el requestId y el cliente hace polling contra
 * /api/documentos/estado/[requestId].
 */

// La descarga de la plantilla (3,2 MB) más el reenvío no caben en los 10 s por
// defecto. No se espera a la generación, pero sí a que la app acepte el 202.
export const maxDuration = 60;

/**
 * Campo LARGE_TEXT con el JSON canónico de la visita.
 * Mismo id que en lib/ghl/presupuestos.ts. Se repite aquí a propósito, como ya
 * se hace entre oportunidades.ts y presupuestos.ts, para no tocar ese fichero.
 */
const CUSTOM_FIELD_DATOS_VISITA = "xFXns9nopnKIR4RDRf2g";

type Cuerpo = {
    oportunidadId: string;
    /** Sube para forzar una regeneración real. Por defecto 1. */
    version?: number;
    /**
     * Construye y valida el JSON pero NO llama a la app ni toca GHL.
     *
     * El JSON del documento se arma en memoria y se envía, asi que sin esto no
     * hay forma de inspeccionar que se manda exactamente. Cuando la app falla,
     * lo primero que hay que descartar es que el problema sea la entrada.
     */
    simular?: boolean;
};

/** Lee el payload canónico guardado en la oportunidad. */
async function leerPayloadVisita(
    subcuenta: "scala-valencia" | "vertical-projects",
    oportunidadId: string
): Promise<PayloadVisita | null> {
    const datos = await saFetch(subcuenta, `/opportunities/${oportunidadId}`);
    const oportunidad = datos.opportunity ?? datos;
    const campos: Array<{ id: string; fieldValue?: unknown; field_value?: unknown }> =
        oportunidad?.customFields ?? [];

    const campo = campos.find((c) => c.id === CUSTOM_FIELD_DATOS_VISITA);
    const valor = campo?.fieldValue ?? campo?.field_value;
    if (typeof valor !== "string" || valor.trim() === "") return null;

    try {
        return JSON.parse(valor) as PayloadVisita;
    } catch {
        return null;
    }
}

/**
 * Economía de borrador: misma estructura, precios a CERO.
 *
 * No son precios estimados ni aproximados: son cero, y se ven como cero. Un
 * importe plausible pero inventado es peor que ninguno, porque nadie lo detecta
 * hasta que el administrador lo firma. Un capítulo a 0,00 canta a la primera.
 */
function economiaDeBorrador(payload: PayloadVisita): Economia {
    const porCapitulo = new Map<string, { nombre: string; partidas: PartidaValorada[] }>();

    for (const modulo of payload.modulos) {
        if (modulo.partidas.length === 0) continue;

        porCapitulo.set(modulo.key, {
            nombre: modulo.label,
            partidas: modulo.partidas.map((p) => ({
                ruta: p.ruta,
                codigo: "",
                descripcion: p.camino.join(" > "),
                unidad: p.unidad ?? "",
                cantidad: p.cantidad ?? 0,
                precioUnitario: 0,
            })),
        });
    }

    return calcularEconomia(porCapitulo);
}

export async function POST(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.subcuenta || !esSubcuentaValida(session.user.subcuenta)) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const subcuenta = session.user.subcuenta;

    if (!documentosDisponibles(subcuenta)) {
        return NextResponse.json(
            { error: `La generación de documentos aún no está habilitada en ${subcuenta}.` },
            { status: 501 }
        );
    }

    let cuerpo: Cuerpo;
    try {
        cuerpo = (await request.json()) as Cuerpo;
    } catch {
        return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
    }

    if (!cuerpo.oportunidadId?.trim()) {
        return NextResponse.json({ error: "Falta oportunidadId" }, { status: 400 });
    }

    try {
        const payload = await leerPayloadVisita(subcuenta, cuerpo.oportunidadId);
        if (!payload) {
            return NextResponse.json(
                { error: "La oportunidad no tiene datos de visita guardados." },
                { status: 404 }
            );
        }

        // --- Economía: real si hay precios, borrador si no ------------------
        const avisos: string[] = [];
        let economia: Economia;
        let esBorrador = false;

        try {
            economia = presupuestar(payload);
        } catch (error) {
            if (!(error instanceof PreciosPendientesError)) throw error;
            esBorrador = true;
            economia = economiaDeBorrador(payload);
            avisos.push(
                `BORRADOR: ${error.rutasSinPrecio.length} partidas sin precio en el catálogo. ` +
                    `Los importes salen a cero y el documento NO se puede enviar al administrador.`
            );
        }

        // --- Datos que todavía no se capturan -------------------------------
        // Localidad y provincia deberían vivir en la ficha de comunidad de GHL.
        // Mientras no existan esos campos, se marcan visiblemente en lugar de
        // dejarlos en blanco: un hueco pasa desapercibido, "(pendiente)" no.
        const marcador = "(pendiente)";
        if (!esBorrador) {
            avisos.push("Localidad y provincia no se capturan todavía: revísalas antes de enviar.");
        }

        const version = cuerpo.version ?? 1;
        const preparado = prepararDocumento(payload, {
            // PENDIENTE: contador correlativo real. El formato ya sigue el
            // DERCAS 12.3 (ESC-/VRT-); falta dónde vive el número.
            numeroReferencia: formatearReferencia(
                subcuenta,
                new Date().getFullYear(),
                Number(cuerpo.oportunidadId.replace(/\D/g, "").slice(-4)) || 1
            ),
            comunidadLocalidad: marcador,
            comunidadProvincia: marcador,
            administradorLocalidad: marcador,
            economia,
        });

        if (!preparado.ok) {
            return NextResponse.json(
                { error: "El documento no pasa la validación previa.", errores: preparado.errores },
                { status: 422 }
            );
        }

        if (cuerpo.simular) {
            return NextResponse.json({
                simulado: true,
                borrador: esBorrador,
                avisos,
                json: preparado.json,
            });
        }

        // --- Envío -----------------------------------------------------------
        const requestId = construirRequestId(subcuenta, cuerpo.oportunidadId, version);
        const previo = await leerRegistro(subcuenta, cuerpo.oportunidadId);

        await escribirRegistro(
            subcuenta,
            cuerpo.oportunidadId,
            {
                requestId,
                estado: "solicitado",
                numeroReferencia: preparado.json.num_ref,
                borrador: esBorrador,
                actualizadoEn: new Date().toISOString(),
            },
            // Si ya hubo un registro terminal, este es un intento nuevo con otra
            // versión de RequestId: arranca de cero en lugar de intentar una
            // transición desde `publicado` o `fallido`, que no existen.
            { forzar: Boolean(previo) }
        );

        const plantilla = await obtenerPlantilla(subcuenta);
        const encolado = await generarDocumento({ requestId, json: preparado.json, plantilla });

        await escribirRegistro(subcuenta, cuerpo.oportunidadId, {
            requestId,
            estado: "generando",
            numeroReferencia: preparado.json.num_ref,
            borrador: esBorrador,
            actualizadoEn: new Date().toISOString(),
        });

        return NextResponse.json({
            requestId,
            borrador: esBorrador,
            yaExistia: encolado.alreadyExisted,
            avisos,
        });
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        return NextResponse.json({ error: mensaje }, { status: 500 });
    }
}