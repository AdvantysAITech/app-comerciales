import { existsSync, readFileSync } from "node:fs";
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

const ruta = process.argv[2];
if (!ruta) {
    console.error("\n  Uso: npm run plantilla:verificar -- <fichero.odt>\n");
    process.exit(1);
}

const buffer = leerOdt(ruta);
const informe = verificarPlantilla(buffer);

console.log(`\n  ${ruta}  (${Math.round(buffer.byteLength / 1024)} KB)`);

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

console.log(`\n  == Desglose ==`);
console.log(`  marcador presente ......... ${informe.desglose.marcadorPresente ? "sí" : "NO"}`);
console.log(`  marcador fragmentado ...... ${informe.desglose.marcadorFragmentado ? "SÍ" : "no"}`);

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