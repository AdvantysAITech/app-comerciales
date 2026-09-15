import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { zipSync } from "fflate";
import { calcularPresupuesto } from "../../lib/documentos/motor";
import { assertPortada, construirPortada } from "../../lib/documentos/portada";
import { renderizarPortada } from "../../lib/documentos/portada.svg";
import { rasterizarSvg } from "../../lib/documentos/rasterizar";
import { MARCADOR_PORTADA, postprocesarOdt } from "../../lib/documentos/odf";
import type { SubcuentaSlug } from "../../lib/subcuenta";

/**
 * scripts/tarifa/demo-portada-odt.ts
 *
 * Genera un ODT completo con la infografía dentro, para ABRIRLO y mirarlo.
 *
 * No es una prueba: las pruebas son `portada:probar` y `odf:probar`, que
 * comprueban XML y no dicen nada de cómo se ve el resultado. Esto es lo que
 * cierra ese hueco, y ya nos ha encontrado dos fallos que los checks no veían:
 * un bloque <office:automatic-styles> duplicado y el cuerpo del presupuesto
 * imprimiéndose encima de la portada.
 *
 * El ODT de partida se construye aquí, no se lee de disco. Es un sustituto de
 * la plantilla real mientras esa no exista, y de paso deja a la vista los tres
 * requisitos que la plantilla tendrá que cumplir:
 *
 *   1. un párrafo con el marcador [[PORTADA]] sin fragmentar;
 *   2. ese párrafo con un estilo que lleve fo:break-after="page";
 *   3. la página con márgenes a cero, o la portada no llega al borde.
 *
 * Uso:
 *   npm run portada:demo
 *   npm run portada:demo -- vertical-projects
 *   npm run portada:demo -- scala-valencia
 */

const SUBCUENTA = (process.argv[2] ?? "vertical-projects") as SubcuentaSlug;

// ---------------------------------------------------------------------------
// ODT de partida (sustituto de la plantilla)
// ---------------------------------------------------------------------------

const NS = [
    `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"`,
    `xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"`,
    `xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"`,
    `xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"`,
    `xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"`,
    `xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"`,
    `xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"`,
    `xmlns:xlink="http://www.w3.org/1999/xlink"`,
    `office:version="1.3"`,
].join(" ");

const ESTILOS =
    `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${NS}>` +
    `<office:automatic-styles><style:page-layout style:name="pm1">` +
    `<style:page-layout-properties fo:page-width="210mm" fo:page-height="297mm" ` +
    `style:print-orientation="portrait" fo:margin-top="0mm" fo:margin-bottom="0mm" ` +
    `fo:margin-left="0mm" fo:margin-right="0mm"/></style:page-layout>` +
    `</office:automatic-styles><office:master-styles>` +
    `<style:master-page style:name="Standard" style:page-layout-name="pm1"/>` +
    `</office:master-styles></office:document-styles>`;

const CONTENIDO =
    `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NS}>` +
    `<office:automatic-styles>` +
    // El salto de página va AQUÍ, en el estilo del párrafo del marcador.
    // `inyectarPortada` lo hereda al sustituir el párrafo. Sin él, el cuerpo se
    // imprime encima de la imagen: va anclada a página y con `run-through`, así
    // que no empuja el texto.
    `<style:style style:name="Portada" style:family="paragraph">` +
    `<style:paragraph-properties fo:break-after="page"/></style:style>` +
    `</office:automatic-styles>` +
    `<office:body><office:text>` +
    `<text:p text:style-name="Portada">${MARCADOR_PORTADA}</text:p>` +
    `<text:p>Aqui empezaria el cuerpo del presupuesto.</text:p>` +
    `<table:table><table:table-column table:number-columns-repeated="3"/>` +
    `<table:table-row>` +
    `<table:table-cell><text:p>CODIGO</text:p></table:table-cell>` +
    `<table:table-cell><text:p>RESUMEN</text:p></table:table-cell>` +
    `<table:table-cell><text:p>IMPORTE</text:p></table:table-cell>` +
    `</table:table-row><table:table-row>` +
    `<table:table-cell><text:p>1.01.01</text:p></table:table-cell>` +
    `<table:table-cell><text:p>Demolicion manual de aplacado</text:p></table:table-cell>` +
    `<table:table-cell><text:p>4.428,90</text:p></table:table-cell>` +
    `</table:table-row></table:table>` +
    `</office:text></office:body></office:document-content>`;

const MANIFIESTO =
    `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest ` +
    `xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">` +
    `<manifest:file-entry manifest:full-path="/" manifest:version="1.3" ` +
    `manifest:media-type="application/vnd.oasis.opendocument.text"/>` +
    `<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>` +
    `<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>` +
    `</manifest:manifest>`;

const cod = (s: string) => new TextEncoder().encode(s);

const zip = zipSync({
    mimetype: [cod("application/vnd.oasis.opendocument.text"), { level: 0 }],
    "content.xml": [cod(CONTENIDO), { level: 9 }],
    "styles.xml": [cod(ESTILOS), { level: 9 }],
    "META-INF/manifest.xml": [cod(MANIFIESTO), { level: 9 }],
});
const base = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;

// ---------------------------------------------------------------------------
// Presupuesto y portada
// ---------------------------------------------------------------------------

const presupuesto = calcularPresupuesto({
    lineas: [
        { codigo: "DEM015", cantidad: 54 },
        { codigo: "DEM001", cantidad: 190 },
        { codigo: "DEM017", cantidad: 950 },
        { codigo: "FAC010", cantidad: 74 },
        { codigo: "FAC007", cantidad: 74 },
        { codigo: "REV001", cantidad: 190 },
        { codigo: "IMP001", cantidad: 45 },
        { codigo: "AND002", cantidad: 950 },
        { codigo: "AND006", cantidad: 950 },
        { codigo: "CER001", cantidad: 6, unidadSeleccionada: "ud" },
        { codigo: "RCD001", cantidad: 6, unidadSeleccionada: "ud" },
        { codigo: "RCD004", cantidad: 36, unidadSeleccionada: "ud" },
    ],
});

const portada = construirPortada(presupuesto, {
    subcuenta: SUBCUENTA,
    titulo: "Rehabilitación de fachada y cubierta",
    comunidad: "Cdad. Prop. Carrar 5-7",
    localidad: "Gandía",
    expediente: SUBCUENTA === "scala-valencia" ? "SV-2026-0001" : "VP-2026-0001",
    fecha: "18/06/2026",
    administrador: "Ecofincas",
    administradorLocalidad: "Paterna",
    cronograma: [
        { etiqueta: "Días 1-5", diaInicio: 1, diaFin: 5 },
        { etiqueta: "Días 6-17", diaInicio: 6, diaFin: 17 },
        { etiqueta: "Días 18-21", diaInicio: 18, diaFin: 21 },
        { etiqueta: "Días 22-30", diaInicio: 22, diaFin: 30 },
        { etiqueta: "Días 31-35", diaInicio: 31, diaFin: 35 },
    ],
});

// Si la portada no cuadra con el motor, aquí revienta y no se genera nada.
assertPortada(portada, presupuesto);

const svg = renderizarPortada(portada);

// Mismo rasterizador que usa el pipeline: fuentes empaquetadas, sin heredar las
// del sistema. Lo que se ve aquí es lo que se verá desplegado.
const png = rasterizarSvg(svg);

const odt = postprocesarOdt(base, { portadaPng: new Uint8Array(png) });

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------

const salida = join(process.cwd(), "salida", "odf");
mkdirSync(salida, { recursive: true });

const nombre = `demo-${SUBCUENTA}`;
writeFileSync(join(salida, `${nombre}.odt`), Buffer.from(odt));
writeFileSync(join(salida, `${nombre}.png`), Buffer.from(png));
writeFileSync(join(salida, `${nombre}.svg`), svg, "utf8");

console.log(`\n  Subcuenta: ${SUBCUENTA}`);
console.log(`  PEM ${portada.pemFormateado}  ·  TOTAL ${portada.totalFormateado}`);
console.log(`  ${portada.capitulos.length} capítulos  ·  PNG ${Math.round(png.length / 1024)} KB`);
console.log(`\n  Generado en ${salida}`);
console.log(`    ${nombre}.odt   <- ábrelo`);
console.log(`    ${nombre}.png   <- solo la portada`);
console.log(`    ${nombre}.svg   <- el vector, para el navegador\n`);