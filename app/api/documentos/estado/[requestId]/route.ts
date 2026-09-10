import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { esSubcuentaValida, type SubcuentaSlug } from "@/lib/subcuenta";
import { subirArchivoSa } from "@/lib/ghl/media";
import { obtenerComunidad } from "@/lib/ghl/comunidades";
import { obtenerAdministrador } from "@/lib/ghl/administradores";
import {
    consultarEstado,
    descargarOdt,
    esTerminal,
    PeticionNoEncontradaError,
    tokensConsumidos,
    verificarResultado,
} from "@/lib/documentos/soluciona";
import { escribirRegistro, extraerVersionesPrompt, leerRegistro } from "@/lib/documentos/estado";
import { postprocesarOdt } from "@/lib/documentos/odf";
import { leerPayloadVisita } from "@/lib/documentos/visitaGuardada";
import { presupuestar } from "@/lib/documentos/mapeo-capitulos";
import { cifrasDelCalculo, type PresupuestoCalculado } from "@/lib/documentos/motor";
import { prepararDocumento } from "@/lib/documentos/payloadDocumento";
import { assertPortada, construirPortada } from "@/lib/documentos/portada";
import { renderizarPortada } from "@/lib/documentos/portada.svg";
import { rasterizarSvg } from "@/lib/documentos/rasterizar";

/**
 * Estado de una generación en curso. El cliente llama a esto en bucle.
 *
 * Cuando la app termina, esta ruta hace además el trabajo de cierre: verifica el
 * contenido, compone la infografía de portada, la inyecta en el ODT, lo sube a
 * GHL y publica. Va aquí y no en un callback porque montar un endpoint público
 * con JWT en las dos direcciones no aporta nada mientras el comercial está
 * esperando delante de la pantalla.
 */

// Verificar, descargar 3,2 MB, rasterizar la portada y volver a subirlo a GHL
// no cabe en 10 s.
export const maxDuration = 60;

// El rasterizador es un binario nativo: no se puede empaquetar en el bundle.
export const runtime = "nodejs";

/**
 * Reconstruye el JSON que se envió a la app.
 *
 * Hace falta para dos cosas: verificar que lo devuelto coincide con lo enviado
 * (`validarMapeoDirecto`) y componer la portada. Se RECALCULA en lugar de
 * guardarse: el motor es determinista, así que sale más barato repetir el
 * cálculo que inventar dónde persistirlo y cuándo invalidarlo.
 */
async function reconstruirContexto(
    subcuenta: SubcuentaSlug,
    oportunidadId: string,
    numeroReferencia: string
) {
    const payload = await leerPayloadVisita(subcuenta, oportunidadId);
    if (!payload) return null;

    const presupuesto = presupuestar(payload);

    if (!payload.comunidad.id || !payload.administrador.id) return null;

    const [comunidad, administrador] = await Promise.all([
        obtenerComunidad(subcuenta, payload.comunidad.id),
        obtenerAdministrador(subcuenta, payload.administrador.id),
    ]);

    if (!comunidad?.localidad || !comunidad?.provincia || !administrador?.localidad) return null;

    const preparado = prepararDocumento(payload, {
        numeroReferencia,
        comunidadLocalidad: comunidad.localidad,
        comunidadProvincia: comunidad.provincia,
        administradorLocalidad: administrador.localidad,
        presupuesto,
    });

    return {
        payload,
        presupuesto,
        comunidad,
        administrador,
        json: preparado.ok ? preparado.json : null,
    };
}

type Contexto = NonNullable<Awaited<ReturnType<typeof reconstruirContexto>>>;

/**
 * Compone la infografía y devuelve el PNG, o `null` si no se ha podido.
 *
 * NUNCA lanza. Un presupuesto sin portada es un presupuesto válido; bloquear la
 * emisión por un adorno de portada sería el peor intercambio posible con un
 * comercial esperando en obra. El motivo se devuelve como aviso para que quede
 * constancia de por qué salió sin ella.
 */
function componerPortada(
    subcuenta: SubcuentaSlug,
    contexto: Contexto,
    numeroReferencia: string,
    avisos: string[]
): Uint8Array | null {
    try {
        const { presupuesto, payload, comunidad, administrador } = contexto;

        const portada = construirPortada(presupuesto, {
            subcuenta,
            comunidad: comunidad.nombreDireccion ?? payload.comunidad.nombre,
            localidad: comunidad.localidad!,
            expediente: numeroReferencia,
            fecha: payload.fechaVisita.split("-").reverse().join("/"),
            administrador: administrador.nombreDespacho ?? "",
            administradorLocalidad: administrador.localidad,
        });

        // Si la portada no cuadra con el motor, no se pinta. Una infografía que
        // contradice su propio desglose es peor que no tener infografía.
        assertPortada(portada, presupuesto);

        return rasterizarSvg(renderizarPortada(portada));
    } catch (error) {
        const motivo = error instanceof Error ? error.message : "error desconocido";
        avisos.push(`El documento se ha publicado SIN la infografía de portada: ${motivo}`);
        return null;
    }
}

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
        let detalle;
        try {
            detalle = await consultarEstado(requestId);
        } catch (error) {
            if (!(error instanceof PeticionNoEncontradaError)) throw error;

            // El registro apunta a una petición que no existe. Se cierra como
            // fallido para que la oportunidad no quede bloqueada: con el
            // registro en un estado no terminal, la UI deshabilita el botón y
            // no hay forma de reintentar.
            const registroHuerfano = await leerRegistro(subcuenta, oportunidadId);
            if (registroHuerfano) {
                await escribirRegistro(
                    subcuenta,
                    oportunidadId,
                    {
                        ...registroHuerfano,
                        estado: "fallido",
                        errores: [error.message],
                        actualizadoEn: new Date().toISOString(),
                    },
                    { forzar: true }
                );
            }
            return NextResponse.json(
                { requestId, estado: "fallido", errores: [error.message] },
                { status: 200 }
            );
        }

        if (!esTerminal(detalle)) {
            return NextResponse.json({ requestId, estado: "generando", status: detalle.status });
        }

        const registro = await leerRegistro(subcuenta, oportunidadId);
        if (!registro) {
            return NextResponse.json({ error: "No hay registro para esta oportunidad." }, { status: 404 });
        }

        const avisos: string[] = [];

        const base = {
            ...registro,
            tokens: tokensConsumidos(detalle),
            versionesPrompt: extraerVersionesPrompt(detalle.sectionTraces ?? []),
        };

        // --- Contexto --------------------------------------------------------
        // Antes se llamaba a `verificarResultado(detalle)` a secas, así que
        // `validarCifras` y `validarMapeoDirecto` eran código muerto: los dos
        // validadores que detectan que la app haya devuelto algo distinto de lo
        // enviado no se ejecutaban nunca en producción. Era el TODO(D2.4).
        let contexto: Contexto | null = null;
        try {
            contexto = await reconstruirContexto(subcuenta, oportunidadId, registro.numeroReferencia);
        } catch (error) {
            const motivo = error instanceof Error ? error.message : "error desconocido";
            avisos.push(`No se ha podido recalcular el presupuesto para verificar el documento: ${motivo}`);
        }

        if (!contexto) {
            avisos.push(
                "El documento se ha publicado sin verificar las cifras ni la portada: no se ha " +
                    "podido reconstruir el contexto de la visita."
            );
        }

        const veredicto = verificarResultado(
            detalle,
            contexto ? cifrasDelCalculo(contexto.presupuesto as PresupuestoCalculado) : [],
            contexto?.json ?? undefined
        );

        if (!veredicto.ok) {
            const errores = "errores" in veredicto ? veredicto.errores : [];
            const guardado = await escribirRegistro(subcuenta, oportunidadId, {
                ...base,
                estado: "fallido",
                errores,
            });
            return NextResponse.json(
                { requestId, estado: guardado.estado, errores, avisos },
                { status: 200 }
            );
        }

        await escribirRegistro(subcuenta, oportunidadId, { ...base, estado: "recibido" });
        const validado = await escribirRegistro(subcuenta, oportunidadId, { ...base, estado: "validado" });

        // --- Documento final -------------------------------------------------
        // La descarga del ODT y el rasterizado de la portada son independientes:
        // van en paralelo para no sumar sus tiempos.
        const [odtCrudo, portadaPng] = await Promise.all([
            descargarOdt(requestId),
            Promise.resolve(
                contexto ? componerPortada(subcuenta, contexto, registro.numeroReferencia, avisos) : null
            ),
        ]);

        // La app genera las tablas sin bordes: se los ponemos antes de publicar.
        // Y aquí entra la portada, sustituyendo el marcador de la plantilla. Sin
        // PNG el marcador se elimina y el documento sale sin portada, que es la
        // degradación buscada.
        const odt = postprocesarOdt(odtCrudo, { portadaPng });

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
            conPortada: Boolean(portadaPng),
            avisos,
        });
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        return NextResponse.json({ error: mensaje }, { status: 500 });
    }
}