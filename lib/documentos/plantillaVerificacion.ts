import { unzipSync } from "fflate";
import { RUTAS } from "./contrato";
import { MARCADOR_DESGLOSE, MARCADOR_PORTADA } from "./odf";
import { ESTILO_PARRAFO_PORTADA, MASTER_PAGE_PORTADA } from "./plantillaPortada";

/**
 * lib/documentos/plantillaVerificacion.ts
 *
 * Verificación de una plantilla ODT, o del ODT que devuelve la app.
 *
 * Sustituye al `node -e "..."` que veníamos ejecutando a mano. Aquel contaba
 * tokens contra un número fijo; este los compara contra `RUTAS` (contrato.ts),
 * que es la lista real de markerkeys que el código sabe rellenar. Así se
 * detectan los dos desajustes:
 *
 *   - un markerkey en la plantilla que el código no conoce -> saldrá VACÍO;
 *   - una ruta en el código que la plantilla no tiene -> el dato no se imprime.
 *
 * ---------------------------------------------------------------------------
 * FRAGMENTACIÓN
 * ---------------------------------------------------------------------------
 * Es el fallo que perseguimos. Al guardar en LibreOffice o Word, el editor
 * puede partir `{{doc.FechaEmision}}` entre varios <text:span>. En el XML deja
 * de existir el literal, la sustitución no encuentra nada y el campo sale en
 * blanco SIN ERROR.
 *
 * Se detecta comparando dos lecturas: sobre el XML tal cual, y sobre el XML con
 * las etiquetas quitadas. Un token que solo aparece en la segunda está partido.
 *
 * Se miran content.xml Y styles.xml: los encabezados y pies viven en las
 * páginas maestras, dentro de styles.xml. Un verificador que solo lea
 * content.xml daría por ausente un markerkey de cabecera.
 */

/**
 * `<` y `>` quedan FUERA de la clase de caracteres a propósito.
 *
 * Sin esa exclusión, un token partido como
 * `{{doc.Fecha</text:span><text:span>Validez}}` casaba entero -- entre las
 * llaves no hay ninguna llave -- y se contaba como íntegro. El verificador daba
 * por buena una plantilla rota.
 */
const RE_MARKERKEY = /\{\{([^{}<>]+)\}\}/g;

export type NivelHallazgo = "error" | "aviso";

export interface Hallazgo {
    nivel: NivelHallazgo;
    mensaje: string;
}

export interface InformeMarkerkeys {
    /** Tokens íntegros encontrados, sin repetir. */
    encontrados: string[];
    /** Tokens que solo aparecen tras quitar las etiquetas: están partidos. */
    fragmentados: string[];
    /** En la plantilla pero no en RUTAS: saldrán vacíos. */
    desconocidos: string[];
    /** En RUTAS pero no en la plantilla: el dato no se imprime. */
    ausentes: string[];
}

export interface InformePlantilla {
    markerkeys: InformeMarkerkeys;
    desglose: {
        marcadorPresente: boolean;
        marcadorFragmentado: boolean;
    };
    portada: {
        marcadorPresente: boolean;
        marcadorFragmentado: boolean;
        estiloParrafo: string | null;
        tieneSaltoDePagina: boolean;
        masterPagePortada: boolean;
        margenesACero: boolean;
    };
    hallazgos: Hallazgo[];
    /** `true` si no hay ningún hallazgo de nivel "error". */
    valida: boolean;
}

// ---------------------------------------------------------------------------
// Extracción
// ---------------------------------------------------------------------------

function sinEtiquetas(xml: string): string {
    return xml.replace(/<[^>]*>/g, "");
}

/**
 * Cuenta apariciones, no presencia.
 *
 * Un conjunto no basta: si el mismo markerkey aparece dos veces en la plantilla
 * y solo una está partida, la otra lo "tapa" y la comparación por conjuntos no
 * ve nada. Comparando cuántas veces aparece con etiquetas y sin ellas, la
 * diferencia son exactamente las apariciones rotas.
 */
function tokensDe(texto: string): Map<string, number> {
    const cuenta = new Map<string, number>();
    for (const m of texto.matchAll(RE_MARKERKEY)) {
        const t = m[1].trim();
        cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
    }
    return cuenta;
}

// ---------------------------------------------------------------------------
// Verificación
// ---------------------------------------------------------------------------

export function verificarPlantilla(odt: ArrayBuffer): InformePlantilla {
    const entradas = unzipSync(new Uint8Array(odt));
    const decodificar = (b: Uint8Array) => new TextDecoder("utf-8").decode(b);

    const hallazgos: Hallazgo[] = [];

    if (!entradas["content.xml"]) {
        throw new Error("El fichero no contiene content.xml: no es un ODT válido.");
    }

    const content = decodificar(entradas["content.xml"]);
    const styles = entradas["styles.xml"] ? decodificar(entradas["styles.xml"]) : "";
    const xml = `${content}\n${styles}`;

    // --- Markerkeys -------------------------------------------------------
    const integros = tokensDe(xml);
    const planos = tokensDe(sinEtiquetas(xml));

    const fragmentados = [...planos.keys()]
        .filter((t) => (planos.get(t) ?? 0) > (integros.get(t) ?? 0))
        .sort();

    const esperados = new Set(RUTAS.map((r) => r.markerkey));
    const desconocidos = [...integros.keys()].filter((t) => !esperados.has(t)).sort();
    const ausentes = [...esperados].filter((t) => !integros.has(t)).sort();

    for (const t of fragmentados) {
        const rotas = (planos.get(t) ?? 0) - (integros.get(t) ?? 0);
        hallazgos.push({
            nivel: "error",
            mensaje:
                `{{${t}}} está PARTIDO entre etiquetas (${rotas} aparición(es)). Saldrá vacío sin ` +
                `dar error. La plantilla se ha abierto y guardado en un editor.`,
        });
    }
    for (const t of desconocidos) {
        hallazgos.push({
            nivel: "error",
            mensaje:
                `{{${t}}} está en la plantilla pero no en RUTAS (contrato.ts). No hay nada que ` +
                `lo rellene: saldrá vacío. Añádelo a RUTAS y crea su content type en la app.`,
        });
    }
    for (const t of ausentes) {
        hallazgos.push({
            nivel: "aviso",
            mensaje: `{{${t}}} está en RUTAS pero la plantilla no lo usa. Ese dato no se imprime.`,
        });
    }

    // --- Portada ----------------------------------------------------------
    const marcadorPresente = xml.includes(MARCADOR_PORTADA);
    const marcadorFragmentado = !marcadorPresente && sinEtiquetas(xml).includes(MARCADOR_PORTADA);

    let estiloParrafo: string | null = null;
    let tieneSaltoDePagina = false;

    if (marcadorPresente) {
        const pos = content.indexOf(MARCADOR_PORTADA);
        const inicio = content.lastIndexOf("<text:p", pos);
        const finApertura = inicio === -1 ? -1 : content.indexOf(">", inicio);
        const apertura = finApertura === -1 ? "" : content.slice(inicio, finApertura + 1);
        estiloParrafo = /text:style-name="([^"]+)"/.exec(apertura)?.[1] ?? null;

        if (estiloParrafo) {
            // El salto puede venir del propio estilo o de la página maestra que
            // ese estilo aplica. Las dos formas valen.
            const definicion = new RegExp(
                `<style:style[^>]*style:name="${estiloParrafo}"[\\s\\S]*?</style:style>`
            ).exec(content)?.[0];
            const aperturaEstilo = new RegExp(
                `<style:style[^>]*style:name="${estiloParrafo}"[^>]*>`
            ).exec(content)?.[0];

            tieneSaltoDePagina =
                Boolean(definicion?.includes('fo:break-after="page"')) ||
                Boolean(definicion?.includes('fo:break-before="page"')) ||
                Boolean(aperturaEstilo?.includes("style:master-page-name="));
        }
    }

    // --- Desglose ---------------------------------------------------------
    const desglosePresente = xml.includes(MARCADOR_DESGLOSE);
    const desgloseFragmentado = !desglosePresente && sinEtiquetas(xml).includes(MARCADOR_DESGLOSE);

    if (!desglosePresente) {
        hallazgos.push({
            nivel: "error",
            mensaje: desgloseFragmentado
                ? `${MARCADOR_DESGLOSE} está PARTIDO entre etiquetas. El desglose no se inyectará.`
                : `Falta ${MARCADOR_DESGLOSE}. Sin él, el presupuesto sale SIN las partidas. ` +
                  `Pasa la plantilla por "plantilla:preparar".`,
        });
    }

    const masterPagePortada = styles.includes(`style:name="${MASTER_PAGE_PORTADA}"`);

    // Márgenes a cero en el page-layout que usa la maestra de portada.
    let margenesACero = false;
    if (masterPagePortada) {
        const maestra = new RegExp(
            `<style:master-page[^>]*style:name="${MASTER_PAGE_PORTADA}"[^>]*>`
        ).exec(styles)?.[0];
        const layout = maestra ? /style:page-layout-name="([^"]+)"/.exec(maestra)?.[1] : undefined;
        if (layout) {
            const definicion = new RegExp(
                `<style:page-layout[^>]*style:name="${layout}"[\\s\\S]*?</style:page-layout>`
            ).exec(styles)?.[0];
            margenesACero = ["top", "bottom", "left", "right"].every((lado) =>
                /^0(\.0+)?(mm|cm|in|pt)$/.test(
                    new RegExp(`fo:margin-${lado}="([^"]+)"`).exec(definicion ?? "")?.[1] ?? ""
                )
            );
        }
    }

    if (marcadorFragmentado) {
        hallazgos.push({
            nivel: "error",
            mensaje:
                `${MARCADOR_PORTADA} está PARTIDO entre etiquetas. La inyección de la portada ` +
                `fallará. Vuelve a preparar la plantilla con "plantilla:preparar".`,
        });
    } else if (!marcadorPresente) {
        hallazgos.push({
            nivel: "error",
            mensaje: `Falta ${MARCADOR_PORTADA}. Pasa la plantilla por "plantilla:preparar".`,
        });
    } else {
        if (!estiloParrafo) {
            hallazgos.push({
                nivel: "error",
                mensaje:
                    `El párrafo de ${MARCADOR_PORTADA} no tiene text:style-name. Sin estilo no hay ` +
                    `salto de página y el cuerpo del presupuesto se imprimirá ENCIMA de la portada.`,
            });
        } else if (!tieneSaltoDePagina) {
            hallazgos.push({
                nivel: "error",
                mensaje:
                    `El estilo "${estiloParrafo}" no fuerza salto de página ni aplica página maestra. ` +
                    `El cuerpo se imprimirá encima de la portada.`,
            });
        }
        if (estiloParrafo && estiloParrafo !== ESTILO_PARRAFO_PORTADA) {
            hallazgos.push({
                nivel: "aviso",
                mensaje:
                    `El párrafo usa el estilo "${estiloParrafo}" y no "${ESTILO_PARRAFO_PORTADA}". ` +
                    `Vale si cumple su función, pero no lo ha puesto "plantilla:preparar".`,
            });
        }
        if (!masterPagePortada) {
            hallazgos.push({
                nivel: "aviso",
                mensaje:
                    `No hay página maestra "${MASTER_PAGE_PORTADA}" en styles.xml. La portada usará ` +
                    `los márgenes de la página normal y no llegará al borde.`,
            });
        } else if (!margenesACero) {
            hallazgos.push({
                nivel: "aviso",
                mensaje:
                    `La página maestra "${MASTER_PAGE_PORTADA}" no tiene los cuatro márgenes a cero. ` +
                    `La infografía saldrá con marco blanco alrededor.`,
            });
        }
    }

    return {
        markerkeys: {
            encontrados: [...integros.keys()].sort(),
            fragmentados,
            desconocidos,
            ausentes,
        },
        desglose: {
            marcadorPresente: desglosePresente,
            marcadorFragmentado: desgloseFragmentado,
        },
        portada: {
            marcadorPresente,
            marcadorFragmentado,
            estiloParrafo,
            tieneSaltoDePagina,
            masterPagePortada,
            margenesACero,
        },
        hallazgos,
        valida: !hallazgos.some((h) => h.nivel === "error"),
    };
}