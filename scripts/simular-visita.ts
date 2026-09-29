import { config } from "dotenv";
config({ path: ".env.local" });

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync, zipSync } from "fflate";

import { SUBCUENTAS, type SubcuentaSlug } from "../lib/subcuenta";
import { getModulos } from "../lib/catalogo";
import { generarPropuesta, buscarEnCype } from "../lib/propuesta/generar";
import { validarPropuesta } from "../lib/propuesta/validar";
import { conflictosDeCodigo } from "../lib/propuesta/conflictos";
import type { DictadoModulo, LineaPropuesta, Propuesta } from "../lib/propuesta/tipos";
import { construirPayload, type PayloadVisita } from "../lib/visita/payload";
import { seleccionVacia } from "../lib/visita/seleccion";
import { presupuestarConAjustes } from "../lib/documentos/mapeo-capitulos";
import { cifrasDelCalculo, formatearImporte, type PresupuestoCalculado } from "../lib/documentos/motor";
import { calcularFechaValidez, prepararDocumento, type JsonDocumento } from "../lib/documentos/payloadDocumento";
import { RUTAS, resolverRuta, validarCifras } from "../lib/documentos/contrato";
import { obtenerPlantilla } from "../lib/documentos/plantilla";
import {
    descargarOdt,
    esperarResultado,
    generarDocumento,
    tokensConsumidos,
    verificarResultado,
} from "../lib/documentos/soluciona";
import { postprocesarOdt } from "../lib/documentos/odf";
import { dimensionesImagen, type GrupoFotos } from "../lib/documentos/anexoFotos";
import { assertPortada, construirPortada, type ImagenPortada } from "../lib/documentos/portada";
import { renderizarPortada } from "../lib/documentos/portada.svg";
import { rasterizarSvg } from "../lib/documentos/rasterizar";
import { convertirAPdf, conversionDisponible } from "../lib/documentos/pdf";
import { llamarClaude } from "../lib/ia/claude";
import { listarPartidas } from "../lib/documentos/tarifa";
import { partidaPermitida } from "../lib/catalogo/licencias";

/**
 * scripts/simular-visita.ts
 *
 * SIMULACIÓN COMPLETA DE UNA VISITA, desde la terminal (29/09/2026).
 *
 * Hace lo mismo que la app cuando un comercial rellena el formulario y pulsa
 * "Crear presupuesto", con el MISMO código de la app:
 *
 *   1. Dictado del comercial por tipo de trabajo (el de abajo, editable).
 *   2. Propuesta de partidas por IA (tarifa 2026 + búsqueda en CYPE).
 *   3. "Revisión" del comercial: las líneas que la IA deja incompletas (sin
 *      medición o sin precio) se quitan y se avisa, que es lo que el comercial
 *      tendría que completar en pantalla.
 *   4. Payload canónico, motor económico y JSON del documento (pre-vuelo).
 *   5. Documento:
 *        - con Soluciona configurado en .env.local: generación REAL (consume
 *          tokens de Soluciona) y verificación igual que en producción;
 *        - sin Soluciona (o con --local): se rellena la plantilla del repo aquí
 *          mismo siguiendo el contrato de `contrato.ts`, y las dos secciones de
 *          IA (título y objeto/alcance) las redacta Claude.
 *   6. Portada con foto, desglose de partidas y anexo fotográfico (odf.ts).
 *   7. PDF con Gotenberg (si GOTENBERG_URL) o con LibreOffice instalado.
 *
 * NO escribe NADA en GHL: ni comunidad, ni contacto, ni oportunidad, ni
 * correlativo, ni documento. La referencia es de prueba (SIM-...).
 *
 * ---------------------------------------------------------------------------
 * USO (PowerShell, desde la raíz del proyecto)
 * ---------------------------------------------------------------------------
 *   $env:ANTHROPIC_API_KEY = "sk-ant-..."      # o tenerla en .env.local
 *   npx tsx scripts/simular-visita.ts
 *
 * Opciones:
 *   --portada=C:\ruta\foto.jpg   Imagen de portada (JPEG o PNG).
 *   --fotos=C:\ruta\carpeta      Fotos del anexo. Si la carpeta tiene subcarpetas
 *                                con la clave del tipo de trabajo (cubiertas,
 *                                patio_de_luces, bajantes...) se usan por tipo;
 *                                si no, se reparten en orden entre los tipos.
 *   --local                      No usar Soluciona aunque esté configurado.
 *   --sin-ia                     Sin llamadas a la IA ni a CYPE (no gasta tokens):
 *                                partidas fijas de la tarifa 2026 y textos de
 *                                ejemplo. Sirve para probar la cadena del documento
 *                                (motor, plantilla, portada, anexo, PDF). Implica
 *                                --local.
 *   --sin-pdf                    Dejar solo el ODT.
 *
 * La salida queda en salida/simulacion/<fecha-hora>/ (carpeta ignorada por git).
 *
 * Las fotos NO se mandan a la IA: la app le manda URLs públicas de GHL y aquí
 * son ficheros locales. La propuesta sale solo del dictado.
 */

// ---------------------------------------------------------------------------
// Escenario: lo que rellena el comercial. Cámbialo para probar otras visitas.
// ---------------------------------------------------------------------------

const SUBCUENTA: SubcuentaSlug = "scala-valencia";

const VISITA = {
    comercial: "Jose García",
    comunidad: { nombre: "C/ Fontanares, 68", localidad: "Valencia", provincia: "Valencia" },
    administrador: { nombre: "Fincas Álvarez Casado", localidad: "Valencia" },
    contacto: { nombre: "Ana Martínez (presidenta)", telefono: "600123456" },
    fechaVisita: new Date().toISOString().slice(0, 10),
    observaciones: "Acceso a cubierta por la escalera comunitaria. Llave en portería de 9 a 14 h.",
};

/** Dictado por tipo de trabajo (clave del catálogo -> texto). */
const DICTADOS: Record<string, string> = {
    cubiertas:
        "Cubierta del casetón de la escalera, unos 30 metros cuadrados de techo. Hay que quitar la tela asfáltica vieja, " +
        "que está levantada, y hacer impermeabilización nueva con dos manos de antigoteras y malla de fibra de vidrio. " +
        "Limpiar los 2 sumideros. En la entrada a la terraza la marquesina de policarbonato está rota, hay que cambiarla, " +
        "mide 2 por 1,5 metros.",
    patio_de_luces:
        "Patio de luces de unos 180 metros cuadrados de paramento. Reparar el 20 por ciento de fisuras y desconchones con " +
        "mortero y pintar todo el patio con pintura de silicato. No cabe andamio: se hace con trabajos verticales.",
    bajantes:
        "Bajante general de fibrocemento en el patio, 14 metros lineales. Sustituir por bajante de PVC de 110. " +
        "Ojo, es fibrocemento: plan de trabajo de amianto y retirada.",
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const opcion = (nombre: string) =>
    args.find((a) => a.startsWith(`--${nombre}=`))?.split("=").slice(1).join("=") ?? null;
const bandera = (nombre: string) => args.includes(`--${nombre}`);

function paso(titulo: string) {
    console.log(`\n── ${titulo} ${"─".repeat(Math.max(0, 64 - titulo.length))}`);
}

const marca = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
const salida = join(process.cwd(), "salida", "simulacion", marca);
mkdirSync(salida, { recursive: true });

const guardar = (nombre: string, contenido: string | Uint8Array | ArrayBuffer) =>
    writeFileSync(
        join(salida, nombre),
        typeof contenido === "string" ? contenido : Buffer.from(contenido instanceof ArrayBuffer ? new Uint8Array(contenido) : contenido)
    );

function aArrayBuffer(datos: Uint8Array): ArrayBuffer {
    const copia = new Uint8Array(datos.byteLength);
    copia.set(datos);
    return copia.buffer;
}

/** Lee una imagen local JPEG/PNG. `null` si no vale. */
function leerImagen(ruta: string): ImagenPortada | null {
    const datos = new Uint8Array(readFileSync(ruta));
    const dim = dimensionesImagen(datos);
    if (!dim || dim.ancho === 0 || dim.alto === 0) {
        console.log(`  !   ${ruta}: no es un JPEG ni un PNG legible, se omite.`);
        return null;
    }
    return { ...dim, datos };
}

const esImagen = (nombre: string) => /\.(jpe?g|png)$/i.test(nombre);

/** Problemas que impiden crear el presupuesto (misma regla que la pantalla de revisión). */
function problemasDeLinea(l: LineaPropuesta): string[] {
    const p: string[] = [];
    if (l.pendienteCype) p.push("buscando en CYPE");
    else if (!l.codigo) p.push("sin partida");
    if (l.cantidad === null || l.cantidad <= 0) p.push("falta la medición");
    if (!l.pendienteCype && (l.precioUnitario === null || l.precioUnitario < 0)) p.push("falta el precio");
    if (!l.descripcionCorta.trim()) p.push("falta la descripción");
    return p;
}

// ---------------------------------------------------------------------------
// Relleno local de la plantilla (sustituye a Soluciona con --local)
// ---------------------------------------------------------------------------

const escXml = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** **negrita** y *cursiva* a spans ODF. */
function enLinea(texto: string): string {
    return escXml(texto)
        .replace(/\*\*(.+?)\*\*/g, '<text:span text:style-name="SimNegrita">$1</text:span>')
        .replace(/\*(.+?)\*/g, '<text:span text:style-name="SimCursiva">$1</text:span>');
}

function celdas(linea: string): string[] {
    const partes = linea.trim().split("|").map((c) => c.trim());
    if (partes[0] === "") partes.shift();
    if (partes.length > 0 && partes[partes.length - 1] === "") partes.pop();
    return partes;
}

/**
 * Markdown (el subconjunto que admite la app) -> ODF. `apertura` es la etiqueta
 * <text:p ...> del párrafo del marcador: los párrafos generados heredan su estilo.
 * Las tablas salen como `<table:table>` sin atributos, que es lo que `odf.ts`
 * reconoce para darles bordes y anchos.
 */
function markdownAOdf(md: string, apertura: string): string {
    const lineas = md.replace(/\r/g, "").split("\n");
    const piezas: string[] = [];

    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i].trim();
        if (linea === "") continue;

        if (linea.startsWith("|")) {
            const filas: string[][] = [];
            while (i < lineas.length && lineas[i].trim().startsWith("|")) {
                const actual = lineas[i].trim();
                if (!/^\|?\s*:?-{3,}/.test(actual)) filas.push(celdas(actual));
                i++;
            }
            i--;
            const columnas = Math.max(...filas.map((f) => f.length));
            const xmlFilas = filas.map((f, n) => {
                const tds = Array.from({ length: columnas }, (_, c) => {
                    const contenido = enLinea(f[c] ?? "");
                    const texto = n === 0 ? `<text:span text:style-name="SimNegrita">${contenido}</text:span>` : contenido;
                    return `<table:table-cell office:value-type="string"><text:p>${texto}</text:p></table:table-cell>`;
                }).join("");
                return `<table:table-row>${tds}</table:table-row>`;
            });
            piezas.push(
                `<table:table><table:table-column table:number-columns-repeated="${columnas}"/>${xmlFilas.join("")}</table:table>`
            );
            continue;
        }

        const encabezado = linea.match(/^#{3,4}\s+(.*)$/);
        if (encabezado) {
            piezas.push(`${apertura}<text:span text:style-name="SimNegrita">${enLinea(encabezado[1])}</text:span></text:p>`);
            continue;
        }

        const lista = linea.match(/^(?:[-*]|\d+\.)\s+(.*)$/);
        if (lista) {
            const vineta = /^\d+\./.test(linea) ? `${linea.match(/^\d+/)![0]}. ` : "• ";
            piezas.push(`${apertura}${vineta}${enLinea(lista[1])}</text:p>`);
            continue;
        }

        piezas.push(`${apertura}${enLinea(linea)}</text:p>`);
    }

    return piezas.join("");
}

/** Sustituye el PÁRRAFO entero que contiene el marcador por el bloque generado. */
function sustituirBloque(xml: string, marcador: string, markdown: string): string {
    let resultado = xml;
    for (let idx = resultado.indexOf(marcador); idx !== -1; idx = resultado.indexOf(marcador)) {
        const inicio = resultado.lastIndexOf("<text:p", idx);
        const fin = resultado.indexOf("</text:p>", idx) + "</text:p>".length;
        const apertura = resultado.slice(inicio, resultado.indexOf(">", inicio) + 1);
        resultado = resultado.slice(0, inicio) + markdownAOdf(markdown, apertura) + resultado.slice(fin);
    }
    return resultado;
}

const PROMPT_FORMATO = `FORMATO DE SALIDA: se inyecta en un ODT mediante un conversor Markdown. Solo se admite:
**negrita**, *cursiva*, "### Encabezado", listas con "- " o "1. ". PROHIBIDO: vallas de código, HTML,
encabezados # o ##, líneas horizontales, enlaces, emojis, preámbulos ("Aquí tienes...") o comentarios
finales, repetir el título de la sección. Español de España, registro técnico de construcción, impersonal.`;

async function seccionIa(markerkey: string, json: JsonDocumento): Promise<string> {
    if (bandera("sin-ia")) return seccionEjemplo(markerkey, json);
    const datos = JSON.stringify({ comunidad: json.comunidad, modulos: json.modulos }, null, 1);

    if (markerkey === "presup.TituloPresupuesto") {
        const r = await llamarClaude({
            sistema:
                "Eres el redactor técnico de una empresa de rehabilitación de edificios. Devuelve SOLO el título del " +
                "presupuesto: una línea, sin comillas ni punto final, de 6 a 14 palabras, que nombre los trabajos y " +
                "elementos principales. Sin importes, precios ni cifras económicas.",
            mensaje: datos,
            maxTokens: 200,
        });
        return r.texto.replace(/\s+/g, " ").trim();
    }

    const r = await llamarClaude({
        sistema:
            `${PROMPT_FORMATO}\n\nTAREA: redacta la sección «Objeto y alcance de la intervención» de un presupuesto ` +
            "de obra a partir de los datos. Estructura: un párrafo inicial con el objeto de la intervención; luego, " +
            "por cada tipo de trabajo, un encabezado ### con su nombre y una lista con los trabajos incluidos y su " +
            "medición y unidad tal como vienen; cierra con un párrafo sobre medios auxiliares, gestión de residuos y " +
            "seguridad si proceden por las partidas. NO escribas precios, importes, totales ni porcentajes económicos: " +
            "van en otra sección. No inventes trabajos que no estén en los datos.",
        mensaje: datos,
        maxTokens: 2500,
    });
    return r.texto.trim();
}

async function rellenarPlantillaLocal(json: JsonDocumento): Promise<{ odt: ArrayBuffer; titulo: string; trazas: Array<{ markerKey: string; aiResponse: string }> }> {
    const ruta = join(process.cwd(), SUBCUENTA === "scala-valencia" ? "Plantilla_Presupuesto_Scala.odt" : "Plantilla_Presupuesto_Vertical.odt");
    const entradas = unzipSync(new Uint8Array(readFileSync(ruta)));
    let xml = new TextDecoder().decode(entradas["content.xml"]);

    const estilos =
        '<style:style style:name="SimNegrita" style:family="text"><style:text-properties fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"/></style:style>' +
        '<style:style style:name="SimCursiva" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>';
    xml = xml.includes("<office:automatic-styles/>")
        ? xml.replace("<office:automatic-styles/>", `<office:automatic-styles>${estilos}</office:automatic-styles>`)
        : xml.replace("<office:automatic-styles>", `<office:automatic-styles>${estilos}`);

    // Secciones de IA, en paralelo.
    const ia = RUTAS.filter((r) => r.tipo === "ia");
    const textos = await Promise.all(ia.map((r) => seccionIa(r.markerkey, json)));
    const trazas = ia.map((r, i) => ({ markerKey: r.markerkey, aiResponse: textos[i] }));

    for (const [i, r] of ia.entries()) {
        const marcador = `{{${r.markerkey}}}`;
        // El título va en línea (dos veces); el resto es un bloque de párrafos.
        xml =
            r.markerkey === "presup.TituloPresupuesto"
                ? xml.split(marcador).join(enLinea(textos[i]))
                : sustituirBloque(xml, marcador, textos[i]);
    }

    // Mapeo directo (y tablas) según el contrato.
    for (const r of RUTAS.filter((d) => d.tipo === "directo")) {
        const marcador = `{{${r.markerkey}}}`;
        const valor = String(resolverRuta(json, r.ruta) ?? "");
        xml = r.tabla ? sustituirBloque(xml, marcador, valor) : xml.split(marcador).join(escXml(valor));
    }

    // Cabeceras y pies de página (N/Ref, fecha) viven en styles.xml, no en
    // content.xml: también se sustituyen ahí, solo los de texto en línea.
    let estilosXml = new TextDecoder().decode(entradas["styles.xml"]);
    for (const r of RUTAS.filter((d) => d.tipo === "directo" && !d.tabla)) {
        estilosXml = estilosXml.split(`{{${r.markerkey}}}`).join(escXml(String(resolverRuta(json, r.ruta) ?? "")));
    }
    const titulo = textos[ia.findIndex((r) => r.markerkey === "presup.TituloPresupuesto")] ?? "";
    estilosXml = estilosXml.split("{{presup.TituloPresupuesto}}").join(enLinea(titulo));

    const quedan = [...new Set([...(xml.match(/\{\{[^}]+\}\}/g) ?? []), ...(estilosXml.match(/\{\{[^}]+\}\}/g) ?? [])])];
    if (quedan.length > 0) console.log(`  !   marcadores sin resolver: ${quedan.join(", ")}`);

    entradas["content.xml"] = new TextEncoder().encode(xml);
    entradas["styles.xml"] = new TextEncoder().encode(estilosXml);
    const { mimetype, ...resto } = entradas;
    const zip = zipSync({ mimetype: [mimetype, { level: 0 }], ...resto });
    return { odt: aArrayBuffer(zip), titulo, trazas };
}

// ---------------------------------------------------------------------------
// Modo --sin-ia: propuesta fija de la tarifa y textos de ejemplo
// ---------------------------------------------------------------------------

/** Capítulos de la tarifa de los que sale la propuesta fija de cada tipo de trabajo. */
const CAPITULOS_SIN_IA: Record<string, Array<[capitulo: string, cantidad: number]>> = {
    cubiertas: [["06", 30], ["06", 2], ["08", 1]],
    patio_de_luces: [["03", 36], ["05", 180], ["11", 180]],
    bajantes: [["07", 14], ["12", 14]],
};

function propuestaSinIa(modulos: DictadoModulo[]): Propuesta {
    const usadas = new Set<string>();
    const lineas: LineaPropuesta[] = [];
    for (const m of modulos) {
        for (const [capitulo, cantidad] of CAPITULOS_SIN_IA[m.key] ?? []) {
            const partida = listarPartidas().find(
                (p) => p.capitulo === capitulo && !usadas.has(p.codigo) && partidaPermitida(SUBCUENTA, p)
            );
            if (!partida) continue;
            usadas.add(partida.codigo);
            lineas.push({
                id: `sim-${lineas.length + 1}`,
                moduloKey: m.key,
                textoOriginal: m.dictado.slice(0, 80),
                codigo: partida.codigo,
                origen: "tarifa",
                descripcionCorta: partida.descripcionCorta,
                descripcionLarga: partida.descripcionLarga,
                unidad: partida.unidad,
                cantidad: partida.unidad === "ud" ? Math.min(cantidad, 2) : cantidad,
                precioUnitario: partida.tarifaEmpresa,
                precioReferencia: partida.tarifaEmpresa,
                precioCype: null,
                capitulo: partida.capitulo,
                url: null,
                aviso: null,
            });
        }
    }
    return { generadaEn: new Date().toISOString(), lineas, observaciones: [], sugerencias: [] };
}

function seccionEjemplo(markerkey: string, json: JsonDocumento): string {
    if (markerkey === "presup.TituloPresupuesto") {
        return `Rehabilitación de ${json.modulos.map((m) => m.label.toLowerCase()).join(", ")}`;
    }
    return [
        "[TEXTO DE EJEMPLO: con IA este apartado lo redacta el modelo]",
        "",
        `El presente presupuesto tiene por objeto la ejecución de los trabajos descritos en ${json.comunidad.nombre}.`,
        "",
        ...json.modulos.flatMap((m) => [
            `### ${m.label}`,
            ...m.partidas.map((p) => `- ${p.descripcion} (${p.cantidadFormateada} ${p.unidad})`),
            "",
        ]),
    ].join("\n");
}

// ---------------------------------------------------------------------------
// Simulación
// ---------------------------------------------------------------------------

async function main() {
    if (!process.env.ANTHROPIC_API_KEY && !bandera("sin-ia")) {
        console.error(
            "\n  Falta ANTHROPIC_API_KEY. En PowerShell:\n    $env:ANTHROPIC_API_KEY = \"sk-ant-...\"\n  o añádela a .env.local.\n"
        );
        process.exit(1);
    }

    const empresa = SUBCUENTAS[SUBCUENTA].nombre;
    console.log(`\n  Simulación de visita · ${empresa} · ${VISITA.comercial}`);
    console.log(`  ${VISITA.comunidad.nombre} (${VISITA.comunidad.localidad}) · ${VISITA.fechaVisita}`);
    console.log(`  Salida: ${salida}`);

    // --- 1. Dictado -------------------------------------------------------
    paso("1. Dictado del comercial");
    const catalogo = getModulos(SUBCUENTA);
    const modulos: DictadoModulo[] = Object.entries(DICTADOS).map(([key, dictado]) => {
        const m = catalogo.find((x) => x.key === key);
        if (!m) throw new Error(`"${key}" no es un tipo de trabajo de ${SUBCUENTA}. Claves: ${catalogo.map((x) => x.key).join(", ")}`);
        return { key, label: m.label, dictado, fotos: [] };
    });
    for (const m of modulos) console.log(`  ${m.label}: ${m.dictado.slice(0, 90)}…`);

    // --- 2. Propuesta por IA -----------------------------------------------
    paso("2. Propuesta de partidas por IA");
    let t0 = Date.now();
    let propuesta: Propuesta = bandera("sin-ia") ? propuestaSinIa(modulos) : await generarPropuesta(modulos, SUBCUENTA);
    console.log(
        `  ok  ${propuesta.lineas.length} líneas en ${Math.round((Date.now() - t0) / 1000)} s` +
            (bandera("sin-ia") ? " (--sin-ia: partidas fijas de la tarifa, sin IA)" : "")
    );

    const pendientes = propuesta.lineas.filter((l) => l.pendienteCype && l.consulta);
    if (pendientes.length > 0) {
        console.log(`  ..  buscando ${pendientes.length} partida(s) en CYPE (4 a la vez)…`);
        t0 = Date.now();
        const cola = [...pendientes];
        const resueltas = new Map<string, Partial<LineaPropuesta>>();
        await Promise.all(
            Array.from({ length: Math.min(4, cola.length) }, async () => {
                for (let l = cola.shift(); l; l = cola.shift()) {
                    try {
                        const r = await buscarEnCype(l.consulta!, l.capitulo, SUBCUENTA);
                        const previo = l.aviso ? [l.aviso] : [];
                        resueltas.set(
                            l.id,
                            r.encontrado
                                ? {
                                      pendienteCype: false,
                                      codigo: r.codigo,
                                      origen: "cype",
                                      descripcionCorta: r.descripcionCorta,
                                      descripcionLarga: r.descripcionLarga,
                                      unidad: r.unidad,
                                      precioUnitario: r.precioVenta,
                                      precioReferencia: r.precioVenta,
                                      precioCype: r.precioCype,
                                      capitulo: r.capitulo,
                                      url: r.url,
                                      aviso: [...previo, r.aviso].filter(Boolean).join(" · ") || null,
                                  }
                                : { pendienteCype: false, codigo: "", aviso: [...previo, `CYPE: ${r.motivo}`].join(" · ") }
                        );
                    } catch (error) {
                        resueltas.set(l.id, {
                            pendienteCype: false,
                            codigo: "",
                            aviso: `No se ha podido consultar CYPE (${error instanceof Error ? error.message : "error"}).`,
                        });
                    }
                }
            })
        );
        propuesta = { ...propuesta, lineas: propuesta.lineas.map((l) => ({ ...l, ...(resueltas.get(l.id) ?? {}) })) };
        console.log(`  ok  CYPE en ${Math.round((Date.now() - t0) / 1000)} s`);
    }

    for (const l of propuesta.lineas) {
        console.log(
            `  ${l.origen.padEnd(6)} ${(l.codigo || "—").padEnd(9)} ${String(l.cantidad ?? "?").padStart(7)} ${l.unidad.padEnd(3)} ` +
                `${String(l.precioUnitario ?? "?").padStart(9)} €  ${l.descripcionCorta.slice(0, 60)}`
        );
        if (l.aviso) console.log(`         aviso: ${l.aviso}`);
    }
    if (propuesta.observaciones.length) console.log(`  observaciones: ${propuesta.observaciones.join(" | ")}`);
    if (propuesta.sugerencias.length) console.log(`  sugerencias: ${propuesta.sugerencias.join(" | ")}`);
    if (propuesta.avisos?.length) console.log(`  avisos: ${propuesta.avisos.join(" | ")}`);
    guardar("1-propuesta-ia.json", JSON.stringify(propuesta, null, 2));

    // --- 3. Revisión del comercial ------------------------------------------
    paso("3. Revisión del comercial (automática)");
    const incompletas = propuesta.lineas.filter((l) => problemasDeLinea(l).length > 0);
    for (const l of incompletas) {
        console.log(`  -   se quita «${l.descripcionCorta || l.textoOriginal}»: ${problemasDeLinea(l).join(", ")}`);
    }
    propuesta = { ...propuesta, lineas: propuesta.lineas.filter((l) => problemasDeLinea(l).length === 0) };

    for (const c of conflictosDeCodigo(propuesta.lineas)) console.log(`  !   ${c.mensaje}`);

    const modulosElegidos = modulos.map((m) => m.key);
    const validacion = validarPropuesta(propuesta, modulosElegidos, SUBCUENTA);
    if (!validacion.ok) {
        console.error(`\n  ✘ La propuesta no pasa la validación del servidor:\n    ${validacion.errores.join("\n    ")}\n`);
        process.exit(1);
    }
    propuesta = validacion.propuesta;
    console.log(`  ok  ${propuesta.lineas.length} partidas válidas` + (incompletas.length ? ` (${incompletas.length} quitadas)` : ""));

    // --- 4. Payload y motor económico --------------------------------------
    paso("4. Payload canónico y motor económico");
    const payload: PayloadVisita = construirPayload({
        subcuenta: SUBCUENTA,
        empresa,
        comercial: VISITA.comercial,
        comunidadId: "SIM-COMUNIDAD",
        comunidadNombre: VISITA.comunidad.nombre,
        comunidadCreada: false,
        administradorId: "SIM-ADMINISTRADOR",
        administradorNombre: VISITA.administrador.nombre,
        contacto: VISITA.contacto.nombre,
        telefono: VISITA.contacto.telefono,
        fechaVisita: VISITA.fechaVisita,
        observaciones: VISITA.observaciones,
        modulosElegidos,
        seleccion: seleccionVacia,
        fotosPorModulo: {},
        propuesta,
        dictadoPorModulo: DICTADOS,
        imagenPortada: null,
    });
    guardar("2-payload-visita.json", JSON.stringify(payload, null, 2));

    const presupuesto: PresupuestoCalculado = presupuestarConAjustes(payload, null);
    for (const c of presupuesto.capitulos) {
        console.log(`  ${c.codigoJerarquico}  ${c.nombre.padEnd(42)} ${formatearImporte(c.total).padStart(12)} €`);
    }
    console.log(
        `  PEM ${formatearImporte(presupuesto.pem)} € · IVA ${formatearImporte(presupuesto.ivaImporte)} € · ` +
            `TOTAL ${formatearImporte(presupuesto.total)} €`
    );
    for (const a of presupuesto.avisos) console.log(`  ${a.nivel === "atencion" ? "!" : "i"}   ${a.mensaje}`);

    const referencia = `SIM-${marca.slice(0, 8)}-${marca.slice(8)}`;
    const preparado = prepararDocumento(payload, {
        numeroReferencia: referencia,
        comunidadLocalidad: VISITA.comunidad.localidad,
        comunidadProvincia: VISITA.comunidad.provincia,
        administradorLocalidad: VISITA.administrador.localidad,
        presupuesto,
    });
    if (!preparado.ok) {
        console.error(`\n  ✘ El JSON del documento no pasa el pre-vuelo:\n    ${preparado.errores.join("\n    ")}\n`);
        process.exit(1);
    }
    const json = preparado.json;
    guardar("3-json-documento.json", JSON.stringify(json, null, 2));
    console.log(`  ok  JSON del documento (pre-vuelo superado) · referencia ${referencia}`);

    // --- 5. Documento ------------------------------------------------------
    const solucionaConfigurado = Boolean(
        process.env.SOLUCIONA_BASE_URL && process.env.SOLUCIONA_EMAIL && process.env.SOLUCIONA_PASSWORD
    );
    const usarSoluciona = solucionaConfigurado && !bandera("local") && !bandera("sin-ia");
    paso(`5. Documento (${usarSoluciona ? "Soluciona REAL" : "relleno local de la plantilla"})`);

    let odtCrudo: ArrayBuffer;
    let titulo = "";
    const cifras = cifrasDelCalculo(presupuesto);

    if (usarSoluciona) {
        let plantilla;
        try {
            plantilla = await obtenerPlantilla(SUBCUENTA);
        } catch {
            const nombre = SUBCUENTA === "scala-valencia" ? "Plantilla_Presupuesto_Scala.odt" : "Plantilla_Presupuesto_Vertical.odt";
            console.log(`  !   sin SOLUCIONA_PLANTILLA_*_URL: se usa ${nombre} del repo`);
            plantilla = { nombre, contenido: aArrayBuffer(new Uint8Array(readFileSync(join(process.cwd(), nombre)))) };
        }
        const requestId = `${SUBCUENTA}-sim-${marca}`;
        await generarDocumento({ requestId, json, plantilla });
        console.log(`  ..  encolado ${requestId}, esperando (hasta ~3 min)…`);
        const detalle = await esperarResultado(requestId, { intentos: 36, esperaMs: 5000 });
        const veredicto = verificarResultado(detalle, cifras, json);
        guardar("4-soluciona-detalle.json", JSON.stringify(detalle, null, 2));
        if (!veredicto.ok) {
            const errores = "errores" in veredicto ? veredicto.errores : [`estado ${detalle.status}`];
            console.error(`\n  ✘ Soluciona: ${veredicto.motivo}\n    ${errores.join("\n    ")}\n`);
            process.exit(1);
        }
        console.log(`  ok  verificado como en producción · ${tokensConsumidos(detalle)} tokens`);
        titulo =
            (detalle.sectionTraces ?? []).find((t) => t.markerKey === "presup.TituloPresupuesto")?.aiResponse?.trim() ?? "";
        odtCrudo = await descargarOdt(requestId);
    } else {
        if (!solucionaConfigurado) console.log("  i   Soluciona no está configurado en .env.local: relleno local.");
        const local = await rellenarPlantillaLocal(json);
        odtCrudo = local.odt;
        titulo = local.titulo;
        const errores = validarCifras(local.trazas, cifras);
        guardar("4-secciones-ia.md", local.trazas.map((t) => `## ${t.markerKey}\n\n${t.aiResponse}\n`).join("\n"));
        if (errores.length > 0) console.log(`  !   la IA ha escrito cifras que no están en el cálculo:\n      ${errores.join("\n      ")}`);
        else console.log("  ok  secciones de IA sin cifras inventadas");
    }
    console.log(`  título: ${titulo}`);

    // --- 6. Portada, desglose y anexo ---------------------------------------
    paso("6. Portada, desglose y anexo fotográfico");

    const grupos: GrupoFotos[] = [];
    const carpeta = opcion("fotos");
    if (carpeta && existsSync(carpeta)) {
        const porModulo = new Map<string, string[]>();
        const subcarpetas = readdirSync(carpeta).filter((n) => statSync(join(carpeta, n)).isDirectory());
        if (subcarpetas.some((s) => modulosElegidos.includes(s))) {
            for (const key of modulosElegidos) {
                const dir = join(carpeta, key);
                if (existsSync(dir)) porModulo.set(key, readdirSync(dir).filter(esImagen).sort().map((n) => join(dir, n)));
            }
        } else {
            readdirSync(carpeta)
                .filter(esImagen)
                .sort()
                .forEach((n, i) => {
                    const key = modulosElegidos[i % modulosElegidos.length];
                    porModulo.set(key, [...(porModulo.get(key) ?? []), join(carpeta, n)]);
                });
        }
        let numero = 0;
        for (const key of modulosElegidos) {
            const fotos = (porModulo.get(key) ?? [])
                .map(leerImagen)
                .filter((f): f is ImagenPortada => f !== null)
                .map((f) => ({
                    ruta: `Pictures/anexo-${String(++numero).padStart(3, "0")}.${f.mimetype === "image/png" ? "png" : "jpg"}`,
                    ...f,
                }));
            if (fotos.length) grupos.push({ titulo: modulos.find((m) => m.key === key)!.label, fotos });
        }
        console.log(`  ok  anexo: ${grupos.map((g) => `${g.titulo} (${g.fotos.length})`).join(", ") || "sin fotos válidas"}`);
    } else {
        console.log("  i   sin --fotos: el documento sale sin anexo fotográfico");
    }

    const rutaPortada = opcion("portada");
    const imagen = rutaPortada ? leerImagen(rutaPortada) : (grupos[0]?.fotos[0] ?? null);
    if (!imagen) console.log("  i   sin foto de portada (--portada o --fotos): fondo liso");

    const portada = construirPortada(presupuesto, {
        subcuenta: SUBCUENTA,
        titulo,
        comunidad: VISITA.comunidad.nombre,
        localidad: VISITA.comunidad.localidad,
        expediente: referencia,
        fecha: VISITA.fechaVisita.split("-").reverse().join("/"),
        fechaValidez: calcularFechaValidez(VISITA.fechaVisita),
        administrador: VISITA.administrador.nombre,
        administradorLocalidad: VISITA.administrador.localidad,
        imagen: imagen ? { mimetype: imagen.mimetype, datos: imagen.datos, ancho: imagen.ancho, alto: imagen.alto } : null,
        tiposTrabajo: modulos.map((m) => m.label),
    });
    assertPortada(portada, presupuesto);
    const portadaPng = rasterizarSvg(renderizarPortada(portada));
    guardar("5-portada.png", portadaPng);
    console.log(`  ok  portada ${Math.round(portadaPng.length / 1024)} KB (cuadra con el motor)`);

    const odt = postprocesarOdt(odtCrudo, { portadaPng, desglose: presupuesto, anexoFotos: grupos });
    const nombreOdt = `Presupuesto-${referencia}.odt`;
    guardar(nombreOdt, odt);
    console.log(`  ok  ${nombreOdt} (${Math.round(odt.byteLength / 1024)} KB)`);

    // --- 7. PDF --------------------------------------------------------------
    if (!bandera("sin-pdf")) {
        paso("7. PDF");
        const nombrePdf = nombreOdt.replace(/\.odt$/, ".pdf");
        if (conversionDisponible()) {
            guardar(nombrePdf, await convertirAPdf(odt, nombreOdt));
            console.log(`  ok  ${nombrePdf} (Gotenberg)`);
        } else {
            const candidatos = ["soffice", "C:\\Program Files\\LibreOffice\\program\\soffice.exe", "/usr/bin/soffice"];
            let hecho = false;
            for (const bin of candidatos) {
                try {
                    execFileSync(bin, ["--headless", "--convert-to", "pdf", "--outdir", salida, join(salida, nombreOdt)], {
                        stdio: "ignore",
                        timeout: 120_000,
                    });
                    hecho = existsSync(join(salida, nombrePdf));
                    if (hecho) break;
                } catch {
                    // siguiente candidato
                }
            }
            console.log(
                hecho
                    ? `  ok  ${nombrePdf} (LibreOffice)`
                    : "  !   sin GOTENBERG_URL ni LibreOffice: abre el .odt con LibreOffice y exporta a PDF"
            );
        }
    }

    console.log(`\n✔ Simulación terminada. Todo en:\n  ${salida}\n`);
}

main().catch((error) => {
    console.error(`\n  ✘ ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exit(1);
});