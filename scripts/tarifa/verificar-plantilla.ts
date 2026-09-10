import { readFileSync } from "node:fs";
import { verificarPlantilla } from "../../lib/documentos/plantillaVerificacion";
import { RUTAS } from "../../lib/documentos/contrato";

/**
 * scripts/tarifa/verificar-plantilla.ts
 *
 *   npm run plantilla:verificar -- ruta\a\plantilla.odt
 *
 * Sirve para tres cosas:
 *  - la plantilla ANTES de subirla a Media Storage;
 *  - la plantilla que hay HOY en producción, para saber cómo está;
 *  - el ODT que DEVUELVE la app, para comprobar que no ha tocado el marcador
 *    de portada ni ha partido ningún token por el camino.
 *
 * Ese tercer uso es el que responde a una pregunta que nunca hemos verificado:
 * damos por hecho que la app respeta el texto que no es markerkey, pero no lo
 * hemos comprobado nunca.
 */

const ruta = process.argv[2];
if (!ruta) {
    console.error("\n  Uso: npm run plantilla:verificar -- <fichero.odt>\n");
    process.exit(1);
}

const fichero = readFileSync(ruta);
const buffer = fichero.buffer.slice(
    fichero.byteOffset,
    fichero.byteOffset + fichero.byteLength
) as ArrayBuffer;

const informe = verificarPlantilla(buffer);

console.log(`\n  ${ruta}  (${Math.round(fichero.length / 1024)} KB)`);

console.log(`\n  == Markerkeys ==`);
console.log(`  esperados por el código (RUTAS) ... ${new Set(RUTAS.map((r) => r.markerkey)).size}`);
console.log(`  íntegros en el documento .......... ${informe.markerkeys.encontrados.length}`);
console.log(`  partidos entre etiquetas .......... ${informe.markerkeys.fragmentados.length}`);
console.log(`  desconocidos para el código ....... ${informe.markerkeys.desconocidos.length}`);
console.log(`  ausentes del documento ............ ${informe.markerkeys.ausentes.length}`);

if (informe.markerkeys.encontrados.length > 0) {
    console.log("");
    for (const t of informe.markerkeys.encontrados) {
        const desconocido = informe.markerkeys.desconocidos.includes(t);
        console.log(`    ${desconocido ? "?" : "·"}  {{${t}}}`);
    }
}

console.log(`\n  == Portada ==`);
console.log(`  marcador presente ......... ${informe.portada.marcadorPresente ? "sí" : "NO"}`);
console.log(`  marcador fragmentado ...... ${informe.portada.marcadorFragmentado ? "SÍ" : "no"}`);
console.log(`  estilo del párrafo ........ ${informe.portada.estiloParrafo ?? "(ninguno)"}`);
console.log(`  salto de página ........... ${informe.portada.tieneSaltoDePagina ? "sí" : "NO"}`);
console.log(`  página maestra de portada . ${informe.portada.masterPagePortada ? "sí" : "NO"}`);
console.log(`  márgenes a cero ........... ${informe.portada.margenesACero ? "sí" : "NO"}`);

if (informe.hallazgos.length > 0) {
    console.log(`\n  == Hallazgos ==`);
    for (const h of informe.hallazgos) {
        console.log(`  ${h.nivel === "error" ? "✘" : "!"}  ${h.mensaje}`);
    }
}

console.log(
    informe.valida
        ? `\n  ✔ Válida.\n`
        : `\n  ✘ No válida: ${informe.hallazgos.filter((h) => h.nivel === "error").length} error(es).\n`
);

process.exit(informe.valida ? 0 : 1);