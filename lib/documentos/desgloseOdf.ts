import { formatearCantidad, formatearImporte, type PresupuestoCalculado } from "./motor";

/**
 * lib/documentos/desgloseOdf.ts
 *
 * Desglose de partidas por capítulo, como tablas ODF nativas.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ SALE DE SOLUCIONA
 * ---------------------------------------------------------------------------
 * La app impone un tope de 4000 caracteres por campo del JSON. El desglose
 * ocupa unos 100 caracteres por partida, así que se agota en 36: un
 * presupuesto de tamaño normal ya no cabe y la generación termina en estado 5.
 *
 * Recortarlo no es opción -- son las partidas del presupuesto -- y trocearlo en
 * varios markerkeys solo aplaza el problema. Se construye aquí y se inyecta en
 * el ODT, igual que la portada.
 *
 * Se gana además el control del formato. Hasta ahora las tablas las componía su
 * conversor de Markdown, del que llevamos descubiertos tres comportamientos
 * incómodos: celdas que salen vacías si llevan negrita, tablas sin bordes, y la
 * barra de cierre obligatoria. Con ODF nativo hay bordes de verdad, anchos de
 * columna fijos y cabecera que se repite al saltar de página.
 *
 * Es el mismo movimiento que ya hicimos al quitarle el desglose a la IA:
 * acercar el dato crítico a donde lo controlamos.
 */

const PREFIJO = "AID";

/** Anchos en pulgadas. Suman el ancho útil de la caja de texto de la plantilla. */
const COLUMNAS: ReadonlyArray<{ nombre: string; ancho: number; numerica: boolean }> = [
    { nombre: "CÓDIGO", ancho: 0.85, numerica: false },
    { nombre: "RESUMEN", ancho: 2.55, numerica: false },
    { nombre: "UD", ancho: 0.4, numerica: false },
    { nombre: "CANT.", ancho: 0.7, numerica: true },
    { nombre: "PRECIO", ancho: 0.9, numerica: true },
    { nombre: "IMPORTE", ancho: 1.1, numerica: true },
];

const BORDE = "0.5pt solid #b8b8b8";
const FONDO_CABECERA = "#eeeeee";
const FONDO_TOTAL = "#f6f6f6";

function esc(texto: string): string {
    return texto
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

/**
 * Estilos automáticos del desglose.
 *
 * Todos llevan el prefijo `AID` para no chocar con los de la plantilla ni con
 * los `AITabla` / `AICelda` que ya inyectamos para las tablas de la app.
 */
export function estilosDesglose(): string {
    const anchoTotal = COLUMNAS.reduce((a, c) => a + c.ancho, 0);

    const columnas = COLUMNAS.map(
        (c, i) =>
            `<style:style style:name="${PREFIJO}Col${i}" style:family="table-column">` +
            `<style:table-column-properties style:column-width="${c.ancho.toFixed(4)}in"/></style:style>`
    ).join("");

    const celda = (nombre: string, fondo?: string) =>
        `<style:style style:name="${PREFIJO}${nombre}" style:family="table-cell">` +
        `<style:table-cell-properties fo:border="${BORDE}" fo:padding="0.04in"` +
        (fondo ? ` fo:background-color="${fondo}"` : "") +
        `/></style:style>`;

    const parrafo = (nombre: string, alineacion: string, negrita: boolean, tamano = "8pt") =>
        `<style:style style:name="${PREFIJO}${nombre}" style:family="paragraph">` +
        `<style:paragraph-properties fo:text-align="${alineacion}" fo:margin="0in"/>` +
        `<style:text-properties fo:font-size="${tamano}"` +
        (negrita ? ` fo:font-weight="bold"` : "") +
        `/></style:style>`;

    return (
        // `may-break-between-rows="false"`: una fila no se parte por la mitad
        // entre dos páginas. Con descripciones largas pasaba.
        `<style:style style:name="${PREFIJO}Tabla" style:family="table">` +
        `<style:table-properties style:width="${anchoTotal.toFixed(4)}in" table:align="left" ` +
        `fo:margin-top="0.05in" fo:margin-bottom="0.12in" ` +
        `style:may-break-between-rows="false"/></style:style>` +
        columnas +
        celda("CabCelda", FONDO_CABECERA) +
        celda("Celda") +
        celda("TotalCelda", FONDO_TOTAL) +
        parrafo("Cab", "start", true) +
        parrafo("CabNum", "end", true) +
        parrafo("Txt", "start", false) +
        parrafo("Num", "end", false) +
        parrafo("TotalTxt", "start", true) +
        parrafo("TotalNum", "end", true) +
        `<style:style style:name="${PREFIJO}Capitulo" style:family="paragraph">` +
        `<style:paragraph-properties fo:margin-top="0.14in" fo:margin-bottom="0.04in" ` +
        `fo:keep-with-next="always"/>` +
        `<style:text-properties fo:font-size="10pt" fo:font-weight="bold"/></style:style>`
    );
}

// ---------------------------------------------------------------------------
// Tablas
// ---------------------------------------------------------------------------

function celdaXml(texto: string, estiloCelda: string, estiloParrafo: string): string {
    return (
        `<table:table-cell table:style-name="${PREFIJO}${estiloCelda}" office:value-type="string">` +
        `<text:p text:style-name="${PREFIJO}${estiloParrafo}">${esc(texto)}</text:p>` +
        `</table:table-cell>`
    );
}

function filaXml(
    valores: readonly string[],
    estiloCelda: string,
    estiloTexto: string,
    estiloNumero: string
): string {
    const celdas = valores
        .map((v, i) => celdaXml(v, estiloCelda, COLUMNAS[i].numerica ? estiloNumero : estiloTexto))
        .join("");
    return `<table:table-row>${celdas}</table:table-row>`;
}

function tablaCapitulo(cap: PresupuestoCalculado["capitulos"][number], indice: number): string {
    const columnas = COLUMNAS.map(
        (_, i) => `<table:table-column table:style-name="${PREFIJO}Col${i}"/>`
    ).join("");

    // `table:table-header-rows` hace que la cabecera se repita en cada página.
    // Es lo que su conversor de Markdown no podía darnos: en un desglose de tres
    // páginas, las dos últimas salían sin encabezado de columnas.
    const cabecera =
        `<table:table-header-rows>` +
        filaXml(
            COLUMNAS.map((c) => c.nombre),
            "CabCelda",
            "Cab",
            "CabNum"
        ) +
        `</table:table-header-rows>`;

    const lineas = cap.lineas
        .map((l) =>
            filaXml(
                [
                    l.codigoJerarquico,
                    l.descripcionLarga ? `${l.resumen}. ${l.descripcionLarga}` : l.resumen,
                    l.unidad,
                    formatearCantidad(l.cantidad),
                    formatearImporte(l.precioUnitario),
                    formatearImporte(l.importe),
                ],
                "Celda",
                "Txt",
                "Num"
            )
        )
        .join("");

    const total = filaXml(
        ["", `TOTAL ${cap.codigoJerarquico}`, "", "", "", formatearImporte(cap.total)],
        "TotalCelda",
        "TotalTxt",
        "TotalNum"
    );

    return (
        `<text:p text:style-name="${PREFIJO}Capitulo">` +
        `${esc(cap.codigoJerarquico)}  ${esc(cap.nombre)}</text:p>` +
        `<table:table table:name="Desglose${indice + 1}" table:style-name="${PREFIJO}Tabla">` +
        columnas +
        cabecera +
        lineas +
        total +
        `</table:table>`
    );
}

/**
 * XML del desglose completo: una tabla por capítulo, en el orden del catálogo.
 *
 * Devuelve cadena vacía si no hay capítulos, para que quien llame decida qué
 * hacer en lugar de insertar un bloque vacío.
 */
export function desgloseXml(presupuesto: PresupuestoCalculado): string {
    if (presupuesto.capitulos.length === 0) return "";
    return presupuesto.capitulos.map(tablaCapitulo).join("");
}