import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync, zipSync } from "fflate";
import {
    MARCADOR_PORTADA,
    MarcadorPortadaAusenteError,
    RUTA_PORTADA,
    darEstiloATablas,
    declararEnManifiesto,
    eliminarMarcadorPortada,
    inyectarPortada,
    postprocesarOdt,
} from "../../lib/documentos/odf";

let fallos = 0;
function check(nombre: string, cond: boolean, detalle = "") {
    console.log(`${cond ? "  ok  " : "  FAIL"}  ${nombre}${detalle ? "  -> " + detalle : ""}`);
    if (!cond) fallos++;
}

const codificar = (s: string) => new TextEncoder().encode(s);
const decodificar = (b: Uint8Array) => new TextDecoder("utf-8").decode(b);

// ---------------------------------------------------------------------------
// ODT sintético
// ---------------------------------------------------------------------------
//
// Se construye aquí en vez de commitear un .odt de muestra: un binario de 3 MB
// en el repo es justo lo que estamos quitando de la rama, y además un fixture
// sintético deja a la vista qué estructura estamos asumiendo.

/**
 * Espacios de nombres del content.xml.
 *
 * Van TODOS aunque el fixture no use la mitad. Un ODT con prefijos sin declarar
 * es XML mal formado: LibreOffice suele tragarlo, pero el conversor de Google
 * Drive lo rechaza sin decir por qué. La primera version de este fixture solo
 * declaraba `office:` y el .odt resultante no se abria en Drive.
 */
const NAMESPACES = [
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

/**
 * styles.xml minimo pero VALIDO: pagina A4 con margenes a cero.
 *
 * Los margenes a cero son lo que permite que la portada llegue al borde. En la
 * plantilla real esto solo aplica a la primera pagina; aqui, al documento
 * entero, que para el fixture da igual.
 */
const ESTILOS =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<office:document-styles ${NAMESPACES}>` +
    `<office:automatic-styles>` +
    `<style:page-layout style:name="pm1"><style:page-layout-properties ` +
    `fo:page-width="210mm" fo:page-height="297mm" style:print-orientation="portrait" ` +
    `fo:margin-top="0mm" fo:margin-bottom="0mm" fo:margin-left="0mm" fo:margin-right="0mm"/>` +
    `</style:page-layout>` +
    `</office:automatic-styles>` +
    `<office:master-styles>` +
    `<style:master-page style:name="Standard" style:page-layout-name="pm1"/>` +
    `</office:master-styles>` +
    `</office:document-styles>`;

const MANIFIESTO =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">` +
    `<manifest:file-entry manifest:full-path="/" ` +
    `manifest:media-type="application/vnd.oasis.opendocument.text"/>` +
    `<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>` +
    `<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>` +
    `</manifest:manifest>`;

/** Tabla tal y como la emite la app: sin `table:style-name`, sin atributos. */
const TABLA_GENERADA =
    `<table:table>` +
    `<table:table-column table:number-columns-repeated="6"/>` +
    `<table:table-row><table:table-cell><text:p>CODIGO</text:p></table:table-cell></table:table-row>` +
    `</table:table>`;

/** Tabla de la plantilla: lleva nombre y estilo, no se debe tocar. */
const TABLA_PLANTILLA =
    `<table:table table:name="Cabecera" table:style-name="TablaCabecera">` +
    `<table:table-row><table:table-cell table:style-name="CeldaCabecera">` +
    `<text:p>Datos fiscales</text:p></table:table-cell></table:table-row>` +
    `</table:table>`;

function contenido(opciones: { marcador?: string } = {}): string {
    const marcador = opciones.marcador ?? `<text:p text:style-name="Portada">${MARCADOR_PORTADA}</text:p>`;
    return (
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<office:document-content ${NAMESPACES}>` +
        `<office:automatic-styles><style:style style:name="Existente"/>` +
        `<style:style style:name="Portada" style:family="paragraph">` +
        `<style:paragraph-properties fo:break-after="page"/></style:style>` +
        `</office:automatic-styles>` +
        `<office:body><office:text>` +
        marcador +
        `<text:p>Presupuesto de prueba</text:p>` +
        TABLA_PLANTILLA +
        TABLA_GENERADA +
        `</office:text></office:body></office:document-content>`
    );
}

function construirOdt(opciones: { marcador?: string; sinManifiesto?: boolean } = {}): ArrayBuffer {
    const entradas: Record<string, [Uint8Array, { level: 0 | 9 }]> = {
        mimetype: [codificar("application/vnd.oasis.opendocument.text"), { level: 0 }],
        "content.xml": [codificar(contenido(opciones)), { level: 9 }],
        "styles.xml": [codificar(ESTILOS), { level: 9 }],
    };
    if (!opciones.sinManifiesto) {
        entradas["META-INF/manifest.xml"] = [codificar(MANIFIESTO), { level: 9 }];
    }
    const zip = zipSync(entradas);
    return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
}

/** PNG 1x1 válido. Basta para comprobar el transporte de bytes. */
const PNG = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
]);

// ---------------------------------------------------------------------------
// Tablas (comportamiento previo, no debe haber regresión)
// ---------------------------------------------------------------------------
console.log("\n== Tablas ==");
const conEstilo = darEstiloATablas(contenido());
check("la tabla generada recibe estilo", conEstilo.includes('<table:table table:style-name="AITabla">'));
check("las celdas generadas reciben estilo", conEstilo.includes('<table:table-cell table:style-name="AICelda">'));
check("la columna recibe su ancho", conEstilo.includes('table:style-name="AICol6"'));
check(
    "la tabla de la plantilla queda intacta",
    conEstilo.includes('table:name="Cabecera" table:style-name="TablaCabecera"')
);
check(
    "la celda de la plantilla queda intacta",
    conEstilo.includes('<table:table-cell table:style-name="CeldaCabecera">')
);
check("se conserva el estilo que ya existía", conEstilo.includes('style:name="Existente"'));
check("sin tablas generadas no toca nada", darEstiloATablas("<x/>") === "<x/>");

// ---------------------------------------------------------------------------
// Marcador
// ---------------------------------------------------------------------------
console.log("\n== Marcador de portada ==");
const conPortada = inyectarPortada(contenido());
check("desaparece el marcador", !conPortada.includes(MARCADOR_PORTADA));
check("aparece el marco", conPortada.includes("<draw:frame"));
check("el marco apunta a la imagen", conPortada.includes(`xlink:href="${RUTA_PORTADA}"`));
check("el marco va a página completa", conPortada.includes('svg:width="210mm"') && conPortada.includes('svg:height="297mm"'));
check("anclado a página, no a párrafo", conPortada.includes('text:anchor-type="page"'));
check("se declara el estilo del marco", conPortada.includes('style:name="AIPortadaMarco"'));
check(
    "no queda el marcador dentro de un párrafo de texto",
    !conPortada.includes(`>${MARCADOR_PORTADA}<`)
);
check(
    "el párrafo de reemplazo hereda el estilo del original",
    conPortada.includes('<text:p text:style-name="Portada"><draw:frame')
);
check(
    "sin estilo en el original, el párrafo va sin estilo",
    inyectarPortada(contenido({ marcador: `<text:p>${MARCADOR_PORTADA}</text:p>` })).includes(
        "<text:p><draw:frame"
    )
);
check("el resto del documento sigue ahí", conPortada.includes("Presupuesto de prueba"));

const sinMarcador = contenido({ marcador: "" });
let lanzo = false;
try {
    inyectarPortada(sinMarcador);
} catch (e) {
    lanzo = e instanceof MarcadorPortadaAusenteError;
}
check("sin marcador lanza el error específico", lanzo);

// Marcador partido entre spans: lo que hace LibreOffice al reguardar.
const fragmentado = contenido({
    marcador: `<text:p><text:span>[[POR</text:span><text:span>TADA]]</text:span></text:p>`,
});
let lanzoFragmentado = false;
try {
    inyectarPortada(fragmentado);
} catch (e) {
    lanzoFragmentado = e instanceof MarcadorPortadaAusenteError;
}
check("marcador fragmentado se detecta y lanza", lanzoFragmentado);

console.log("\n== Degradación sin portada ==");
const sinPortada = eliminarMarcadorPortada(contenido());
check("el marcador se elimina", !sinPortada.includes(MARCADOR_PORTADA));
check("no queda ningún marco", !sinPortada.includes("<draw:frame"));
check("el resto del documento sigue ahí", sinPortada.includes("Presupuesto de prueba"));
check("sin marcador es una operación inocua", eliminarMarcadorPortada("<x/>") === "<x/>");

// ---------------------------------------------------------------------------
// Manifiesto
// ---------------------------------------------------------------------------
console.log("\n== Manifiesto ==");
const manifiesto = declararEnManifiesto(MANIFIESTO);
check("se declara la imagen", manifiesto.includes(`manifest:full-path="${RUTA_PORTADA}"`));
check("con el media-type correcto", manifiesto.includes('manifest:media-type="image/png"'));
check("no se duplica al repetir", declararEnManifiesto(manifiesto) === manifiesto);
check("se conservan las entradas previas", manifiesto.includes('manifest:full-path="content.xml"'));

let manifiestoRoto = false;
try {
    declararEnManifiesto("<manifest:manifest>");
} catch {
    manifiestoRoto = true;
}
check("un manifiesto sin cierre se rechaza", manifiestoRoto);

// ---------------------------------------------------------------------------
// Paquete completo
// ---------------------------------------------------------------------------
console.log("\n== Paquete con portada ==");
const conImagen = postprocesarOdt(construirOdt(), { portadaPng: PNG });
const entradas = unzipSync(new Uint8Array(conImagen));

check("el PNG está dentro", Boolean(entradas[RUTA_PORTADA]));
check(
    "los bytes del PNG llegan intactos",
    Boolean(entradas[RUTA_PORTADA]) &&
        Buffer.from(entradas[RUTA_PORTADA]).equals(Buffer.from(PNG)),
    `${entradas[RUTA_PORTADA]?.length ?? 0} bytes`
);
check("el manifiesto lo declara", decodificar(entradas["META-INF/manifest.xml"]).includes(RUTA_PORTADA));
check("el content lleva el marco", decodificar(entradas["content.xml"]).includes("<draw:frame"));
check("las tablas siguen estiladas", decodificar(entradas["content.xml"]).includes('table:style-name="AITabla"'));
check("styles.xml se conserva", Boolean(entradas["styles.xml"]));
check(
    "el content declara todos los espacios de nombres que usa",
    ["office", "text", "table", "draw", "svg", "xlink", "style", "fo"].every((ns) =>
        decodificar(entradas["content.xml"]).includes(`xmlns:${ns}=`)
    )
);

// El mimetype tiene que ser la PRIMERA entrada y estar SIN COMPRIMIR. Se lee
// la cabecera local del ZIP en crudo: metodo de compresion en el byte 8,
// nombre de fichero a partir del 30.
const crudo = new Uint8Array(conImagen);
const metodo = crudo[8] | (crudo[9] << 8);
const primerNombre = decodificar(crudo.slice(30, 38));
check("mimetype es la primera entrada", primerNombre === "mimetype", primerNombre);
check("mimetype va sin comprimir", metodo === 0, `metodo=${metodo}`);

console.log("\n== Paquete sin portada ==");
const sinImagen = postprocesarOdt(construirOdt());
const entradasSin = unzipSync(new Uint8Array(sinImagen));
check("no se añade imagen", !entradasSin[RUTA_PORTADA]);
check("el marcador no se imprime", !decodificar(entradasSin["content.xml"]).includes(MARCADOR_PORTADA));
check("no hay marco huérfano", !decodificar(entradasSin["content.xml"]).includes("<draw:frame"));
check(
    "el manifiesto no declara nada de más",
    !decodificar(entradasSin["META-INF/manifest.xml"]).includes(RUTA_PORTADA)
);
check("las tablas siguen estiladas", decodificar(entradasSin["content.xml"]).includes('table:style-name="AITabla"'));

console.log("\n== Entradas inválidas ==");
function revienta(fn: () => unknown): boolean {
    try {
        fn();
        return false;
    } catch {
        return true;
    }
}
check(
    "ODT sin manifiesto y con portada se rechaza",
    revienta(() => postprocesarOdt(construirOdt({ sinManifiesto: true }), { portadaPng: PNG }))
);
check(
    "ODT sin marcador y con portada se rechaza",
    revienta(() => postprocesarOdt(construirOdt({ marcador: "" }), { portadaPng: PNG }))
);
check(
    "un PNG vacío degrada, no revienta",
    !revienta(() => postprocesarOdt(construirOdt(), { portadaPng: new Uint8Array(0) }))
);

const salida = join(process.cwd(), "salida", "odf");
mkdirSync(salida, { recursive: true });
writeFileSync(join(salida, "sintetico-con-portada.odt"), Buffer.from(conImagen));
writeFileSync(join(salida, "sintetico-sin-portada.odt"), Buffer.from(sinImagen));
console.log(`\n  ODT de muestra en ${salida}`);

console.log(fallos === 0 ? "\n✔ Todos los checks pasan.\n" : `\n✘ ${fallos} fallo(s).\n`);
process.exit(fallos === 0 ? 0 : 1);