import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { esSubcuentaValida, type SubcuentaSlug } from "../../lib/subcuenta";
import { saFetch } from "../../lib/ghl/client";
import { obtenerComunidad } from "../../lib/ghl/comunidades";
import { obtenerAdministrador } from "../../lib/ghl/administradores";
import type { PayloadVisita } from "../../lib/visita/payload";
import { auditarPayload, presupuestar, RutasSinMapearError } from "../../lib/documentos/mapeo-capitulos";
import { formatearImporte } from "../../lib/documentos/motor";
import { prepararDocumento } from "../../lib/documentos/payloadDocumento";
import { obtenerPlantilla } from "../../lib/documentos/plantilla";
import {
    consultarEstado,
    descargarOdt,
    esperarResultado,
    generarDocumento,
    tokensConsumidos,
    verificarResultado,
} from "../../lib/documentos/soluciona";
import { postprocesarOdt } from "../../lib/documentos/odf";
import { verificarPlantilla } from "../../lib/documentos/plantillaVerificacion";
import { assertPortada, construirPortada } from "../../lib/documentos/portada";
import { renderizarPortada } from "../../lib/documentos/portada.svg";
import { rasterizarSvg } from "../../lib/documentos/rasterizar";

/**
 * scripts/tarifa/soluciona-e2e.ts
 *
 * Cadena completa contra la API REAL de Soluciona, desde terminal.
 *
 *   npm run soluciona:e2e -- <oportunidadId>
 *   npm run soluciona:e2e -- <oportunidadId> --subcuenta=scala-valencia --version=2
 *
 * Sirve para responder la pregunta que sigue sin verificar: ¿Soluciona respeta
 * el texto que NO es markerkey, o parte el [[PORTADA]] al reescribir el
 * content.xml, igual que hace LibreOffice? Si lo parte, hay que cambiar el
 * mecanismo del marcador y `odf.ts` con él, así que conviene saberlo ANTES de
 * cablear nada en el pipeline.
 *
 * ---------------------------------------------------------------------------
 * QUÉ TOCA Y QUÉ NO
 * ---------------------------------------------------------------------------
 * LEE de GHL: la oportunidad, la comunidad, el administrador y la plantilla.
 * ESCRIBE en Soluciona: una generación real, que consume tokens.
 * NO escribe NADA en GHL: ni registro de estado, ni subida del documento, ni
 * correlativo. Se usa una referencia de prueba con prefijo propio, que
 * `extraerCorrelativo` ignora, para no gastar un número de la serie real.
 *
 * El RequestId lleva sufijo "-e2e" para no colisionar con las generaciones que
 * lance el comercial desde la app: la API es idempotente por ese campo.
 */

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const oportunidadId = args.find((a) => !a.startsWith("--"));
const valorDe = (nombre: string) =>
    args.find((a) => a.startsWith(`--${nombre}=`))?.split("=").slice(1).join("=");

if (!oportunidadId) {
    console.error(
        "\n  Uso: npm run soluciona:e2e -- <oportunidadId> [--subcuenta=scala-valencia] [--version=1]\n"
    );
    process.exit(1);
}

const subcuenta = (valorDe("subcuenta") ?? "scala-valencia") as SubcuentaSlug;
if (!esSubcuentaValida(subcuenta)) {
    console.error(`\n  Subcuenta desconocida: ${subcuenta}\n`);
    process.exit(1);
}

const version = Number(valorDe("version") ?? 1);
const requestId = `${subcuenta}-${oportunidadId}-e2e-v${version}`;

const CUSTOM_FIELD_DATOS_VISITA = "xFXns9nopnKIR4RDRf2g";

const salida = join(process.cwd(), "salida", "e2e");
mkdirSync(salida, { recursive: true });

function paso(n: string) {
    console.log(`\n── ${n} ${"─".repeat(Math.max(0, 60 - n.length))}`);
}

// ---------------------------------------------------------------------------

async function main() {
    console.log(`\n  Subcuenta ....... ${subcuenta}`);
    console.log(`  Oportunidad ..... ${oportunidadId}`);
    console.log(`  RequestId ....... ${requestId}`);

    // --- 1. Payload de la visita -----------------------------------------
    paso("1. Payload de la visita");
    const datos = await saFetch(subcuenta, `/opportunities/${oportunidadId}`);
    const oportunidad = datos.opportunity ?? datos;
    const campos: Array<{ id: string; fieldValue?: unknown; field_value?: unknown }> =
        oportunidad?.customFields ?? [];

    const campo = campos.find((c) => c.id === CUSTOM_FIELD_DATOS_VISITA);
    const valor = campo?.fieldValue ?? campo?.field_value;
    if (typeof valor !== "string" || valor.trim() === "") {
        throw new Error("La oportunidad no tiene datos de visita guardados.");
    }
    const payload = JSON.parse(valor) as PayloadVisita;
    console.log(`  ok  ${payload.modulos.length} módulo(s), visita del ${payload.fechaVisita}`);

    // --- 2. Presupuesto ---------------------------------------------------
    paso("2. Motor económico");
    let presupuesto;
    try {
        presupuesto = presupuestar(payload);
    } catch (error) {
        if (error instanceof RutasSinMapearError) {
            console.error(`\n  ✘ Trabajos sin partida en la tarifa 2026:`);
            for (const r of error.rutasSinPrecio) console.error(`      ${r}`);
            console.error(`\n  Esto se arregla en el mapeo, no aquí.\n`);
            process.exit(1);
        }
        throw error;
    }
    console.log(
        `  ok  ${presupuesto.capitulos.length} capítulos · PEM ${formatearImporte(presupuesto.pem)} €` +
            ` · TOTAL ${formatearImporte(presupuesto.total)} €`
    );

    const auditoria = auditarPayload(payload);
    if (auditoria.propuestas.length > 0) {
        console.log(`  !   ${auditoria.propuestas.length} partida(s) con equivalencia PROPUESTA`);
    }
    if (auditoria.textoLibre.length > 0) {
        console.log(`  !   ${auditoria.textoLibre.length} anotación(es) de texto libre sin valorar`);
    }

    // --- 3. Fichas --------------------------------------------------------
    paso("3. Comunidad y administrador");
    if (!payload.comunidad.id || !payload.administrador.id) {
        throw new Error("La visita no tiene comunidad o administrador enlazados.");
    }
    const [comunidad, administrador] = await Promise.all([
        obtenerComunidad(subcuenta, payload.comunidad.id),
        obtenerAdministrador(subcuenta, payload.administrador.id),
    ]);
    if (!comunidad?.localidad || !comunidad?.provincia || !administrador?.localidad) {
        throw new Error(
            "Faltan Localidad o Provincia en la ficha de la comunidad o del administrador."
        );
    }
    console.log(`  ok  ${comunidad.nombreDireccion} (${comunidad.localidad}, ${comunidad.provincia})`);
    console.log(`  ok  ${administrador.nombreDespacho} (${administrador.localidad})`);

    // --- 4. JSON del documento -------------------------------------------
    paso("4. JSON del documento");

    // Referencia de PRUEBA: prefijo propio para que `extraerCorrelativo` la
    // ignore y no desplace la serie real.
    const referencia = `E2E-${new Date().toISOString().slice(0, 10)}`;

    const preparado = prepararDocumento(payload, {
        numeroReferencia: referencia,
        comunidadLocalidad: comunidad.localidad,
        comunidadProvincia: comunidad.provincia,
        administradorLocalidad: administrador.localidad,
        presupuesto,
    });
    if (!preparado.ok) {
        console.error(`\n  ✘ No pasa la validación previa:`);
        for (const e of preparado.errores) console.error(`      ${e}`);
        process.exit(1);
    }
    writeFileSync(join(salida, "payload.json"), JSON.stringify(preparado.json, null, 2), "utf8");
    console.log(`  ok  validado · guardado en salida/e2e/payload.json`);

    // --- 5. Plantilla -----------------------------------------------------
    paso("5. Plantilla");
    const plantilla = await obtenerPlantilla(subcuenta);
    const antes = verificarPlantilla(plantilla.contenido);
    console.log(`  ${plantilla.nombre} · ${Math.round(plantilla.contenido.byteLength / 1024)} KB`);
    console.log(`  markerkeys íntegros ${antes.markerkeys.encontrados.length} · partidos ${antes.markerkeys.fragmentados.length}`);
    console.log(`  marcador de portada: ${antes.portada.marcadorPresente ? "sí" : "NO"}`);

    if (!antes.valida) {
        console.error(`\n  ✘ La plantilla que hay en Media Storage NO es válida:`);
        for (const h of antes.hallazgos) console.error(`      ${h.nivel === "error" ? "✘" : "!"} ${h.mensaje}`);
        console.error(`\n  Sube la versión preparada antes de seguir.\n`);
        process.exit(1);
    }

    // --- 6. Generación ----------------------------------------------------
    paso("6. Generación en Soluciona");
    const encolado = await generarDocumento({ requestId, json: preparado.json, plantilla });
    console.log(`  encolado · alreadyExisted=${encolado.alreadyExisted}`);
    if (encolado.alreadyExisted) {
        console.log(`  !   ya existía: se devuelve el documento anterior.`);
        console.log(`      Sube --version=N para forzar una generación nueva.`);
    }

    console.log(`  esperando (hasta ~100 s)...`);
    const detalle = await esperarResultado(requestId, { intentos: 20, esperaMs: 5000 });
    console.log(`  status=${detalle.status} · completedUtc=${detalle.completedUtc ?? "—"}`);
    console.log(`  tokens=${tokensConsumidos(detalle)}`);

    const veredicto = verificarResultado(detalle, [], preparado.json);
    if (!veredicto.ok) {
        console.error(`\n  ✘ Veredicto: ${veredicto.motivo}`);
        if ("errores" in veredicto) for (const e of veredicto.errores) console.error(`      ${e}`);
        writeFileSync(join(salida, "detalle.json"), JSON.stringify(detalle, null, 2), "utf8");
        console.error(`\n  Detalle en salida/e2e/detalle.json\n`);
        process.exit(1);
    }
    console.log(`  ok  contenido y mapeo directo verificados`);

    // --- 7. El ODT devuelto ----------------------------------------------
    paso("7. ODT devuelto por Soluciona");
    const odtCrudo = await descargarOdt(requestId);
    writeFileSync(join(salida, "1-devuelto-por-soluciona.odt"), Buffer.from(odtCrudo));
    console.log(`  ${Math.round(odtCrudo.byteLength / 1024)} KB · salida/e2e/1-devuelto-por-soluciona.odt`);

    // ESTA es la pregunta que veníamos a responder.
    const despues = verificarPlantilla(odtCrudo);
    console.log(`  marcador presente ......... ${despues.portada.marcadorPresente ? "sí" : "NO"}`);
    console.log(`  marcador fragmentado ...... ${despues.portada.marcadorFragmentado ? "SÍ" : "no"}`);
    console.log(`  estilo del párrafo ........ ${despues.portada.estiloParrafo ?? "(ninguno)"}`);
    console.log(`  salto de página ........... ${despues.portada.tieneSaltoDePagina ? "sí" : "NO"}`);

    if (!despues.portada.marcadorPresente) {
        console.error(
            `\n  ✘ Soluciona ${despues.portada.marcadorFragmentado ? "ha PARTIDO" : "se ha COMIDO"} el marcador.\n` +
                `\n  El mecanismo del marcador no sirve tal cual: hay que anclarse a algo que su\n` +
                `  conversor no toque (un estilo de párrafo reconocible, por ejemplo) y adaptar\n` +
                `  odf.ts. El ODT crudo está guardado para poder inspeccionarlo.\n`
        );
        process.exit(1);
    }
    console.log(`  ok  Soluciona respeta el marcador`);

    // --- 8. Portada -------------------------------------------------------
    paso("8. Infografía");
    const portada = construirPortada(presupuesto, {
        subcuenta,
        comunidad: comunidad.nombreDireccion ?? payload.comunidad.nombre,
        localidad: comunidad.localidad,
        expediente: referencia,
        fecha: payload.fechaVisita.split("-").reverse().join("/"),
        administrador: administrador.nombreDespacho ?? "",
        administradorLocalidad: administrador.localidad,
    });
    assertPortada(portada, presupuesto);

    const svg = renderizarPortada(portada);
    writeFileSync(join(salida, "portada.svg"), svg, "utf8");

    // Se usa el rasterizador de PRODUCCIÓN, con las fuentes empaquetadas y sin
    // las del sistema. Si se usara `loadSystemFonts`, esta prueba pasaría en
    // Windows y el despliegue saldría con la portada sin texto.
    const png = rasterizarSvg(svg);
    writeFileSync(join(salida, "portada.png"), Buffer.from(png));
    console.log(`  ok  ${portada.capitulos.length} capítulos · PNG ${Math.round(png.length / 1024)} KB`);

    // --- 9. Documento final ----------------------------------------------
    paso("9. Documento final");
    const final = postprocesarOdt(odtCrudo, { portadaPng: new Uint8Array(png) });
    writeFileSync(join(salida, "2-con-portada.odt"), Buffer.from(final));
    console.log(`  ${Math.round(final.byteLength / 1024)} KB · salida/e2e/2-con-portada.odt`);

    console.log(`\n  ✔ Cadena completa. Abre salida/e2e/2-con-portada.odt\n`);
}

main().catch(async (error) => {
    console.error(`\n  ✘ ${error instanceof Error ? error.message : String(error)}`);

    // Si la generación llegó a encolarse, el detalle dice más que el mensaje.
    try {
        const detalle = await consultarEstado(requestId);
        writeFileSync(join(salida, "detalle.json"), JSON.stringify(detalle, null, 2), "utf8");
        console.error(`  Detalle de la petición en salida/e2e/detalle.json`);
    } catch {
        // No había petición, o no se pudo consultar. El mensaje de arriba basta.
    }

    console.error("");
    process.exit(1);
});