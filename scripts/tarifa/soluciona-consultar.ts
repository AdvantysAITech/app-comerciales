import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
    consultarEstado,
    descargarOdt,
    esCompletado,
    esTerminal,
    tokensConsumidos,
} from "../../lib/documentos/soluciona";
import { verificarPlantilla } from "../../lib/documentos/plantillaVerificacion";
import { leerRegistro } from "../../lib/documentos/estado";
import { esSubcuentaValida, type SubcuentaSlug } from "../../lib/subcuenta";

/**
 * scripts/tarifa/soluciona-consultar.ts
 *
 *   npm run soluciona:consultar -- scala-valencia-4f6qFIc7BBomxra51k9V-v6
 *   npm run soluciona:consultar -- 4f6qFIc7BBomxra51k9V        (id de oportunidad)
 *   npm run soluciona:consultar -- <lo que sea> --odt
 *
 * Pregunta a Soluciona en qué punto está una petición. NO regenera nada y NO
 * toca GHL: es seguro lanzarlo mientras la app está haciendo polling.
 *
 * Sirve para separar dos cosas que desde la UI se ven igual: que Soluciona siga
 * trabajando, o que nuestra ruta de estado esté fallando en cada vuelta.
 */

const args = process.argv.slice(2);
const entrada = args.find((a) => !a.startsWith("--"));
const conOdt = args.includes("--odt");
const subcuenta = ((args.find((a) => a.startsWith("--subcuenta="))?.split("=")[1] ??
    "scala-valencia") as SubcuentaSlug);

if (!entrada || !esSubcuentaValida(subcuenta)) {
    console.error(
        "\n  Uso: npm run soluciona:consultar -- <requestId | oportunidadId> [--odt] [--subcuenta=...]\n"
    );
    process.exit(1);
}

/**
 * Un requestId lleva la subcuenta por delante y la versión al final. Cualquier
 * otra cosa se toma por id de oportunidad y se resuelve leyendo el registro
 * guardado en GHL.
 *
 * Es lo que hacía falta: si la app dice "generando" y Soluciona responde 404,
 * lo primero que hay que saber es qué requestId cree la app que está esperando.
 */
async function resolverRequestId(valor: string): Promise<string> {
    if (/^[a-z-]+-.+-v\d+$/.test(valor)) return valor;

    console.log(`\n  "${valor}" no parece un requestId. Se lee el registro de la oportunidad.`);
    const registro = await leerRegistro(subcuenta, valor);

    if (!registro) {
        throw new Error(
            `La oportunidad ${valor} no tiene registro de documento en GHL. ` +
                `O nunca se ha generado, o el campo de estado está vacío.`
        );
    }

    console.log(`  estado en GHL ..... ${registro.estado}`);
    console.log(`  referencia ........ ${registro.numeroReferencia}`);
    console.log(`  actualizado ....... ${registro.actualizadoEn}`);
    if (registro.errores?.length) {
        for (const e of registro.errores) console.log(`  ✘ ${e}`);
    }
    console.log(`  requestId ......... ${registro.requestId}`);

    return registro.requestId;
}

async function main() {
    const requestId = await resolverRequestId(entrada!);
    const detalle = await consultarEstado(requestId);

    console.log(`\n  RequestId ......... ${detalle.requestId}`);
    console.log(`  status ............ ${detalle.status}`);
    console.log(`  createdUtc ........ ${detalle.createdUtc}`);
    console.log(`  completedUtc ...... ${detalle.completedUtc ?? "— (sigue en curso)"}`);
    console.log(`  terminal .......... ${esTerminal(detalle) ? "sí" : "NO"}`);
    console.log(`  completado ok ..... ${esCompletado(detalle.status) ? "sí" : "no"}`);
    console.log(`  plantilla ......... ${detalle.templateFileName ?? "—"}`);
    console.log(`  fichero resultado . ${detalle.resultFileName ?? "—"}`);
    console.log(`  tokens ............ ${tokensConsumidos(detalle)}`);

    if (detalle.failureReason) {
        console.log(`\n  ✘ failureReason: ${detalle.failureReason}`);
    }
    if (detalle.validationErrorsJson) {
        console.log(`  ✘ validationErrors: ${detalle.validationErrorsJson}`);
    }

    const trazas = detalle.sectionTraces ?? [];
    if (trazas.length > 0) {
        console.log(`\n  == Secciones (${trazas.length}) ==`);
        for (const t of trazas) {
            const marca = t.success ? "ok  " : "FAIL";
            const respuesta = (t.aiResponse ?? "").replace(/\s+/g, " ").slice(0, 60);
            console.log(`  ${marca}  ${(t.markerKey ?? "?").padEnd(30)} ${respuesta}`);
            if (t.errorMessage) console.log(`        error: ${t.errorMessage}`);
            if (t.missingVariables?.length) {
                console.log(`        variables ausentes: ${t.missingVariables.join(", ")}`);
            }
        }
    }

    const salida = join(process.cwd(), "salida", "e2e");
    mkdirSync(salida, { recursive: true });
    writeFileSync(join(salida, "detalle.json"), JSON.stringify(detalle, null, 2), "utf8");
    console.log(`\n  Detalle completo en salida/e2e/detalle.json`);

    if (!esTerminal(detalle)) {
        console.log(
            `\n  La petición SIGUE EN CURSO en Soluciona. No es un fallo de la app:\n` +
                `  el polling seguirá hasta que termine.\n`
        );
        return;
    }

    if (conOdt) {
        const odt = await descargarOdt(requestId);
        const ruta = join(salida, "consultado.odt");
        writeFileSync(ruta, Buffer.from(odt));

        const informe = verificarPlantilla(odt);
        console.log(`\n  == ODT devuelto ==`);
        console.log(`  ${Math.round(odt.byteLength / 1024)} KB · ${ruta}`);
        console.log(`  markerkeys sin sustituir .. ${informe.markerkeys.encontrados.length}`);
        console.log(`  marcador de portada ....... ${informe.portada.marcadorPresente ? "sí" : "NO"}`);
    } else {
        console.log(`\n  Terminal. Añade --odt para descargar y verificar el documento.\n`);
    }
}

main().catch((error) => {
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error(`\n  ✘ ${mensaje}`);

    if (mensaje.includes("(404)")) {
        console.error(
            `\n  Un 404 significa que esa petición NO EXISTE en Soluciona: la generación nunca\n` +
                `  llegó a encolarse. El fallo está en /api/documentos/generar, no en la espera.\n` +
                `  Lanza esto con el ID DE OPORTUNIDAD para ver qué requestId tiene el registro:\n\n` +
                `      npm run soluciona:consultar -- <oportunidadId>\n`
        );
    }

    // `process.exit` con peticiones aún cerrándose hace que libuv aborte en
    // Windows con "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)".
    // Con `exitCode`, Node cierra ordenadamente y el código de salida se
    // respeta igual.
    process.exitCode = 1;
});