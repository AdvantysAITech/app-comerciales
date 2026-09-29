import { unzipSync, zipSync } from "fflate";
import { desgloseXml, estilosDesglose } from "./desgloseOdf";
import type { PresupuestoCalculado } from "./motor";
import { anexoFotosXml, ESTILOS_ANEXO_FOTOS, type GrupoFotos } from "./anexoFotos";

/**
 * Post-proceso del ODT devuelto por la app de documentos.
 *
 * Hace dos cosas, independientes entre sí:
 *
 *  1. Estilar las tablas generadas. La app convierte las tablas Markdown a
 *     <table:table> ODF real, pero las emite SIN estilo: ni `table:style-name`
 *     en la tabla ni en las celdas. Solo aplica dos estilos de PÁRRAFO
 *     (`AI-TableHeader`, `AI-TableCell`) con fondo y padding pero ningún
 *     `fo:border`. Resultado: tablas sin líneas, que en un presupuesto que se
 *     envía a un administrador de fincas no pasa el corte.
 *
 *  2. Insertar la infografía de portada. La app no la genera ni la conoce: la
 *     renderizamos nosotros y la metemos aquí, en el mismo ZIP que ya estamos
 *     abriendo y volviendo a cerrar.
 *
 * NO reconstruye contenido ni sustituye markerkeys: eso lo hace la app y
 * funciona.
 *
 * Distinguir las tablas generadas de las de la plantilla es trivial y robusto:
 * las de la plantilla llevan `table:name` y `table:style-name`, las generadas
 * son `<table:table>` pelado. Solo se tocan las segundas, así que la maqueta
 * original queda intacta.
 */

/** Ancho útil de la caja de texto de la plantilla. */
const ANCHO_TABLA_PULGADAS = 6.5;

/** Ruta de la imagen dentro del paquete ODF. */
export const RUTA_PORTADA = "Pictures/portada.png";

/**
 * Marcador de la plantilla donde aterriza la portada.
 *
 * NO usa la forma `{{...}}` a propósito, por dos motivos:
 *  - la app intentaría resolverlo como markerkey y lo dejaría en blanco si no
 *    tiene su content type configurado;
 *  - `validarContenido()` (contrato.ts) marca como fallo cualquier `{{...}}`
 *    que sobreviva en la salida, así que nuestro propio verificador tumbaría
 *    el documento antes de llegar aquí.
 *
 * Con esta forma, la app lo ignora y llega intacto.
 */
export const MARCADOR_PORTADA = "[[PORTADA]]";

/**
 * Marcador del desglose de partidas por capítulo.
 *
 * Sustituye al markerkey `{{presup.DesgloseCapitulos}}`: la app impone un tope
 * de 4000 caracteres por campo y el desglose lo revienta a partir de 36
 * partidas. Se construye aquí, en ODF nativo, sin límite de tamaño.
 */
export const MARCADOR_DESGLOSE = "[[DESGLOSE]]";

/** A4. La página de portada de la plantilla va con márgenes a cero. */
const PORTADA_ANCHO = "210mm";
const PORTADA_ALTO = "297mm";

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------

/**
 * La plantilla no trae el marcador, o viene fragmentado.
 *
 * El segundo caso es el peligroso y es el mismo problema de siempre: si alguien
 * abre el .odt en LibreOffice o en Word y lo vuelve a guardar, el editor parte
 * el texto entre varios <text:span> y el literal deja de existir aunque a la
 * vista siga ahí. Por eso el mensaje apunta a la causa probable.
 */
export class MarcadorPortadaAusenteError extends Error {
    /**
     * Qué marcador falta. La ruta de estado lo necesita para decidir: sin
     * [[PORTADA]] el documento se publica sin infografía; sin [[DESGLOSE]] no se
     * publica, porque saldría sin partidas.
     */
    readonly marcador: string;

    constructor(marcador: string = MARCADOR_PORTADA) {
        super(
            `El ODT no contiene el marcador "${marcador}". O la plantilla no lo lleva, ` +
                `o se abrió y se volvió a guardar en un editor y el token quedó partido entre ` +
                `varios <text:span>. Vuelve a subir la plantilla y verifica los markerkeys.`
        );
        this.name = "MarcadorPortadaAusenteError";
        this.marcador = marcador;
    }
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

/**
 * Estilos de tabla y celda, como UN SOLO literal sin interpolaciones.
 *
 * ---------------------------------------------------------------------------
 * NO CONVERTIR EN PLANTILLA (15/09/2026)
 * ---------------------------------------------------------------------------
 * Esto era una concatenación de plantillas con `${ANCHO_TABLA_PULGADAS}` y
 * `${BORDE}` (constante ya eliminada). Son constantes, así que el minificador del build de producción
 * de Next.js intentaba plegarlas en un único string y se COMÍA 147 caracteres:
 * desde `in" table:align` hasta el inicio del estilo AICelda. El content.xml
 * quedaba mal formado (`style:width="6.5<style:table-cell-properties`) y
 * Gotenberg respondía "LibreOffice failed to convert ... resource issue", que
 * no tenía nada que ver con recursos.
 *
 * En `npm run dev` no se minifica: por eso en local funcionaba y en Vercel no.
 * Cambiar la interpolación por `toFixed(4)` NO lo arregló (verificado: lo
 * plegaba igual). Un literal único no tiene nada que plegar.
 *
 * `npm run build` ejecuta scripts/verificar-build.mjs, que comprueba este
 * texto en el código compilado. Si alguien lo vuelve a partir, el build falla.
 *
 * Valores: ancho 6.5in (= ANCHO_TABLA_PULGADAS), borde 0.5pt solid #b8b8b8.
 */
export const ESTILOS_TABLA_BASE =
    '<style:style style:name="AITabla" style:family="table"><style:table-properties style:width="6.5in" table:align="left" fo:margin-top="0.08in" fo:margin-bottom="0.08in"/></style:style><style:style style:name="AICelda" style:family="table-cell"><style:table-cell-properties fo:border="0.5pt solid #b8b8b8" fo:padding="0.04in"/></style:style>';

function estilosDeTabla(numerosDeColumnas: readonly number[]): string {
    const columnas = numerosDeColumnas
        .map((n) => {
            const ancho = (ANCHO_TABLA_PULGADAS / n).toFixed(4);
            return (
                `<style:style style:name="AICol${n}" style:family="table-column">` +
                `<style:table-column-properties style:column-width="${ancho}in"/></style:style>`
            );
        })
        .join("");

    return ESTILOS_TABLA_BASE + columnas;
}

/**
 * Estilo del marco de la portada.
 *
 * `run-through` + `background` es lo que hace que la imagen no empuje el texto
 * ni reserve hueco: se comporta como fondo de página. Y la posición va relativa
 * a PÁGINA, no al párrafo: anclada al párrafo, la imagen heredaría el
 * interlineado del <text:p> y bajaría unos milímetros respecto al borde.
 */
const ESTILO_MARCO_PORTADA =
    `<style:style style:name="AIPortadaMarco" style:family="graphic">` +
    `<style:graphic-properties style:wrap="run-through" style:run-through="background" ` +
    `style:horizontal-pos="from-left" style:horizontal-rel="page" ` +
    `style:vertical-pos="from-top" style:vertical-rel="page" ` +
    `fo:margin="0in" fo:padding="0in" fo:border="none" ` +
    `draw:stroke="none" draw:fill="none"/></style:style>`;

function inyectarEstilos(contentXml: string, estilos: string): string {
    if (!estilos) return contentXml;

    // Bloque vacío autocerrado: `<office:automatic-styles/>`. Hay que abrirlo,
    // no añadir otro al lado. Un content.xml con DOS <office:automatic-styles>
    // incumple el esquema ODF y LibreOffice ignora el segundo: los estilos
    // quedaban declarados en un bloque que nadie lee, el marco de la portada
    // se quedaba sin estilo y la imagen no se pintaba.
    if (contentXml.includes("<office:automatic-styles/>")) {
        return contentXml.replace(
            "<office:automatic-styles/>",
            `<office:automatic-styles>${estilos}</office:automatic-styles>`
        );
    }

    if (contentXml.includes("<office:automatic-styles>")) {
        return contentXml.replace("<office:automatic-styles>", `<office:automatic-styles>${estilos}`);
    }

    // Documento sin bloque de estilos automáticos: se crea antes del cuerpo.
    // Sin esto los estilos se perderían en silencio y las tablas volverían a
    // salir sin bordes sin que nada fallara.
    if (contentXml.includes("<office:body>")) {
        return contentXml.replace(
            "<office:body>",
            `<office:automatic-styles>${estilos}</office:automatic-styles><office:body>`
        );
    }

    return contentXml;
}

// ---------------------------------------------------------------------------
// Tablas
// ---------------------------------------------------------------------------

/** Aplica los estilos de tabla al content.xml. Exportada para probarla suelta. */
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

    let salida = inyectarEstilos(contentXml, estilosDeTabla(columnas));

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

// ---------------------------------------------------------------------------
// Portada
// ---------------------------------------------------------------------------

/**
 * Localiza el <text:p> que contiene el marcador y devuelve sus límites.
 *
 * Se busca a mano en lugar de con una expresión regular porque un `<text:p>`
 * no puede anidarse: basta retroceder hasta la apertura anterior y avanzar
 * hasta el cierre siguiente. Una regex del tipo `<text:p[^>]*>.*?</text:p>`
 * sobre un documento entero es frágil y mucho más lenta.
 */
function localizarParrafoDelMarcador(
    contentXml: string,
    marcadorBuscado: string = MARCADOR_PORTADA
): { inicio: number; fin: number; estilo: string | null } | null {
    const marcador = contentXml.indexOf(marcadorBuscado);
    if (marcador === -1) return null;

    const inicio = contentXml.lastIndexOf("<text:p", marcador);
    if (inicio === -1) return null;

    const cierre = contentXml.indexOf("</text:p>", marcador);
    if (cierre === -1) return null;

    const finApertura = contentXml.indexOf(">", inicio);
    const apertura = finApertura === -1 ? "" : contentXml.slice(inicio, finApertura + 1);
    const estilo = /text:style-name="([^"]+)"/.exec(apertura)?.[1] ?? null;

    return { inicio, fin: cierre + "</text:p>".length, estilo };
}

/**
 * El párrafo de reemplazo hereda el `text:style-name` del original.
 *
 * Ese estilo es el que la plantilla usa para dejar la portada en página propia
 * (`fo:break-after="page"`). Si lo descartáramos, el cuerpo del presupuesto se
 * imprimiría ENCIMA de la infografía: la imagen va anclada a página y con
 * `run-through`, así que no empuja el texto.
 *
 * Se hereda en vez de forzar nuestro propio salto a propósito: si la plantilla
 * ya trae el suyo, añadir otro dejaría una página en blanco entre medias.
 */
function marcoPortada(estilo: string | null): string {
    const apertura = estilo ? `<text:p text:style-name="${estilo}">` : `<text:p>`;

    return (
        apertura +
        `<draw:frame draw:style-name="AIPortadaMarco" draw:name="Portada" ` +
        `text:anchor-type="page" text:anchor-page-number="1" ` +
        `svg:x="0mm" svg:y="0mm" svg:width="${PORTADA_ANCHO}" svg:height="${PORTADA_ALTO}" ` +
        `draw:z-index="0">` +
        `<draw:image xlink:href="${RUTA_PORTADA}" xlink:type="simple" xlink:show="embed" ` +
        `xlink:actuate="onLoad"/>` +
        `</draw:frame>` +
        `</text:p>`
    );
}

/**
 * Sustituye el párrafo del marcador por el marco de imagen.
 *
 * Se reemplaza el párrafo ENTERO, no solo el texto del marcador: dejar el
 * <text:p> original y meter el marco dentro arrastra su interlineado.
 */
export function inyectarPortada(contentXml: string): string {
    const limites = localizarParrafoDelMarcador(contentXml);
    if (!limites) throw new MarcadorPortadaAusenteError();

    const conMarco =
        contentXml.slice(0, limites.inicio) +
        marcoPortada(limites.estilo) +
        contentXml.slice(limites.fin);

    return inyectarEstilos(conMarco, ESTILO_MARCO_PORTADA);
}

/**
 * Quita el reinicio de numeración del primer párrafo que sigue a la portada.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ
 * ---------------------------------------------------------------------------
 * La plantilla abre el cuerpo con un párrafo que cambia a la página "Standard"
 * y además reinicia la numeración: `style:page-number="1"`. La portada ya es la
 * página 1 (impar). Para que la nueva "página 1" también caiga en impar,
 * LibreOffice inserta una página en blanco automática entre las dos.
 *
 * En LibreOffice de escritorio no se ve (la vista normal oculta esas páginas),
 * pero Gotenberg SÍ las exporta al PDF: la página 2 salía en blanco en todos
 * los presupuestos. Reproducido y verificado el 15/09/2026 con el ODT de
 * `salida/e2e`: con el atributo, 8 páginas y la 2 vacía; sin él, 7 páginas.
 *
 * Quitarlo no cambia nada visible: la plantilla no imprime números de página.
 * Si algún día se añade "Página X", el cuerpo empezará en la 2. Para numerar
 * desde 1 tras la portada NO se debe volver a poner el reinicio aquí (vuelve
 * la página en blanco): hay que usar un desplazamiento en el campo de número.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ AQUÍ Y NO EN LA PLANTILLA
 * ---------------------------------------------------------------------------
 * La plantilla no se puede abrir en un editor sin partir los markerkeys. Y
 * haciéndolo en el post-proceso cubre también las plantillas futuras (Vertical).
 *
 * Solo toca el estilo de ESE párrafo, y solo si es lo siguiente a la portada.
 * Si la estructura no es la esperada, devuelve el XML intacto: en el peor caso
 * vuelve la página en blanco, nunca se rompe el documento.
 */
export function quitarReinicioNumeracionTrasPortada(contentXml: string): string {
    const marco = contentXml.indexOf(`draw:name="Portada"`);
    if (marco === -1) return contentXml;

    const cierrePortada = contentXml.indexOf("</text:p>", marco);
    if (cierrePortada === -1) return contentXml;

    // Lo inmediatamente siguiente tiene que ser un párrafo o encabezado. Se
    // toleran saltos de página blandos, que LibreOffice intercala al guardar.
    const tras = contentXml.slice(cierrePortada + "</text:p>".length);
    const siguiente = /^(?:\s|<text:soft-page-break\/>)*<text:(?:p|h)\b[^>]*?\btext:style-name="([^"]+)"/.exec(tras);
    if (!siguiente) return contentXml;

    const nombre = siguiente[1];
    const escapado = nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const apertura = new RegExp(`<style:style\\b[^>]*\\bstyle:name="${escapado}"[^>]*>`).exec(contentXml);
    if (!apertura) return contentXml;

    // Estilo autocerrado: no tiene propiedades de párrafo, no hay nada que quitar.
    if (apertura[0].endsWith("/>")) return contentXml;

    const inicio = apertura.index;
    const fin = contentXml.indexOf("</style:style>", inicio);
    if (fin === -1) return contentXml;

    const estilo = contentXml.slice(inicio, fin);
    const limpio = estilo.replace(/\s+style:page-number="[^"]*"/g, "");
    if (limpio === estilo) return contentXml;

    return contentXml.slice(0, inicio) + limpio + contentXml.slice(fin);
}

/**
 * Quita el párrafo del marcador sin poner nada en su sitio.
 *
 * Es la vía de degradación: si la portada no se ha podido renderizar, el
 * documento se publica sin ella. Lo que no puede pasar es que el administrador
 * reciba un presupuesto con "[[PORTADA]]" impreso en la primera página.
 */
export function eliminarMarcadorPortada(contentXml: string): string {
    const limites = localizarParrafoDelMarcador(contentXml);
    if (!limites) return contentXml;

    return contentXml.slice(0, limites.inicio) + contentXml.slice(limites.fin);
}

/**
 * Sustituye el párrafo del marcador por las tablas del desglose.
 *
 * El párrafo original desaparece entero, estilo incluido: aquí no se hereda
 * nada, a diferencia de la portada. El bloque que entra son N tablas con sus
 * propios encabezados de capítulo, y el estilo del párrafo que ocupaba el
 * marcador no le aporta nada.
 */
export function inyectarDesglose(contentXml: string, presupuesto: PresupuestoCalculado): string {
    const limites = localizarParrafoDelMarcador(contentXml, MARCADOR_DESGLOSE);
    if (!limites) throw new MarcadorPortadaAusenteError(MARCADOR_DESGLOSE);

    const bloque = desgloseXml(presupuesto);
    if (!bloque) {
        throw new Error(
            "El presupuesto no tiene ningún capítulo: no hay desglose que imprimir. " +
                "No debería llegar aquí: `calcularPresupuesto` rechaza un presupuesto sin líneas."
        );
    }

    const conDesglose =
        contentXml.slice(0, limites.inicio) + bloque + contentXml.slice(limites.fin);

    return inyectarEstilos(conDesglose, estilosDesglose());
}

/** Quita el párrafo del marcador. Vía de degradación, igual que en la portada. */
export function eliminarMarcadorDesglose(contentXml: string): string {
    const limites = localizarParrafoDelMarcador(contentXml, MARCADOR_DESGLOSE);
    if (!limites) return contentXml;

    return contentXml.slice(0, limites.inicio) + contentXml.slice(limites.fin);
}

/**
 * Declara la imagen en el manifiesto.
 *
 * Sin esta entrada el PNG está dentro del ZIP pero NINGÚN lector ODF lo
 * muestra, y el documento se abre sin dar error. Es el fallo silencioso clásico
 * de ODF: todo parece correcto y la portada sale en blanco.
 */
export function declararEnManifiesto(manifestXml: string): string {
    if (manifestXml.includes(RUTA_PORTADA)) return manifestXml;

    const entrada =
        `<manifest:file-entry manifest:full-path="${RUTA_PORTADA}" ` +
        `manifest:media-type="image/png"/>`;

    if (!manifestXml.includes("</manifest:manifest>")) {
        throw new Error("El manifiesto del ODT no tiene cierre </manifest:manifest>: está corrupto.");
    }

    return manifestXml.replace("</manifest:manifest>", `${entrada}</manifest:manifest>`);
}

/**
 * Añade el anexo fotográfico al FINAL del cuerpo del documento.
 *
 * Sin marcador a propósito: el anexo va siempre detrás de todo, y así no hay
 * que tocar las plantillas (ver anexoFotos.ts). Si no hay fotos, no cambia nada.
 */
export function inyectarAnexoFotos(contentXml: string, grupos: readonly GrupoFotos[]): string {
    const bloque = anexoFotosXml(grupos);
    if (!bloque) return contentXml;

    const cierre = contentXml.lastIndexOf("</office:text>");
    if (cierre === -1) {
        throw new Error("El content.xml no tiene </office:text>: no se puede añadir el anexo fotográfico.");
    }

    const conAnexo = contentXml.slice(0, cierre) + bloque + contentXml.slice(cierre);
    return inyectarEstilos(conAnexo, ESTILOS_ANEXO_FOTOS);
}

/**
 * Declara las fotos del anexo en el manifiesto. Mismo motivo que la portada:
 * sin entrada, la imagen está en el ZIP pero ningún lector la pinta.
 */
export function declararFotosEnManifiesto(manifestXml: string, grupos: readonly GrupoFotos[]): string {
    const entradas = grupos
        .flatMap((g) => g.fotos)
        .filter((f) => !manifestXml.includes(`manifest:full-path="${f.ruta}"`))
        .map((f) => `<manifest:file-entry manifest:full-path="${f.ruta}" manifest:media-type="${f.mimetype}"/>`)
        .join("");
    if (!entradas) return manifestXml;

    if (!manifestXml.includes("</manifest:manifest>")) {
        throw new Error("El manifiesto del ODT no tiene cierre </manifest:manifest>: está corrupto.");
    }
    return manifestXml.replace("</manifest:manifest>", `${entradas}</manifest:manifest>`);
}

// ---------------------------------------------------------------------------
// Empaquetado
// ---------------------------------------------------------------------------

export type OpcionesPostproceso = {
    /**
     * PNG de la infografía. Si falta, el marcador se elimina y el documento
     * sale sin portada. Un presupuesto sin infografía sigue siendo válido.
     */
    portadaPng?: Uint8Array | null;
    /**
     * Presupuesto con el que construir el desglose de partidas.
     *
     * Si falta, el marcador se elimina y el documento sale SIN desglose. Quien
     * llama tiene que decidir si eso es publicable: a diferencia de la portada,
     * el desglose no es un adorno.
     */
    desglose?: PresupuestoCalculado | null;
    /**
     * Fotos de la visita, agrupadas por tipo de trabajo. Van en un anexo al
     * final del documento. Vacío o ausente = sin anexo.
     */
    anexoFotos?: readonly GrupoFotos[] | null;
};

/**
 * Reempaqueta el ODT ya estilizado y, si procede, con la portada dentro.
 *
 * `mimetype` DEBE ser la primera entrada del ZIP y estar SIN COMPRIMIR: es como
 * los lectores de ODF identifican el formato. Un ZIP correcto pero con el
 * mimetype comprimido o en otra posición se abre mal o directamente no se
 * reconoce como documento.
 */
export function postprocesarOdt(odt: ArrayBuffer, opciones: OpcionesPostproceso = {}): ArrayBuffer {
    const entradas = unzipSync(new Uint8Array(odt));

    const content = entradas["content.xml"];
    if (!content) throw new Error("El ODT no contiene content.xml: no es un documento válido.");

    const mimetype = entradas["mimetype"];
    if (!mimetype) throw new Error("El ODT no contiene mimetype.");

    const decodificador = new TextDecoder("utf-8");
    const codificador = new TextEncoder();

    let contentXml = darEstiloATablas(decodificador.decode(content));

    const png = opciones.portadaPng;

    if (png && png.byteLength > 0) {
        contentXml = inyectarPortada(contentXml);

        // Sin esto, Gotenberg exporta una página en blanco entre la portada y
        // el cuerpo. Ver `quitarReinicioNumeracionTrasPortada`.
        contentXml = quitarReinicioNumeracionTrasPortada(contentXml);

        const manifiesto = entradas["META-INF/manifest.xml"];
        if (!manifiesto) {
            throw new Error("El ODT no contiene META-INF/manifest.xml: no se puede declarar la portada.");
        }

        entradas["META-INF/manifest.xml"] = codificador.encode(
            declararEnManifiesto(decodificador.decode(manifiesto))
        );
        // Copia a un buffer propio: `Uint8Array` puede venir respaldado por un
        // `SharedArrayBuffer`, que no encaja en el tipo de entrada de fflate.
        // De paso, el paquete deja de depender de que nadie reutilice ese
        // buffer entre el render y el empaquetado.
        entradas[RUTA_PORTADA] = new Uint8Array(png);
    } else {
        contentXml = eliminarMarcadorPortada(contentXml);
    }

    // El desglose de partidas: se construye en ODF nativo porque la app impone
    // un tope de 4000 caracteres por campo del JSON y el desglose lo supera a
    // partir de 36 partidas.
    contentXml = opciones.desglose
        ? inyectarDesglose(contentXml, opciones.desglose)
        : eliminarMarcadorDesglose(contentXml);

    // Anexo fotográfico, al final de todo.
    const grupos = (opciones.anexoFotos ?? []).filter((g) => g.fotos.length > 0);
    const rutasFotos = new Set<string>();
    if (grupos.length > 0) {
        contentXml = inyectarAnexoFotos(contentXml, grupos);

        const manifiesto = entradas["META-INF/manifest.xml"];
        if (!manifiesto) {
            throw new Error("El ODT no contiene META-INF/manifest.xml: no se pueden declarar las fotos.");
        }
        entradas["META-INF/manifest.xml"] = codificador.encode(
            declararFotosEnManifiesto(decodificador.decode(manifiesto), grupos)
        );

        for (const foto of grupos.flatMap((g) => g.fotos)) {
            entradas[foto.ruta] = new Uint8Array(foto.datos);
            rutasFotos.add(foto.ruta);
        }
    }

    entradas["content.xml"] = codificador.encode(contentXml);

    // fflate respeta el orden de inserción, así que mimetype va primero y con
    // level 0 (STORED). El PNG también va sin comprimir: ya está comprimido y
    // pasarlo por deflate solo gasta tiempo para ganar unos bytes.
    const salida: Record<string, [Uint8Array, { level: 0 | 9 }]> = {
        mimetype: [mimetype, { level: 0 }],
    };
    for (const [nombre, datos] of Object.entries(entradas)) {
        if (nombre === "mimetype") continue;
        // Imágenes sin comprimir: JPEG y PNG ya lo están.
        const esImagen = nombre === RUTA_PORTADA || rutasFotos.has(nombre);
        salida[nombre] = [datos, { level: esImagen ? 0 : 9 }];
    }

    const zip = zipSync(salida);
    return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
}