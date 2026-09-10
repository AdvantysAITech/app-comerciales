import { unzipSync, zipSync } from "fflate";
import { MARCADOR_DESGLOSE, MARCADOR_PORTADA } from "./odf";

/**
 * lib/documentos/plantillaPortada.ts
 *
 * Añade la página de portada a una plantilla ODT sin abrirla en un editor.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ UN SCRIPT Y NO LIBREOFFICE
 * ---------------------------------------------------------------------------
 * Abrir el .odt y volver a guardarlo fragmenta los tokens `{{...}}` entre
 * varios <text:span>. La sustitución falla EN SILENCIO: el campo sale en blanco
 * y nadie se entera hasta que el administrador tiene el presupuesto delante. Ya
 * pasó con {{doc.FechaEmision}}, que llegó partido en tres runs.
 *
 * El riesgo no es solo el marcador nuevo: son los markerkeys que HOY funcionan
 * y que ese guardado puede romper. Por eso se toca el ZIP directamente, que es
 * la misma operación que ya hace `odf.ts` sobre el documento generado.
 *
 * ---------------------------------------------------------------------------
 * QUÉ AÑADE
 * ---------------------------------------------------------------------------
 *  styles.xml   page-layout "pmPortada": A4 con los cuatro márgenes a cero.
 *               master-page "Portada", que encadena a "Standard".
 *  content.xml  estilo de párrafo "AIPortada", con master-page-name y salto
 *               de página, y un párrafo con el marcador al inicio del cuerpo.
 *
 * Los márgenes a cero son lo que permite que la infografía llegue al borde. Y
 * el salto es imprescindible: la imagen va anclada a página con `run-through`,
 * así que no empuja el texto y el cuerpo se imprimiría encima.
 */

export const ESTILO_PARRAFO_PORTADA = "AIPortada";
export const MASTER_PAGE_PORTADA = "Portada";
const PAGE_LAYOUT_PORTADA = "pmPortada";

const NS_STYLE = "urn:oasis:names:tc:opendocument:xmlns:style:1.0";

// ---------------------------------------------------------------------------
// Fragmentos
// ---------------------------------------------------------------------------

const PAGE_LAYOUT =
    `<style:page-layout style:name="${PAGE_LAYOUT_PORTADA}">` +
    `<style:page-layout-properties fo:page-width="210mm" fo:page-height="297mm" ` +
    `style:print-orientation="portrait" fo:margin-top="0mm" fo:margin-bottom="0mm" ` +
    `fo:margin-left="0mm" fo:margin-right="0mm" style:writing-mode="lr-tb"/>` +
    `</style:page-layout>`;

/**
 * `style:next-style-name` devuelve el documento a la página normal en cuanto
 * termina la portada. Sin él, TODO el presupuesto heredaría los márgenes a
 * cero y el cuerpo saldría pegado al borde del papel.
 */
const MASTER_PAGE =
    `<style:master-page style:name="${MASTER_PAGE_PORTADA}" ` +
    `style:page-layout-name="${PAGE_LAYOUT_PORTADA}" style:next-style-name="Standard"/>`;

/**
 * `style:master-page-name` fuerza el salto ANTES y cambia de página maestra;
 * `fo:break-after` cierra la portada para que el cuerpo empiece en la
 * siguiente. Hacen falta los dos: con solo el primero, el cuerpo continuaría
 * dentro de la propia página de portada.
 */
const ESTILO_PARRAFO =
    `<style:style style:name="${ESTILO_PARRAFO_PORTADA}" style:family="paragraph" ` +
    `style:master-page-name="${MASTER_PAGE_PORTADA}">` +
    `<style:paragraph-properties fo:break-after="page" fo:margin="0mm" ` +
    `style:line-height-at-least="0mm"/></style:style>`;

const PARRAFO_MARCADOR =
    `<text:p text:style-name="${ESTILO_PARRAFO_PORTADA}">${MARCADOR_PORTADA}</text:p>`;

/**
 * Markerkey que ocupaba el desglose antes de salir del JSON.
 *
 * Se sustituye por el marcador, conservando el párrafo y su estilo: así el
 * desglose aterriza EXACTAMENTE donde la plantilla lo tenía colocado, sin que
 * nadie tenga que reposicionar nada a mano.
 */
const MARKERKEY_DESGLOSE = "{{presup.DesgloseCapitulos}}";

/**
 * Markerkey retirado: repetía PEM, IVA y TOTAL justo encima del bloque que la
 * plantilla ya maqueta con esas mismas cifras. Se elimina su párrafo entero.
 */
const MARKERKEY_RETIRADO = "{{presup.ResumenPresupuesto}}";

/** Borra el párrafo que contiene un texto, o devuelve el XML sin tocar. */
function eliminarParrafoQueContiene(xml: string, texto: string): string | null {
    const pos = xml.indexOf(texto);
    if (pos === -1) return null;

    const inicio = xml.lastIndexOf("<text:p", pos);
    const cierre = xml.indexOf("</text:p>", pos);
    if (inicio === -1 || cierre === -1) return null;

    return xml.slice(0, inicio) + xml.slice(cierre + "</text:p>".length);
}

// ---------------------------------------------------------------------------
// Utilidades de XML
// ---------------------------------------------------------------------------

/**
 * Elementos que, si existen, van OBLIGATORIAMENTE al principio de
 * <office:text> y por delante de cualquier párrafo.
 *
 * Meter nuestro párrafo antes que ellos produce un documento que incumple el
 * esquema ODF. LibreOffice suele recuperarse; el conversor de la app y el de
 * Drive, no.
 */
const DECLARACIONES_INICIALES = [
    "text:tracked-changes",
    "text:variable-decls",
    "text:sequence-decls",
    "text:user-field-decls",
    "text:dde-connection-decls",
    "text:alphabetical-index-auto-mark-file",
    "office:forms",
];

/**
 * Inserta contenido al principio de un elemento.
 *
 * Hay tres formas del mismo elemento que contemplar, y las tres aparecen en
 * plantillas reales:
 *
 *   <office:text>                                   apertura simple
 *   <office:text text:use-soft-page-breaks="true">  con atributos
 *   <office:automatic-styles/>                      vacío autocerrado
 *
 * La primera versión buscaba solo la forma literal. Con la plantilla real de
 * Scala, cuyo <office:text> lleva atributos, no encontraba nada y abortaba con
 * "no es un documento de texto", que además era un diagnóstico falso.
 *
 * En el caso autocerrado no vale con añadir otro bloque al lado: dos
 * <office:automatic-styles> incumplen el esquema, LibreOffice ignora el segundo
 * y los estilos se pierden sin dar error.
 */
function insertarEn(xml: string, elemento: string, contenido: string): string {
    const autocerrado = new RegExp(`<${elemento}((?:\\s[^>]*)?)/>`);
    const mAuto = autocerrado.exec(xml);
    if (mAuto) {
        return xml.replace(mAuto[0], `<${elemento}${mAuto[1]}>${contenido}</${elemento}>`);
    }

    const apertura = new RegExp(`<${elemento}(?:\\s[^>]*)?>`);
    const mApertura = apertura.exec(xml);
    if (!mApertura) return "";

    let posicion = mApertura.index + mApertura[0].length;

    // Salta las declaraciones que tienen que preceder al contenido.
    let avanzando = true;
    while (avanzando) {
        avanzando = false;
        const resto = xml.slice(posicion);

        for (const decl of DECLARACIONES_INICIALES) {
            const vacio = new RegExp(`^\\s*<${decl}(?:\\s[^>]*)?/>`).exec(resto);
            if (vacio) {
                posicion += vacio[0].length;
                avanzando = true;
                break;
            }

            const abierto = new RegExp(`^\\s*<${decl}(?:\\s[^>]*)?>`).exec(resto);
            if (abierto) {
                const cierre = xml.indexOf(`</${decl}>`, posicion);
                if (cierre === -1) continue;
                posicion = cierre + `</${decl}>`.length;
                avanzando = true;
                break;
            }
        }
    }

    return xml.slice(0, posicion) + contenido + xml.slice(posicion);
}

/** Declara el prefijo `style:` si el documento no lo trae. */
function asegurarNamespaceStyle(xml: string, raiz: string): string {
    if (xml.includes(`xmlns:style=`)) return xml;
    return xml.replace(`<${raiz}`, `<${raiz} xmlns:style="${NS_STYLE}"`);
}

// ---------------------------------------------------------------------------
// Preparación
// ---------------------------------------------------------------------------

export type ResultadoPreparacion = {
    odt: ArrayBuffer;
    /** Cambios aplicados, para el registro del script. */
    cambios: string[];
    /** Lo que ya estaba y no se ha vuelto a añadir. */
    omitidos: string[];
    /** Markerkeys partidos que se han vuelto a unir. */
    reparados: string[];
    /** Partidos por algo que no es formato en línea. Requieren intervención. */
    irreparables: string[];
};

/**
 * Devuelve la plantilla con la página de portada añadida.
 *
 * Es idempotente: pasarla dos veces no duplica nada. Importa porque la
 * plantilla se va a regenerar cada vez que Miguel cambie el logo o los datos
 * fiscales, y nadie va a llevar la cuenta de si esa copia ya estaba preparada.
 */
export function prepararPlantilla(odt: ArrayBuffer): ResultadoPreparacion {
    const entradas = unzipSync(new Uint8Array(odt));
    const cambios: string[] = [];
    const omitidos: string[] = [];
    const reparados: string[] = [];
    const irreparables: string[] = [];

    const decodificar = (b: Uint8Array) => new TextDecoder("utf-8").decode(b);
    const codificar = (s: string) => new TextEncoder().encode(s);

    if (!entradas["content.xml"]) {
        throw new Error("El fichero no contiene content.xml: no es un ODT válido.");
    }
    if (!entradas["styles.xml"]) {
        throw new Error(
            "El fichero no contiene styles.xml. La página de portada necesita una página " +
                "maestra, y las maestras viven ahí."
        );
    }

    // --- styles.xml -------------------------------------------------------
    let styles = asegurarNamespaceStyle(decodificar(entradas["styles.xml"]), "office:document-styles");

    // La reparación va ANTES de añadir nada. Un markerkey partido sale vacío en
    // silencio, así que arreglarlo importa más que la portada. Los encabezados y
    // pies viven aquí, en las páginas maestras: es donde más se parten, porque
    // son lo que más se retoca a mano.
    {
        const r = repararMarkerkeys(styles);
        styles = r.xml;
        reparados.push(...r.reparados.map((t) => `{{${t}}} en styles.xml`));
        irreparables.push(...r.irreparables.map((t) => `{{${t}}} en styles.xml`));
    }

    if (styles.includes(`style:name="${PAGE_LAYOUT_PORTADA}"`)) {
        omitidos.push(`page-layout "${PAGE_LAYOUT_PORTADA}" ya existía`);
    } else {
        const conLayout = insertarEn(styles, "office:automatic-styles", PAGE_LAYOUT);
        if (!conLayout) {
            throw new Error(
                "styles.xml no tiene <office:automatic-styles>. La plantilla está incompleta " +
                    "o no es un documento de texto ODF."
            );
        }
        styles = conLayout;
        cambios.push(`page-layout "${PAGE_LAYOUT_PORTADA}" (A4, márgenes a cero)`);
    }

    if (styles.includes(`style:name="${MASTER_PAGE_PORTADA}"`)) {
        omitidos.push(`master-page "${MASTER_PAGE_PORTADA}" ya existía`);
    } else {
        const conMaster = insertarEn(styles, "office:master-styles", MASTER_PAGE);
        if (!conMaster) {
            throw new Error("styles.xml no tiene <office:master-styles>: no hay página maestra donde anclar.");
        }
        styles = conMaster;
        cambios.push(`master-page "${MASTER_PAGE_PORTADA}" -> Standard`);
    }

    entradas["styles.xml"] = codificar(styles);

    // --- content.xml ------------------------------------------------------
    let content = asegurarNamespaceStyle(decodificar(entradas["content.xml"]), "office:document-content");

    {
        const r = repararMarkerkeys(content);
        content = r.xml;
        reparados.push(...r.reparados.map((t) => `{{${t}}} en content.xml`));
        irreparables.push(...r.irreparables.map((t) => `{{${t}}} en content.xml`));
    }

    if (content.includes(`style:name="${ESTILO_PARRAFO_PORTADA}"`)) {
        omitidos.push(`estilo de párrafo "${ESTILO_PARRAFO_PORTADA}" ya existía`);
    } else {
        const conEstilo = insertarEn(content, "office:automatic-styles", ESTILO_PARRAFO);
        if (!conEstilo) {
            throw new Error("content.xml no tiene <office:automatic-styles>: la plantilla está corrupta.");
        }
        content = conEstilo;
        cambios.push(`estilo de párrafo "${ESTILO_PARRAFO_PORTADA}" (salto de página + maestra)`);
    }

    if (content.includes(MARCADOR_PORTADA)) {
        omitidos.push(`marcador ${MARCADOR_PORTADA} ya existía`);
    } else {
        const conMarcador = insertarEn(content, "office:text", PARRAFO_MARCADOR);
        if (!conMarcador) {
            throw new Error("content.xml no tiene <office:text>: no es un documento de texto.");
        }
        content = conMarcador;
        cambios.push(`párrafo con ${MARCADOR_PORTADA} al inicio del cuerpo`);
    }

    if (content.includes(MARCADOR_DESGLOSE)) {
        omitidos.push(`marcador ${MARCADOR_DESGLOSE} ya existía`);
    } else if (content.includes(MARKERKEY_DESGLOSE)) {
        content = content.replace(MARKERKEY_DESGLOSE, MARCADOR_DESGLOSE);
        cambios.push(`${MARKERKEY_DESGLOSE} -> ${MARCADOR_DESGLOSE} (sale del JSON: tope de 4000 car.)`);
    } else {
        irreparables.push(
            `no se encuentra ${MARKERKEY_DESGLOSE} ni ${MARCADOR_DESGLOSE}: el documento saldrá ` +
                `SIN desglose de partidas`
        );
    }

    const sinRetirado = eliminarParrafoQueContiene(content, MARKERKEY_RETIRADO);
    if (sinRetirado) {
        content = sinRetirado;
        cambios.push(`${MARKERKEY_RETIRADO} eliminado (duplicaba el bloque de totales)`);
    } else {
        omitidos.push(`${MARKERKEY_RETIRADO} no estaba`);
    }

    entradas["content.xml"] = codificar(content);

    // --- Reempaquetado ----------------------------------------------------
    const mimetype = entradas["mimetype"];
    if (!mimetype) throw new Error("El ODT no contiene mimetype.");

    const salida: Record<string, [Uint8Array, { level: 0 | 9 }]> = {
        mimetype: [mimetype, { level: 0 }],
    };
    for (const [nombre, datos] of Object.entries(entradas)) {
        if (nombre === "mimetype") continue;
        // Las imágenes ya vienen comprimidas; volver a pasarlas por deflate solo
        // gasta tiempo.
        const nivel: 0 | 9 = nombre.startsWith("Pictures/") || nombre.startsWith("Thumbnails/") ? 0 : 9;
        salida[nombre] = [datos, { level: nivel }];
    }

    const zip = zipSync(salida);
    return {
        odt: zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer,
        cambios,
        omitidos,
        reparados,
        irreparables,
    };
}

// ---------------------------------------------------------------------------
// Reparación de markerkeys fragmentados
// ---------------------------------------------------------------------------

/**
 * Etiquetas en línea que un editor mete DENTRO de un token al reguardar.
 *
 * Solo se eliminan estas. Si dentro de un `{{...}}` aparece cualquier otra
 * cosa -- un cierre de párrafo, una tabla, un marco -- no es un token partido
 * por formato sino algo estructuralmente distinto, y tocarlo rompería el
 * documento. Ese caso se reporta y no se toca.
 */
const ETIQUETAS_EN_LINEA = /^<\/?(text:span|text:s|text:tab|text:soft-page-break|text:bookmark[^\s>]*)[\s/>]/;

export type ResultadoReparacion = {
    xml: string;
    /** Tokens que estaban partidos y han quedado enteros. */
    reparados: string[];
    /** Partidos por algo que no es formato en línea. No se han tocado. */
    irreparables: string[];
};

/**
 * Vuelve a unir los markerkeys partidos entre etiquetas.
 *
 * Al guardar en LibreOffice o Word, `{{doc.NRef}}` puede quedar como
 * `{{doc.N</text:span><text:span ...>Ref}}`. El literal deja de existir, la
 * sustitución no encuentra nada y el campo sale en blanco SIN ERROR.
 *
 * Se eliminan las etiquetas que caen DENTRO del token, no las de alrededor: el
 * texto queda con el formato del primer tramo, que es el que el autor le puso
 * al escribirlo. El resto del párrafo no se toca.
 */
export function repararMarkerkeys(xml: string): ResultadoReparacion {
    const reparados: string[] = [];
    const irreparables: string[] = [];

    let salida = "";
    let i = 0;

    while (i < xml.length) {
        const abre = xml.indexOf("{{", i);
        if (abre === -1) {
            salida += xml.slice(i);
            break;
        }

        salida += xml.slice(i, abre);

        // Recorre desde "{{" hasta "}}" saltando etiquetas en línea.
        let j = abre + 2;
        let texto = "";
        let habiaEtiquetas = false;
        let bloqueado = false;

        while (j < xml.length) {
            if (xml.startsWith("}}", j)) break;

            if (xml[j] === "<") {
                const fin = xml.indexOf(">", j);
                if (fin === -1) {
                    bloqueado = true;
                    break;
                }
                const etiqueta = xml.slice(j, fin + 1);
                if (!ETIQUETAS_EN_LINEA.test(etiqueta)) {
                    bloqueado = true;
                    break;
                }
                habiaEtiquetas = true;
                j = fin + 1;
                continue;
            }

            // Otra apertura antes del cierre: no es un token, es texto suelto.
            if (xml.startsWith("{{", j)) {
                bloqueado = true;
                break;
            }

            texto += xml[j];
            j++;
        }

        if (bloqueado || j >= xml.length || !xml.startsWith("}}", j)) {
            if (habiaEtiquetas) irreparables.push(texto.trim());
            salida += "{{";
            i = abre + 2;
            continue;
        }

        if (habiaEtiquetas) {
            reparados.push(texto.trim());
            salida += `{{${texto}}}`;
        } else {
            salida += xml.slice(abre, j + 2);
        }

        i = j + 2;
    }

    return { xml: salida, reparados, irreparables };
}