import type { CapituloPortada, DatosPortada, PaletaPortada } from "./portada";

/**
 * lib/documentos/portada.svg.ts
 *
 * Render de la infografía de portada. SVG plano, sin librería de gráficos y
 * sin dependencias: el donut son arcos calculados a mano y el resto son
 * rectángulos y textos en coordenadas fijas.
 *
 * Determinista por construcción: mismo `DatosPortada` -> mismo SVG, byte a
 * byte. No hay fechas, ni aleatoriedad, ni orden de iteración de objetos.
 *
 * ---------------------------------------------------------------------------
 * LIENZO
 * ---------------------------------------------------------------------------
 * viewBox 1240x1754 = A4 (210x297 mm) a 150 dpi. Todas las coordenadas van en
 * ese sistema, así que la maqueta no cambia si mañana se rasteriza a 300 dpi:
 * solo se pasa otro ancho de salida.
 *
 * ---------------------------------------------------------------------------
 * TEXTO
 * ---------------------------------------------------------------------------
 * SVG no ajusta texto: no hay salto de línea automático ni elipsis. El ancho
 * se estima a partir del tamaño de fuente y se trunca o se parte a mano. La
 * estimación es aproximada a propósito y va con holgura - vale más una línea
 * que respira que una que se sale del panel.
 *
 * El rasterizador NO hereda las fuentes del sistema. Hay que pasarle el .ttf
 * de la familia declarada aquí; si no la encuentra, sustituye por otra o no
 * pinta el texto. Es el punto que se cierra en H1.
 */

const W = 1240;
const H = 1754;
const M = 60;

const FUENTE = "'DejaVu Sans', 'Liberation Sans', Arial, sans-serif";

/**
 * Anchura por carácter, en múltiplos del tamaño de fuente.
 *
 * Un factor único no vale: los nombres del catálogo vienen en CAJA ALTA
 * ("DEMOLICIONES Y ACTUACIONES PREVIAS") y una mayúscula ocupa un 30 % más que
 * una minúscula. Con un promedio de 0,52 el texto se estimaba corto, no se
 * truncaba, y se montaba encima de la columna de importes.
 */
const ANCHO_ESTRECHO = 0.28; // i l j t f r . , : · ' espacio
const ANCHO_MINUSCULA = 0.54;
const ANCHO_MAYUSCULA = 0.68; // y dígitos
const ANCHO_ANCHO = 0.85; // M W m w
const FACTOR_NEGRITA = 1.06;

const ESTRECHOS = new Set([..." iljtfr.,:;·'’|!()[]-"]);
const ANCHOS = new Set([..."MWmw@%"]);

// ---------------------------------------------------------------------------
// Utilidades de texto
// ---------------------------------------------------------------------------

function esc(texto: string): string {
    return texto
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function anchoCaracter(c: string): number {
    if (ESTRECHOS.has(c)) return ANCHO_ESTRECHO;
    if (ANCHOS.has(c)) return ANCHO_ANCHO;
    if (c >= "A" && c <= "Z") return ANCHO_MAYUSCULA;
    if (c >= "0" && c <= "9") return ANCHO_MAYUSCULA;
    if (c === c.toUpperCase() && c !== c.toLowerCase()) return ANCHO_MAYUSCULA; // Á, Ñ, Ó...
    return ANCHO_MINUSCULA;
}

function anchoDe(texto: string, tamano: number, negrita = false): number {
    let unidades = 0;
    for (const c of texto) unidades += anchoCaracter(c);
    return unidades * tamano * (negrita ? FACTOR_NEGRITA : 1);
}

/** Recorta por caracteres reales hasta que quepa, con puntos suspensivos. */
function truncar(texto: string, maxPx: number, tamano: number, negrita = false): string {
    const limpio = texto.replace(/\s+/g, " ").trim();
    if (anchoDe(limpio, tamano, negrita) <= maxPx) return limpio;

    const anchoPuntos = anchoDe("…", tamano, negrita);
    let corte = 0;
    let acumulado = 0;

    for (const c of limpio) {
        const siguiente = acumulado + anchoCaracter(c) * tamano * (negrita ? FACTOR_NEGRITA : 1);
        if (siguiente + anchoPuntos > maxPx) break;
        acumulado = siguiente;
        corte++;
    }

    return `${limpio.slice(0, Math.max(1, corte)).trimEnd()}…`;
}

/** Parte en líneas por palabras. La última se trunca si sobra texto. */
function envolver(texto: string, maxPx: number, tamano: number, maxLineas: number): string[] {
    const palabras = texto.replace(/\s+/g, " ").trim().split(" ");
    const lineas: string[] = [];
    let actual = "";

    for (const palabra of palabras) {
        const tentativa = actual ? `${actual} ${palabra}` : palabra;
        if (anchoDe(tentativa, tamano) <= maxPx) {
            actual = tentativa;
            continue;
        }
        if (actual) lineas.push(actual);
        actual = palabra;
        if (lineas.length === maxLineas) break;
    }

    if (actual && lineas.length < maxLineas) lineas.push(actual);

    if (lineas.length === maxLineas) {
        const consumido = lineas.join(" ").length;
        if (consumido < texto.replace(/\s+/g, " ").trim().length) {
            lineas[maxLineas - 1] = truncar(`${lineas[maxLineas - 1]}…`, maxPx, tamano);
        }
    }

    return lineas;
}

type OpcionesTexto = {
    tamano?: number;
    color?: string;
    peso?: "normal" | "600" | "bold";
    anclaje?: "start" | "middle" | "end";
    espaciado?: number;
    opacidad?: number;
};

function texto(x: number, y: number, contenido: string, o: OpcionesTexto = {}): string {
    const atributos = [
        `x="${redondear(x)}"`,
        `y="${redondear(y)}"`,
        `font-family="${FUENTE}"`,
        `font-size="${o.tamano ?? 16}"`,
        `fill="${o.color ?? "#ffffff"}"`,
    ];
    if (o.peso && o.peso !== "normal") atributos.push(`font-weight="${o.peso}"`);
    if (o.anclaje && o.anclaje !== "start") atributos.push(`text-anchor="${o.anclaje}"`);
    if (o.espaciado) atributos.push(`letter-spacing="${o.espaciado}"`);
    if (o.opacidad !== undefined) atributos.push(`opacity="${o.opacidad}"`);

    return `<text ${atributos.join(" ")}>${esc(contenido)}</text>`;
}

function rect(
    x: number,
    y: number,
    ancho: number,
    alto: number,
    relleno: string,
    borde?: string,
    radio = 0
): string {
    const atributos = [
        `x="${redondear(x)}"`,
        `y="${redondear(y)}"`,
        `width="${redondear(ancho)}"`,
        `height="${redondear(alto)}"`,
        `fill="${relleno}"`,
    ];
    if (borde) atributos.push(`stroke="${borde}"`, `stroke-width="1"`);
    if (radio) atributos.push(`rx="${radio}"`);
    return `<rect ${atributos.join(" ")}/>`;
}

function linea(x1: number, y1: number, x2: number, y2: number, color: string, grosor = 1): string {
    return (
        `<line x1="${redondear(x1)}" y1="${redondear(y1)}" x2="${redondear(x2)}" y2="${redondear(y2)}" ` +
        `stroke="${color}" stroke-width="${grosor}"/>`
    );
}

/** Sin esto el SVG se llena de coordenadas con 13 decimales de coma flotante. */
function redondear(v: number): number {
    return Math.round(v * 100) / 100;
}

// ---------------------------------------------------------------------------
// Donut
// ---------------------------------------------------------------------------

function punto(cx: number, cy: number, radio: number, grados: number): [number, number] {
    const rad = ((grados - 90) * Math.PI) / 180;
    return [cx + radio * Math.cos(rad), cy + radio * Math.sin(rad)];
}

/**
 * Sector de anillo: arco exterior en sentido horario, arco interior de vuelta.
 *
 * `large-arc-flag` es obligatorio por encima de 180°: sin él, SVG dibuja el
 * arco corto y una porción del 60 % sale del 40 %.
 */
function sector(
    cx: number,
    cy: number,
    rExterior: number,
    rInterior: number,
    desde: number,
    hasta: number,
    color: string
): string {
    const [x1, y1] = punto(cx, cy, rExterior, desde);
    const [x2, y2] = punto(cx, cy, rExterior, hasta);
    const [x3, y3] = punto(cx, cy, rInterior, hasta);
    const [x4, y4] = punto(cx, cy, rInterior, desde);
    const largo = hasta - desde > 180 ? 1 : 0;

    const d = [
        `M ${redondear(x1)} ${redondear(y1)}`,
        `A ${rExterior} ${rExterior} 0 ${largo} 1 ${redondear(x2)} ${redondear(y2)}`,
        `L ${redondear(x3)} ${redondear(y3)}`,
        `A ${rInterior} ${rInterior} 0 ${largo} 0 ${redondear(x4)} ${redondear(y4)}`,
        "Z",
    ].join(" ");

    return `<path d="${d}" fill="${color}"/>`;
}

/**
 * Anillo completo.
 *
 * Con un solo capítulo al 100 % el sector degenera: los dos extremos del arco
 * coinciden y SVG no pinta nada. Ese caso se resuelve con un círculo de trazo
 * grueso, que es exactamente la misma figura.
 */
function donut(
    cx: number,
    cy: number,
    rExterior: number,
    rInterior: number,
    capitulos: readonly CapituloPortada[]
): string {
    const conPeso = capitulos.filter((c) => c.porcentaje > 0);

    if (conPeso.length === 0) return "";

    if (conPeso.length === 1) {
        const grosor = rExterior - rInterior;
        return (
            `<circle cx="${cx}" cy="${cy}" r="${(rExterior + rInterior) / 2}" fill="none" ` +
            `stroke="${conPeso[0].color}" stroke-width="${grosor}"/>`
        );
    }

    const piezas: string[] = [];
    let acumulado = 0;

    for (const c of conPeso) {
        const barrido = (c.porcentaje / 100) * 360;
        piezas.push(sector(cx, cy, rExterior, rInterior, acumulado, acumulado + barrido, c.color));
        acumulado += barrido;
    }

    return piezas.join("\n");
}

// ---------------------------------------------------------------------------
// Bandas
// ---------------------------------------------------------------------------

function cabecera(d: DatosPortada, p: PaletaPortada): string {
    const anchoMarca = anchoDe(d.identidad.nombreMarca, 54, true) + 18;

    return [
        rect(0, 0, W, 14, p.acento),
        texto(M, 112, d.identidad.nombreMarca, { tamano: 54, peso: "bold", color: p.marca }),
        d.identidad.nombreMarcaSecundario
            ? texto(M + anchoMarca + 14, 112, d.identidad.nombreMarcaSecundario, {
                  tamano: 54,
                  peso: "bold",
                  color: p.texto,
              })
            : "",
        texto(M, 143, d.identidad.claim, { tamano: 16, color: p.textoTenue, espaciado: 1.2 }),
        linea(M, 165, W - M, 165, p.acento, 2),
    ].join("\n");
}

function titular(d: DatosPortada, p: PaletaPortada): string {
    const comunidad = `${d.comunidad}  ·  ${d.localidad}`;

    return [
        texto(M, 212, d.antetitulo, { tamano: 16, color: p.textoTenue, espaciado: 2 }),
        texto(M, 260, truncar(d.titulo, W - 2 * M, 36, true), {
            tamano: 36,
            peso: "bold",
            color: p.texto,
        }),
        texto(M, 306, truncar(comunidad, W - 2 * M, 30, true), {
            tamano: 30,
            peso: "bold",
            color: p.acento,
        }),
    ].join("\n");
}

function cajasMeta(d: DatosPortada, p: PaletaPortada): string {
    const campos: Array<[string, string]> = [
        ["EXPEDIENTE", d.expediente],
        ["FECHA", d.fecha],
        ["ADMINISTRADOR", d.administrador],
    ];

    const hueco = 20;
    const ancho = (W - 2 * M - hueco * 2) / 3;

    return campos
        .map(([etiqueta, valor], i) => {
            const x = M + i * (ancho + hueco);
            return [
                rect(x, 336, ancho, 72, p.panel, p.borde, 3),
                texto(x + 16, 362, etiqueta, { tamano: 13, color: p.textoTenue, espaciado: 1 }),
                texto(x + 16, 391, truncar(valor, ancho - 44, 20, true), {
                    tamano: 20,
                    peso: "bold",
                    color: p.texto,
                }),
            ].join("\n");
        })
        .join("\n");
}

function rotulo(y: number, etiqueta: string, p: PaletaPortada): string {
    return [
        texto(M, y, etiqueta, { tamano: 15, color: p.acento, espaciado: 1.8, peso: "600" }),
        linea(M, y + 12, W - M, y + 12, p.borde),
    ].join("\n");
}

function diagnostico(d: DatosPortada, p: PaletaPortada, y0: number): string {
    if (d.diagnostico.length === 0) return "";

    const hueco = 15;
    const ancho = (W - 2 * M - hueco * (d.diagnostico.length - 1)) / d.diagnostico.length;
    const alto = 172;

    return d.diagnostico
        .map((t, i) => {
            const x = M + i * (ancho + hueco);
            const util = ancho - 34;

            // El título va a 3 líneas como máximo: los nombres de capítulo del
            // catálogo son largos y en caja alta ("DEMOLICIONES Y ACTUACIONES
            // PREVIAS" no baja de tres líneas en una tarjeta de 210 px).
            const titulo = envolver(t.titulo, util, 15, 3);
            const cuerpo = envolver(t.texto, util, 12, 2);
            const yTitulo = y0 + 64;
            const yCuerpo = yTitulo + (titulo.length - 1) * 19 + 26;

            return [
                rect(x, y0, ancho, alto, p.panel, p.borde, 3),
                rect(x, y0, 4, alto, p.acento),
                texto(x + 18, y0 + 40, t.ordinal, { tamano: 26, peso: "bold", color: p.acento }),
                ...titulo.map((linea, j) =>
                    texto(x + 18, yTitulo + j * 19, linea, { tamano: 15, peso: "bold", color: p.texto })
                ),
                ...cuerpo.map((linea, j) =>
                    texto(x + 18, yCuerpo + j * 16, linea, { tamano: 12, color: p.textoTenue })
                ),
            ].join("\n");
        })
        .join("\n");
}

/** Alto de la banda económica. Se necesita antes de pintarla, para apilar. */
export function altoEconomia(numeroCapitulos: number): number {
    return numeroCapitulos * altoFila(numeroCapitulos) + 12 + 3 * 38;
}

function altoFila(numeroCapitulos: number): number {
    return numeroCapitulos <= 8 ? 42 : 32;
}

function economia(d: DatosPortada, p: PaletaPortada, y0: number): string {
    const n = d.capitulos.length;
    const fila = altoFila(n);
    const tamano = n <= 8 ? 19 : 16;

    const listaAncho = 640;
    const listaX = M;

    const piezas: string[] = [];

    // --- Listado de capítulos ---
    d.capitulos.forEach((c, i) => {
        const y = y0 + i * fila;
        if (i % 2 === 0) piezas.push(rect(listaX, y, listaAncho, fila, p.panel));
        piezas.push(rect(listaX, y + 6, 3, fila - 12, c.color));
        piezas.push(
            texto(listaX + 16, y + fila / 2 + tamano / 3, c.codigoJerarquico, {
                tamano,
                color: p.textoTenue,
            })
        );
        // El nombre se recorta contra el hueco REAL que deja el importe. Con un
        // ancho fijo, "DEMOLICIONES Y ACTUACIONES PREVIAS" se montaba sobre la
        // columna de la derecha.
        const anchoNombre = listaAncho - 78 - 16 - anchoDe(c.importeFormateado, tamano, true) - 20;
        piezas.push(
            texto(listaX + 78, y + fila / 2 + tamano / 3, truncar(c.nombre, anchoNombre, tamano), {
                tamano,
                color: p.texto,
            })
        );
        piezas.push(
            texto(listaX + listaAncho - 16, y + fila / 2 + tamano / 3, c.importeFormateado, {
                tamano,
                peso: "bold",
                color: p.acento,
                anclaje: "end",
            })
        );
    });

    // --- Cierre económico ---
    const cierreY = y0 + n * fila + 12;
    piezas.push(linea(listaX, cierreY - 6, listaX + listaAncho, cierreY - 6, p.borde));

    const cierre: Array<[string, string, boolean]> = [
        ["PEM (sin IVA)", d.pemFormateado, false],
        [d.ivaEtiqueta, d.ivaFormateado, false],
        ["TOTAL", d.totalFormateado, true],
    ];

    cierre.forEach(([etiqueta, valor, destacado], i) => {
        const y = cierreY + i * 38 + 26;
        piezas.push(
            texto(listaX + 16, y, etiqueta, {
                tamano: destacado ? 22 : 19,
                peso: destacado ? "bold" : "600",
                color: destacado ? p.acento : p.texto,
            })
        );
        piezas.push(
            texto(listaX + listaAncho - 16, y, valor, {
                tamano: destacado ? 22 : 19,
                peso: "bold",
                color: destacado ? p.acento : p.texto,
                anclaje: "end",
            })
        );
    });

    // --- Donut y leyenda ---
    const cx = 1030;
    const cy = y0 + (n * fila) / 2 + 20;
    const rExterior = n <= 8 ? 140 : 132;
    const rInterior = rExterior - 58;

    piezas.push(donut(cx, cy, rExterior, rInterior, d.capitulos));
    piezas.push(
        texto(cx, cy + 4, d.pemAbreviado, { tamano: 34, peso: "bold", color: p.acento, anclaje: "middle" })
    );
    piezas.push(texto(cx, cy + 30, "PEM", { tamano: 15, color: p.textoTenue, anclaje: "middle" }));

    const leyendaX = 716;
    const leyendaAlto = 30;
    const leyendaY = cy - (n * leyendaAlto) / 2 + 10;

    d.capitulos.forEach((c, i) => {
        const y = leyendaY + i * leyendaAlto;
        piezas.push(rect(leyendaX, y - 10, 11, 11, c.color, undefined, 2));
        piezas.push(
            texto(leyendaX + 19, y, truncar(c.nombre, 140, 12), { tamano: 12, color: p.texto })
        );
        piezas.push(
            texto(leyendaX + 19, y + 14, `${formatearPorcentaje(c.porcentaje)} %`, {
                tamano: 12,
                color: p.textoTenue,
            })
        );
    });

    return piezas.join("\n");
}

function formatearPorcentaje(v: number): string {
    return v.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function cronograma(d: DatosPortada, p: PaletaPortada, y0: number): string {
    if (!d.cronograma || d.cronograma.length === 0) return "";

    const total = d.cronograma[d.cronograma.length - 1].diaFin;
    if (total <= 0) return "";

    const ancho = W - 2 * M;
    const alto = 38;
    const piezas: string[] = [rect(M, y0, ancho, alto, p.panel)];

    d.cronograma.forEach((f, i) => {
        const x = M + ((f.diaInicio - 1) / total) * ancho;
        const w = ((f.diaFin - f.diaInicio + 1) / total) * ancho;

        if (i % 2 === 0) piezas.push(rect(x, y0, w, alto, p.acento));

        // Una etiqueta que no cabe en su tramo estorba más de lo que informa.
        if (w >= anchoDe(f.etiqueta, 13) + 10) {
            piezas.push(
                texto(x + w / 2, y0 + alto + 24, f.etiqueta, {
                    tamano: 13,
                    color: p.textoTenue,
                    anclaje: "middle",
                })
            );
        }
    });

    return piezas.join("\n");
}

function cajasPie(d: DatosPortada, p: PaletaPortada, y0: number): string {
    const hueco = 18;
    const ancho = (W - 2 * M - hueco * (d.cajas.length - 1)) / d.cajas.length;

    return d.cajas
        .map((c, i) => {
            const x = M + i * (ancho + hueco);
            return [
                rect(x, y0, ancho, 78, p.panel, p.borde, 3),
                texto(x + ancho / 2, y0 + 34, truncar(c.valor, ancho - 20, 22, true), {
                    tamano: 22,
                    peso: "bold",
                    color: p.texto,
                    anclaje: "middle",
                }),
                texto(x + ancho / 2, y0 + 60, truncar(c.etiqueta, ancho - 20, 14), {
                    tamano: 14,
                    color: p.textoTenue,
                    anclaje: "middle",
                }),
            ].join("\n");
        })
        .join("\n");
}

function pie(d: DatosPortada, p: PaletaPortada): string {
    return [
        linea(M, H - 76, W - M, H - 76, p.acento, 2),
        texto(M, H - 44, d.identidad.pie, { tamano: 15, peso: "bold", color: p.texto }),
        texto(W - M, H - 44, d.identidad.contacto, {
            tamano: 15,
            color: p.textoTenue,
            anclaje: "end",
        }),
    ].join("\n");
}

// ---------------------------------------------------------------------------
// Composición
// ---------------------------------------------------------------------------

/**
 * Devuelve el SVG completo de la portada.
 *
 * No valida: eso lo hace `verificarPortada()` y hay que llamarlo antes. Aquí
 * se da por hecho que los datos ya cuadran con el motor.
 */
export function renderizarPortada(d: DatosPortada): string {
    const p = d.identidad.paleta;

    const yDiagnostico = 470;
    const altoDiagnostico = d.diagnostico.length > 0 ? 172 : 0;

    const yEconomiaRotulo = yDiagnostico + altoDiagnostico + 48;
    const yEconomia = yEconomiaRotulo + 38;
    const finEconomia = yEconomia + altoEconomia(d.capitulos.length);

    const hayCronograma = Boolean(d.cronograma && d.cronograma.length > 0);
    const yCronogramaRotulo = finEconomia + 56;
    const yCronograma = yCronogramaRotulo + 26;
    const finCronograma = hayCronograma ? yCronograma + 38 + 30 : finEconomia;

    const yCajas = finCronograma + 44;

    const cuerpo = [
        rect(0, 0, W, H, p.fondo),
        cabecera(d, p),
        titular(d, p),
        cajasMeta(d, p),
        altoDiagnostico ? rotulo(yDiagnostico - 30, "DIAGNÓSTICO Y FRENTES DE OBRA", p) : "",
        diagnostico(d, p, yDiagnostico),
        rotulo(yEconomiaRotulo, "RESUMEN ECONÓMICO", p),
        economia(d, p, yEconomia),
        hayCronograma ? rotulo(yCronogramaRotulo, "CRONOGRAMA ORIENTATIVO", p) : "",
        cronograma(d, p, yCronograma),
        cajasPie(d, p, yCajas),
        pie(d, p),
    ]
        .filter(Boolean)
        .join("\n");

    return [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
        cuerpo,
        "</svg>",
    ].join("\n");
}