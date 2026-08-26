import { unzipSync, zipSync } from "fflate";

/**
 * Post-proceso del ODT devuelto por la app de documentos.
 *
 * La app convierte las tablas Markdown a <table:table> ODF real, pero las emite
 * SIN estilo alguno: ni `table:style-name` en la tabla ni en las celdas. Lo
 * único que aplica son dos estilos de PÁRRAFO (`AI-TableHeader`, `AI-TableCell`)
 * que llevan fondo y padding pero ningún `fo:border`. Resultado: tablas sin
 * líneas, que en un presupuesto que se envía a un administrador de fincas no
 * pasa el corte.
 *
 * Este módulo abre el ODT, inyecta los estilos que faltan y lo vuelve a
 * empaquetar. NO reconstruye contenido ni sustituye markerkeys: eso lo hace la
 * app y funciona. Aquí solo se añade presentación.
 *
 * Distinguir las tablas generadas de las de la plantilla es trivial y robusto:
 * las de la plantilla llevan `table:name` y `table:style-name`, las generadas
 * son `<table:table>` pelado. Solo se tocan las segundas, así que la maqueta
 * original queda intacta.
 *
 * Si algún día el conversor de la app añade bordes por su cuenta, este módulo
 * deja de hacer falta y se retira: es un parche sobre una carencia ajena, no
 * una pieza del diseño.
 */

/** Ancho útil de la caja de texto de la plantilla. */
const ANCHO_TABLA_PULGADAS = 6.5;

const BORDE = "0.5pt solid #b8b8b8";

function estilosDe(numerosDeColumnas: readonly number[]): string {
    const columnas = numerosDeColumnas
        .map((n) => {
            const ancho = (ANCHO_TABLA_PULGADAS / n).toFixed(4);
            return (
                `<style:style style:name="AICol${n}" style:family="table-column">` +
                `<style:table-column-properties style:column-width="${ancho}in"/></style:style>`
            );
        })
        .join("");

    return (
        `<style:style style:name="AITabla" style:family="table">` +
        `<style:table-properties style:width="${ANCHO_TABLA_PULGADAS}in" table:align="left" ` +
        `fo:margin-top="0.08in" fo:margin-bottom="0.08in"/></style:style>` +
        `<style:style style:name="AICelda" style:family="table-cell">` +
        `<style:table-cell-properties fo:border="${BORDE}" fo:padding="0.04in"/></style:style>` +
        columnas
    );
}

/** Aplica los estilos al content.xml. Exportada para poder probarla suelta. */
export function darEstiloATablas(contentXml: string): string {
    // Solo las generadas: `<table:table>` sin atributos.
    if (!contentXml.includes("<table:table>")) return contentXml;

    const columnas = [
        ...new Set(
            [...contentXml.matchAll(/<table:table-column table:number-columns-repeated="(\d+)"\/>/g)].map(
                (m) => Number(m[1])
            )
        ),
    ];

    let salida = contentXml.replace(
        "<office:automatic-styles>",
        `<office:automatic-styles>${estilosDe(columnas)}`
    );

    salida = salida.replaceAll("<table:table>", '<table:table table:style-name="AITabla">');
    salida = salida.replaceAll("<table:table-cell>", '<table:table-cell table:style-name="AICelda">');

    for (const n of columnas) {
        salida = salida.replaceAll(
            `<table:table-column table:number-columns-repeated="${n}"/>`,
            `<table:table-column table:style-name="AICol${n}" table:number-columns-repeated="${n}"/>`
        );
    }

    return salida;
}

/**
 * Reempaqueta el ODT con las tablas ya estilizadas.
 *
 * `mimetype` DEBE ser la primera entrada del ZIP y estar SIN COMPRIMIR: es como
 * los lectores de ODF identifican el formato. Un ZIP correcto pero con el
 * mimetype comprimido o en otra posición se abre mal o directamente no se
 * reconoce como documento.
 */
export function postprocesarOdt(odt: ArrayBuffer): ArrayBuffer {
    const entradas = unzipSync(new Uint8Array(odt));

    const content = entradas["content.xml"];
    if (!content) throw new Error("El ODT no contiene content.xml: no es un documento válido.");

    const decodificador = new TextDecoder("utf-8");
    const codificador = new TextEncoder();

    entradas["content.xml"] = codificador.encode(darEstiloATablas(decodificador.decode(content)));

    const mimetype = entradas["mimetype"];
    if (!mimetype) throw new Error("El ODT no contiene mimetype.");

    // fflate respeta el orden de inserción, así que mimetype va primero y con
    // level 0 (STORED). El resto, comprimido.
    const salida: Record<string, [Uint8Array, { level: 0 | 9 }]> = {
        mimetype: [mimetype, { level: 0 }],
    };
    for (const [nombre, datos] of Object.entries(entradas)) {
        if (nombre === "mimetype") continue;
        salida[nombre] = [datos, { level: 9 }];
    }

    const zip = zipSync(salida);
    return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
}