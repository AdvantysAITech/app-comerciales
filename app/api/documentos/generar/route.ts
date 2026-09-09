import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { esSubcuentaValida } from "@/lib/subcuenta";
import { saFetch } from "@/lib/ghl/client";
import type { PayloadVisita } from "@/lib/visita/payload";
import { auditarPayload, presupuestar, RutasSinMapearError } from "@/lib/documentos/mapeo-capitulos";
import type { PresupuestoCalculado } from "@/lib/documentos/motor";
import { prepararDocumento } from "@/lib/documentos/payloadDocumento";
import { asignarReferencia } from "@/lib/documentos/contador";
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
 * Traduce rutas técnicas a algo que el comercial entienda.
 * "cubiertas.impermeabilizacion.epdm" -> "Cubiertas: Impermeabilización > EPDM"
 */
function describirRutas(payload: PayloadVisita, rutas: readonly string[]): string[] {
    const conjunto = new Set(rutas);
    const descripciones: string[] = [];

    for (const modulo of payload.modulos) {
        for (const partida of modulo.partidas) {
            if (!conjunto.has(partida.ruta)) continue;
            const camino = partida.camino?.length ? partida.camino.join(" > ") : partida.ruta;
            descripciones.push(`${modulo.label}: ${camino}`);
        }
    }

    // Si alguna ruta no aparece en el payload, se lista en crudo antes que
    // omitirla: es preferible un tecnicismo a un problema invisible.
    return descripciones.length > 0 ? descripciones : [...rutas];
}

/**
 * Igual que `describirRutas`, pero arrastrando lo que escribió el comercial.
 * En un nodo de texto libre la nota ES el contenido: sin ella el aviso diría
 * "Medianeras: Varios" y nadie sabría qué se ha quedado fuera del documento.
 */
function describirTextoLibre(payload: PayloadVisita, rutas: readonly string[]): string[] {
    const conjunto = new Set(rutas);
    const descripciones: string[] = [];

    for (const modulo of payload.modulos) {
        for (const partida of modulo.partidas) {
            if (!conjunto.has(partida.ruta)) continue;
            const camino = partida.camino?.length ? partida.camino.join(" > ") : partida.ruta;
            const texto = partida.nota?.trim();
            descripciones.push(
                `${modulo.label}: ${camino}${texto ? ` — "${texto}"` : " (sin texto)"}`
            );
        }
    }

    return descripciones.length > 0 ? descripciones : [...rutas];
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

        // --- Presupuesto ------------------------------------------------------
        //
        // Ya no existe el modo borrador. Estaba muerto por construcción:
        // `validarPreVuelo` (contrato.ts) exige que las 18 rutas resuelvan a un
        // valor, así que un documento con los importes vacíos siempre daba 422.
        // La versión anterior colaba porque mandaba ceros, y un cero es un dato
        // falso que nadie detecta hasta que el administrador lo firma.
        //
        // Desde la carga de la tarifa (31/08/2026) los precios existen. Que una
        // ruta no se pueda valorar es un hueco concreto del mapeo, no un estado
        // normal: se corta aquí y se dice exactamente qué falta.
        //
        // Lo que NO corta (09/09/2026): el texto libre. Un nodo "Varios" no tiene
        // unidad ni precio por diseño, así que nunca fue un hueco de mapeo. Antes
        // bloqueaba el presupuesto entero; ahora sale como aviso.
        const avisos: string[] = [];
        let presupuesto: PresupuestoCalculado;

        try {
            presupuesto = presupuestar(payload);
        } catch (error) {
            if (!(error instanceof RutasSinMapearError)) throw error;

            const trabajos = describirRutas(payload, error.rutasSinPrecio);
            return NextResponse.json(
                {
                    error:
                        `No se puede presupuestar: ${trabajos.length} trabajo(s) del formulario no ` +
                        `tienen partida en la tarifa 2026. Avisa a Advantys.\n\n` +
                        trabajos.map((t) => `  · ${t}`).join("\n"),
                    rutasSinMapear: error.rutasSinPrecio,
                    detalle: error.message,
                },
                { status: 422 }
            );
        }

        // --- Avisos de mapeo --------------------------------------------------
        // Nada de esto impide generar, pero el comercial firma con su nombre lo
        // que envíe (DERCAS §5.1) y tiene que verlo antes, no después.
        const auditoria = auditarPayload(payload);

        if (auditoria.textoLibre.length > 0) {
            const anotaciones = describirTextoLibre(
                payload,
                auditoria.textoLibre.map((t) => t.ruta)
            );
            avisos.push(
                `${anotaciones.length} anotación(es) de texto libre NO se han valorado ni aparecen ` +
                    `en el documento (no tienen unidad ni precio de tarifa):\n` +
                    anotaciones.map((a) => `  · ${a}`).join("\n") +
                    `\nSi hay que cobrarlas, pídelas a Advantys como partida de tarifa.`
            );
        }

        if (auditoria.propuestas.length > 0) {
            avisos.push(
                `${auditoria.propuestas.length} partida(s) se han valorado con una equivalencia ` +
                    `de tarifa PROPUESTA por Advantys y todavía no validada por dirección ` +
                    `(DERCAS §6.3). Revisa los importes antes de enviar el presupuesto.`
            );
        }

        // --- Datos que todavía no se capturan -------------------------------
        // Localidad y provincia deberían vivir en la ficha de comunidad de GHL.
        // Mientras no existan esos campos, se marcan visiblemente en lugar de
        // dejarlos en blanco: un hueco pasa desapercibido, "(pendiente)" no.
        const marcador = "(pendiente)";
        avisos.push("Localidad y provincia no se capturan todavía: revísalas antes de enviar.");

        const version = cuerpo.version ?? 1;

        // Correlativo real. Antes se derivaba de los dígitos del oportunidadId,
        // que ni era correlativo ni era único.
        const numeroReferencia = await asignarReferencia(subcuenta);

        const preparado = prepararDocumento(payload, {
            numeroReferencia,
            comunidadLocalidad: marcador,
            comunidadProvincia: marcador,
            administradorLocalidad: marcador,
            presupuesto,
        });

        if (!preparado.ok) {
            // El detalle va en `error` y no solo en `errores` porque la UI solo
            // pinta `error`, y "no pasa la validación previa" no es accionable.
            return NextResponse.json(
                {
                    error:
                        `El documento no pasa la validación previa (${preparado.errores.length} problema(s)):\n\n` +
                        preparado.errores.map((e) => `  · ${e}`).join("\n"),
                    errores: preparado.errores,
                },
                { status: 422 }
            );
        }

        if (cuerpo.simular) {
            return NextResponse.json({
                simulado: true,
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
            actualizadoEn: new Date().toISOString(),
        });

        return NextResponse.json({
            requestId,
            yaExistia: encolado.alreadyExisted,
            avisos,
        });
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        return NextResponse.json({ error: mensaje }, { status: 500 });
    }
}