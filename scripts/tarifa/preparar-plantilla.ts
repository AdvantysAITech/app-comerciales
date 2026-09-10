import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { prepararPlantilla } from "../../lib/documentos/plantillaPortada";
import { verificarPlantilla } from "../../lib/documentos/plantillaVerificacion";

/**
 * scripts/tarifa/preparar-plantilla.ts
 *
 * Añade la página de portada a una plantilla ODT y la verifica.
 *
 *   npm run plantilla:preparar -- ruta\a\Plantilla_Presupuesto_Scala.odt
 *   npm run plantilla:preparar -- entrada.odt salida.odt
 *
 * Por defecto escribe junto al original con el sufijo "-portada". NO sobrescribe
 * la entrada: si algo sale mal, la plantilla que hoy funciona sigue intacta.
 */

/**
 * Lee el fichero y devuelve su contenido, o corta con un mensaje util.
 *
 * Sin esto, una ruta mal escrita saca un volcado de Node de quince lineas y hay
 * que leerlo entero para enterarse de que el fichero no existe.
 */
function leerOdt(ruta: string): ArrayBuffer {
    if (!existsSync(ruta)) {
        console.error(
            `\n  No existe: ${ruta}\n` +
                `\n  Descarga primero la plantilla de GHL Media Storage. La URL esta en` +
                `\n  .env.local (SOLUCIONA_PLANTILLA_SCALA_URL / SOLUCIONA_PLANTILLA_VERTICAL_URL).\n`
        );
        process.exit(1);
    }

    const fichero = readFileSync(ruta);

    // Un enlace caducado de Media Storage devuelve 200 con HTML. Sin esta
    // comprobacion, el error seria un fallo de descompresion del ZIP y nos
    // mandaria a buscar el problema al sitio equivocado.
    if (fichero.length < 2 || fichero[0] !== 0x50 || fichero[1] !== 0x4b) {
        console.error(
            `\n  ${ruta} no es un ODT (${fichero.length} bytes, no empieza por "PK").\n` +
                `\n  Si lo has descargado de Media Storage, lo mas probable es que el enlace` +
                `\n  haya caducado y lo que tengas sea una pagina de error en HTML.\n`
        );
        process.exit(1);
    }

    return fichero.buffer.slice(
        fichero.byteOffset,
        fichero.byteOffset + fichero.byteLength
    ) as ArrayBuffer;
}

const entrada = process.argv[2];
if (!entrada) {
    console.error(
        "\n  Uso: npm run plantilla:preparar -- <plantilla.odt> [salida.odt]\n" +
            "\n  Descarga primero la plantilla de GHL Media Storage.\n"
    );
    process.exit(1);
}

const salida =
    process.argv[3] ??
    join(dirname(entrada), `${basename(entrada, extname(entrada))}-portada${extname(entrada) || ".odt"}`);

const buffer = leerOdt(entrada);

console.log(`\n  Entrada: ${entrada}  (${Math.round(buffer.byteLength / 1024)} KB)`);

// --- Estado de partida -----------------------------------------------------
const antes = verificarPlantilla(buffer);
console.log(`  Markerkeys íntegros: ${antes.markerkeys.encontrados.length}`);
if (antes.markerkeys.fragmentados.length > 0) {
    console.log(`  Markerkeys PARTIDOS en la entrada: ${antes.markerkeys.fragmentados.length}`);
    for (const t of antes.markerkeys.fragmentados) console.log(`      {{${t}}}`);
    console.log(`  Se intentarán reparar.`);
}

// --- Preparación -----------------------------------------------------------
const { odt, cambios, omitidos, reparados, irreparables } = prepararPlantilla(buffer);

console.log("");
for (const t of reparados) console.log(`  ~  reparado ${t}`);
for (const t of irreparables) console.log(`  ✘  NO reparable: ${t}`);
for (const c of cambios) console.log(`  +  ${c}`);
for (const o of omitidos) console.log(`  =  ${o}`);
if (cambios.length === 0) console.log("  =  nada que hacer: ya estaba preparada");

// --- Verificación del resultado -------------------------------------------
const despues = verificarPlantilla(odt);

/**
 * `presup.DesgloseCapitulos` se convierte a [[DESGLOSE]] a propósito: el
 * desglose sale del JSON porque la app tiene un tope de 4000 caracteres por
 * campo. Desaparecer de la lista de markerkeys es lo esperado, no una pérdida.
 */
const CONVERTIDOS_A_PROPOSITO = ["presup.DesgloseCapitulos"];

const perdidos = antes.markerkeys.encontrados.filter(
    (t) => !despues.markerkeys.encontrados.includes(t) && !CONVERTIDOS_A_PROPOSITO.includes(t)
);

console.log("\n  == Verificación ==");
console.log(`  markerkeys íntegros ....... ${despues.markerkeys.encontrados.length}`);
console.log(`  partidos .................. ${despues.markerkeys.fragmentados.length}`);
console.log(`  desconocidos .............. ${despues.markerkeys.desconocidos.length}`);
console.log(`  ausentes .................. ${despues.markerkeys.ausentes.length}`);
console.log(`  marcador de portada ....... ${despues.portada.marcadorPresente ? "sí" : "NO"}`);
console.log(`  salto de página ........... ${despues.portada.tieneSaltoDePagina ? "sí" : "NO"}`);
console.log(`  márgenes a cero ........... ${despues.portada.margenesACero ? "sí" : "NO"}`);

if (perdidos.length > 0) {
    console.log(`\n  ✘ La preparación ha PERDIDO markerkeys:`);
    for (const t of perdidos) console.log(`      {{${t}}}`);
    console.log("\n  No se escribe nada. Esto es un fallo del script, avisa a Advantys.\n");
    process.exit(1);
}

if (despues.hallazgos.length > 0) {
    console.log("");
    for (const h of despues.hallazgos) {
        console.log(`  ${h.nivel === "error" ? "✘" : "!"}  ${h.mensaje}`);
    }
}

if (!despues.valida) {
    console.log("\n  No se escribe nada: el resultado no pasa la verificación.\n");
    process.exit(1);
}

writeFileSync(salida, Buffer.from(odt));
console.log(`\n  ✔ Escrita en ${salida}`);
console.log(`\n  Siguiente paso: súbela a GHL Media Storage y pon su URL en .env.local`);
console.log(`  (SOLUCIONA_PLANTILLA_SCALA_URL / SOLUCIONA_PLANTILLA_VERTICAL_URL).`);
console.log(`  NO la abras en LibreOffice ni en Word por el camino.\n`);