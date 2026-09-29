import type { CapituloPortada, DatosPortada, PaletaPortada } from "./portada";

/**
 * lib/documentos/portada.svg.ts
 *
 * Render de la infografía de portada. SVG plano, sin librería de gráficos y
 * sin dependencias: el donut son arcos calculados a mano y el resto son
 * rectángulos, textos y la foto de portada incrustada en base64.
 *
 * Determinista por construcción: mismo `DatosPortada` -> mismo SVG, byte a
 * byte. No hay fechas, ni aleatoriedad, ni orden de iteración de objetos.
 *
 * ---------------------------------------------------------------------------
 * DISEÑO CON FOTO (29/09/2026)
 * ---------------------------------------------------------------------------
 * De arriba abajo:
 *   - Foto a sangre con degradado; marca arriba, etiquetas, antetítulo y
 *     título abajo, sobre la zona oscura del degradado.
 *   - Banda azul noche: OBRA · CLIENTE · PROPUESTA.
 *   - Dos tarjetas: distribución por capítulos (donut + leyenda) e importe
 *     por partida (barras) + la obra en cifras.
 *   - Base imponible · IVA · Total.
 *   - Pie con marca y contacto.
 *
 * Las tarjetas miden lo que pide su contenido y la foto se queda con el resto
 * de la página (ver `calcularMaqueta`).
 *
 * Sin foto (visita antigua, descarga fallida) el bloque superior se pinta en
 * azul noche con un degradado hacia el acento: la portada sigue siendo válida.
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
 * de la familia declarada aquí (ver rasterizar.ts).
 */

const W = 1240;
const H = 1754;
const M = 60;

/**
 * Alturas fijas de abajo arriba. Las tarjetas miden lo que necesita su
 * contenido (con un mínimo) y la foto se queda con el resto: con pocos
 * capítulos y pocas partidas la foto crece, en vez de dejar huecos en blanco.
 */
const ALTO_BANDA = 136;
const ALTO_TOTALES = 106;
const ALTO_PIE = 60;
const HUECO_BANDA_TARJETAS = 30;
const HUECO_TARJETAS_TOTALES = 26;
const HUECO_TOTALES_PIE = 32;
const ALTO_FOTO_MAXIMO = 820;
const ALTO_TARJETAS_MINIMO = 480;

type Maqueta = {
    altoFoto: number;
    yBanda: number;
    yTarjetas: number;
    altoTarjetas: number;
    yTotales: number;
    yPie: number;
};

const FUENTE = "'DejaVu Sans', 'Liberation Sans', Arial, sans-serif";

/**
 * Anchura por carácter, en múltiplos del tamaño de fuente, para DejaVu Sans
 * (medida sobre los .ttf empaquetados: regular / negrita).
 *
 * Un factor único no vale: los nombres del catálogo vienen en CAJA ALTA
 * ("DEMOLICIONES Y ACTUACIONES PREVIAS") y una mayúscula ocupa más que una
 * minúscula, y la negrita de DejaVu es un 12 % más ancha que la regular. Con
 * un promedio el texto se estimaba corto, no se truncaba, y se montaba encima
 * de la columna de al lado.
 */
const METRICAS = {
    regular: { estrecho: 0.33, minuscula: 0.6, mayuscula: 0.66, digito: 0.64, ancho: 0.93 },
    negrita: { estrecho: 0.39, minuscula: 0.68, mayuscula: 0.74, digito: 0.7, ancho: 1.01 },
} as const;

/** Holgura sobre la medida: vale más una línea que respira que una que se sale. */
const HOLGURA = 1.03;

const ESTRECHOS = new Set([..." iljtfr.,:;·'’|!()[]-/"]);
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

function anchoCaracter(c: string, negrita: boolean): number {
    const m = negrita ? METRICAS.negrita : METRICAS.regular;
    if (ESTRECHOS.has(c)) return m.estrecho;
    if (ANCHOS.has(c)) return m.ancho;
    if (c >= "0" && c <= "9") return m.digito;
    if (c >= "A" && c <= "Z") return m.mayuscula;
    if (c === c.toUpperCase() && c !== c.toLowerCase()) return m.mayuscula; // Á, Ñ, Ó...
    return m.minuscula;
}

function anchoDe(texto: string, tamano: number, negrita = false, espaciado = 0): number {
    let unidades = 0;
    let caracteres = 0;
    for (const c of texto) {
        unidades += anchoCaracter(c, negrita);
        caracteres++;
    }
    return unidades * tamano * HOLGURA + espaciado * caracteres;
}

/** Recorta por caracteres reales hasta que quepa, con puntos suspensivos. */
function truncar(texto: string, maxPx: number, tamano: number, negrita = false): string {
    const limpio = texto.replace(/\s+/g, " ").trim();
    if (anchoDe(limpio, tamano, negrita) <= maxPx) return limpio;

    const anchoPuntos = anchoDe("…", tamano, negrita);
    const caracteres = [...limpio];
    let corte = 0;
    let acumulado = 0;

    for (const c of caracteres) {
        const siguiente = acumulado + anchoCaracter(c, negrita) * tamano * HOLGURA;
        if (siguiente + anchoPuntos > maxPx) break;
        acumulado = siguiente;
        corte++;
    }

    return `${caracteres.slice(0, Math.max(1, corte)).join("").trimEnd()}…`;
}

/**
 * Parte en líneas por palabras. Lo que no cabe en `maxLineas` se acumula en la
 * última, que se trunca con puntos suspensivos.
 */
function envolver(texto: string, maxPx: number, tamano: number, maxLineas: number, negrita = false): string[] {
    const palabras = texto.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    const lineas: string[] = [];
    let actual = "";

    for (const palabra of palabras) {
        const tentativa = actual ? `${actual} ${palabra}` : palabra;
        const esUltima = lineas.length === maxLineas - 1;
        if (!actual || esUltima || anchoDe(tentativa, tamano, negrita) <= maxPx) {
            actual = tentativa;
        } else {
            lineas.push(actual);
            actual = palabra;
        }
    }
    if (actual) lineas.push(actual);

    return lineas.map((l) => truncar(l, maxPx, tamano, negrita));
}

/**
 * "IMPERMEABILIZACIONES Y CUBIERTAS" -> "Impermeabilizaciones y cubiertas".
 * Los nombres del catálogo vienen en caja alta; en la leyenda gritan y no caben.
 */
function aFrase(texto: string): string {
    const limpio = texto.replace(/\s+/g, " ").trim();
    if (limpio === "" || limpio !== limpio.toUpperCase()) return limpio;
    const minusculas = limpio.toLocaleLowerCase("es-ES");
    return minusculas.charAt(0).toLocaleUpperCase("es-ES") + minusculas.slice(1);
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
    radio = 0,
    extra = ""
): string {
    const atributos = [
        `x="${redondear(x)}"`,
        `y="${redondear(y)}"`,
        `width="${redondear(Math.max(0, ancho))}"`,
        `height="${redondear(Math.max(0, alto))}"`,
        `fill="${relleno}"`,
    ];
    if (radio) atributos.push(`rx="${radio}"`);
    if (extra) atributos.push(extra);
    return `<rect ${atributos.join(" ")}/>`;
}

function linea(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    grosor = 1,
    opacidad?: number
): string {
    return (
        `<line x1="${redondear(x1)}" y1="${redondear(y1)}" x2="${redondear(x2)}" y2="${redondear(y2)}" ` +
        `stroke="${color}" stroke-width="${grosor}"${opacidad !== undefined ? ` stroke-opacity="${opacidad}"` : ""}/>`
    );
}

/** Sin esto el SVG se llena de coordenadas con 13 decimales de coma flotante. */
function redondear(v: number): number {
    return Math.round(v * 100) / 100;
}

/** Rótulo de sección: versalitas espaciadas. */
function rotulo(x: number, y: number, etiqueta: string, color: string): string {
    return texto(x, y, etiqueta, { tamano: 15, peso: "bold", color, espaciado: 2.4 });
}

function aBase64(datos: Uint8Array): string {
    return Buffer.from(datos.buffer, datos.byteOffset, datos.byteLength).toString("base64");
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

function formatearPorcentaje(v: number): string {
    return v.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// ---------------------------------------------------------------------------
// Maqueta
// ---------------------------------------------------------------------------

/** Cifras de la obra que caben por fila, y alto de cada caja. */
const CIFRAS_POR_FILA = 2;
const ALTO_CIFRA = 82;
const HUECO_CIFRA = 14;
const FILA_PARTIDA = 58;

function altoCifras(numero: number): number {
    const filas = Math.ceil(numero / CIFRAS_POR_FILA);
    return filas === 0 ? 0 : filas * ALTO_CIFRA + (filas - 1) * HUECO_CIFRA;
}

/** Leyenda holgada (tres líneas por capítulo) hasta 4 capítulos; compacta a partir de 5. */
function leyendaHolgada(numeroCapitulos: number): boolean {
    return numeroCapitulos <= 4;
}

const FILA_LEYENDA_HOLGADA = 104;
const FILA_LEYENDA_COMPACTA = 42;
const FILA_LEYENDA_COMPACTA_MAXIMA = 62;

/** Alto que necesita cada tarjeta y, con eso, dónde cae cada bloque. */
function calcularMaqueta(d: DatosPortada): Maqueta {
    const n = d.capitulos.length;
    const holgada = leyendaHolgada(n);
    const altoIzquierda =
        84 + Math.max(holgada ? 276 : 232, n * (holgada ? FILA_LEYENDA_HOLGADA : FILA_LEYENDA_COMPACTA)) + 36;

    const altoDerecha =
        92 +
        d.partidas.length * FILA_PARTIDA +
        (d.partidasRestantes ? 26 : 0) +
        (d.cifras.length > 0 ? 58 + altoCifras(d.cifras.length) : 0) +
        26;

    const altoFijo =
        ALTO_BANDA + HUECO_BANDA_TARJETAS + HUECO_TARJETAS_TOTALES + ALTO_TOTALES + HUECO_TOTALES_PIE + ALTO_PIE;
    const altoTarjetas = Math.max(altoIzquierda, altoDerecha, ALTO_TARJETAS_MINIMO, H - altoFijo - ALTO_FOTO_MAXIMO);
    const altoFoto = H - altoFijo - altoTarjetas;

    const yBanda = altoFoto;
    const yTarjetas = yBanda + ALTO_BANDA + HUECO_BANDA_TARJETAS;
    const yTotales = yTarjetas + altoTarjetas + HUECO_TARJETAS_TOTALES;
    const yPie = H - ALTO_PIE;

    return { altoFoto, yBanda, yTarjetas, altoTarjetas, yTotales, yPie };
}

// ---------------------------------------------------------------------------
// Bloque superior: foto, marca y título
// ---------------------------------------------------------------------------

function definiciones(p: PaletaPortada, m: Maqueta): string {
    return [
        "<defs>",
        `<clipPath id="recorte-foto"><rect x="0" y="0" width="${W}" height="${m.altoFoto}"/></clipPath>`,
        // Degradado de lectura: oscuro arriba (marca), claro en medio (se ve la
        // obra) y casi opaco abajo (título).
        `<linearGradient id="sombra-foto" x1="0" y1="0" x2="0" y2="1">`,
        `<stop offset="0" stop-color="${p.oscuro}" stop-opacity="0.78"/>`,
        `<stop offset="0.3" stop-color="${p.oscuro}" stop-opacity="0.2"/>`,
        `<stop offset="0.55" stop-color="${p.oscuro}" stop-opacity="0.28"/>`,
        `<stop offset="1" stop-color="${p.oscuro}" stop-opacity="0.96"/>`,
        `</linearGradient>`,
        `<linearGradient id="sin-foto" x1="0" y1="0" x2="1" y2="1">`,
        `<stop offset="0" stop-color="${p.oscuro}"/>`,
        `<stop offset="1" stop-color="${p.acento}"/>`,
        `</linearGradient>`,
        "</defs>",
    ].join("\n");
}

function bloqueFoto(d: DatosPortada, p: PaletaPortada, m: Maqueta): string {
    const piezas: string[] = [];

    if (d.imagen) {
        // `slice` recorta la foto para llenar el hueco sin deformarla, venga
        // apaisada o vertical.
        const uri = `data:${d.imagen.mimetype};base64,${aBase64(d.imagen.datos)}`;
        piezas.push(
            `<image x="0" y="0" width="${W}" height="${m.altoFoto}" preserveAspectRatio="xMidYMid slice" ` +
                `clip-path="url(#recorte-foto)" href="${uri}"/>`
        );
    } else {
        piezas.push(rect(0, 0, W, m.altoFoto, "url(#sin-foto)"));
    }
    piezas.push(rect(0, 0, W, m.altoFoto, "url(#sombra-foto)"));

    // --- Marca ---
    // letter-spacing también se añade tras la última letra: se compensa medio
    // espaciado para que la marca quede centrada de verdad.
    const espaciadoMarca = 12;
    piezas.push(
        texto(W / 2 + espaciadoMarca / 2, 108, d.identidad.nombreMarca, {
            tamano: 50,
            peso: "bold",
            color: p.textoClaro,
            anclaje: "middle",
            espaciado: espaciadoMarca,
        })
    );
    piezas.push(linea(W / 2 - 80, 138, W / 2 + 80, 138, p.textoClaro, 2, 0.9));
    piezas.push(
        texto(W / 2 + 1.2, 178, d.identidad.claim, {
            tamano: 16,
            color: p.textoClaro,
            anclaje: "middle",
            espaciado: 2.4,
            opacidad: 0.88,
        })
    );

    // --- Título, anclado abajo ---
    const tamanoTitulo = 46;
    const interlineado = 56;
    const lineasTitulo = envolver(d.titulo, W - 2 * M, tamanoTitulo, 2, true);
    const yUltima = m.altoFoto - 42;
    const yPrimera = yUltima - (lineasTitulo.length - 1) * interlineado;

    lineasTitulo.forEach((l, i) => {
        piezas.push(
            texto(M, yPrimera + i * interlineado, l, { tamano: tamanoTitulo, peso: "bold", color: p.textoClaro })
        );
    });

    const yAntetitulo = yPrimera - 62;
    piezas.push(
        texto(M, yAntetitulo, d.antetitulo, {
            tamano: 17,
            color: p.textoClaroTenue,
            espaciado: 5,
            peso: "600",
        })
    );

    // --- Etiquetas ---
    const altoEtiqueta = 40;
    const yEtiquetas = yAntetitulo - 34 - altoEtiqueta;
    let x = M;
    for (const e of d.etiquetas) {
        const textoEtiqueta = truncar(e, 360, 16, true);
        const ancho = anchoDe(textoEtiqueta, 16, true) + 36;
        if (x + ancho > W - M) break;
        piezas.push(
            rect(
                x,
                yEtiquetas,
                ancho,
                altoEtiqueta,
                p.oscuro,
                altoEtiqueta / 2,
                `fill-opacity="0.82" stroke="${p.textoClaro}" stroke-opacity="0.28" stroke-width="1"`
            )
        );
        piezas.push(
            texto(x + ancho / 2, yEtiquetas + 26, textoEtiqueta, {
                tamano: 16,
                peso: "bold",
                color: p.textoClaro,
                anclaje: "middle",
            })
        );
        x += ancho + 12;
    }

    return piezas.join("\n");
}

// ---------------------------------------------------------------------------
// Banda: obra · cliente · propuesta
// ---------------------------------------------------------------------------

function banda(d: DatosPortada, p: PaletaPortada, m: Maqueta): string {
    const y0 = m.yBanda;
    // Columnas desiguales a propósito: "Comunidad de Propietarios" en negrita
    // no cabe en un tercio exacto, y la fecha con la validez tampoco va sobrada.
    const anchos = [360, 400, W - 2 * M - 760];
    const cliente = d.administrador ? `Adm.: ${d.administrador}` : d.comunidad;
    const fecha = d.fechaValidez ? `${d.fecha} · Válida hasta ${d.fechaValidez}` : d.fecha;

    const columnas: Array<[string, string, string]> = [
        ["OBRA", d.comunidad, d.localidad],
        ["CLIENTE", "Comunidad de Propietarios", cliente],
        ["PROPUESTA", `Nº ${d.expediente}`, fecha],
    ];

    const piezas: string[] = [rect(0, y0, W, ALTO_BANDA, p.oscuro)];

    let x0 = M;
    columnas.forEach(([etiqueta, valor, detalle], i) => {
        const x = i === 0 ? x0 : x0 + 28;
        const util = anchos[i] - (i === 1 ? 56 : 28);

        if (i > 0) piezas.push(linea(x0, y0 + 30, x0, y0 + ALTO_BANDA - 30, p.textoClaro, 1, 0.18));

        piezas.push(texto(x, y0 + 44, etiqueta, { tamano: 14, color: p.textoClaroTenue, espaciado: 3 }));
        piezas.push(
            texto(x, y0 + 81, truncar(valor, util, 21, true), { tamano: 21, peso: "bold", color: p.textoClaro })
        );
        piezas.push(texto(x, y0 + 109, truncar(detalle, util, 16), { tamano: 16, color: p.textoClaroTenue }));
        x0 += anchos[i];
    });

    return piezas.join("\n");
}

// ---------------------------------------------------------------------------
// Tarjeta izquierda: distribución por capítulos
// ---------------------------------------------------------------------------

function tarjetaCapitulos(d: DatosPortada, p: PaletaPortada, m: Maqueta, x0: number, ancho: number): string {
    const y0 = m.yTarjetas;
    const piezas: string[] = [
        rect(x0, y0, ancho, m.altoTarjetas, p.tarjeta, 18),
        rotulo(x0 + 30, y0 + 52, "DISTRIBUCIÓN POR CAPÍTULOS", p.texto),
    ];

    const n = d.capitulos.length;
    const arriba = y0 + 84;
    const abajo = y0 + m.altoTarjetas - 36;
    const cy = (arriba + abajo) / 2;

    const holgada = leyendaHolgada(n);
    const rExterior = holgada ? 138 : 116;
    const rInterior = holgada ? 92 : 76;
    const cx = x0 + 30 + rExterior;

    piezas.push(donut(cx, cy, rExterior, rInterior, d.capitulos));

    // Centro del donut: la base imponible. Si no cabe entera, abreviada.
    const tamanoCentro = holgada ? 26 : 21;
    const cabeEntero = anchoDe(d.pemFormateado, tamanoCentro, true) <= 2 * rInterior - 18;
    piezas.push(
        texto(cx, cy + 6, cabeEntero ? d.pemFormateado : d.pemAbreviado, {
            tamano: tamanoCentro,
            peso: "bold",
            color: p.texto,
            anclaje: "middle",
        })
    );
    piezas.push(
        texto(cx, cy + 31, "Base imponible", { tamano: holgada ? 14 : 12, color: p.textoTenue, anclaje: "middle" })
    );

    // --- Leyenda ---
    const lx = cx + rExterior + 32;
    const derecha = x0 + ancho - 26;

    if (holgada) {
        // Tres bloques por capítulo: código y %, nombre (2 líneas), importe.
        const yInicio = cy - (n * FILA_LEYENDA_HOLGADA) / 2 + 24;
        d.capitulos.forEach((c, i) => {
            const y = yInicio + i * FILA_LEYENDA_HOLGADA;
            piezas.push(rect(lx, y - 13, 14, 14, c.color, 3));
            piezas.push(texto(lx + 22, y, `Cap. ${c.codigoJerarquico}`, { tamano: 17, peso: "bold", color: p.texto }));
            piezas.push(
                texto(derecha, y, `${formatearPorcentaje(c.porcentaje)} %`, {
                    tamano: 14,
                    color: p.textoTenue,
                    anclaje: "end",
                })
            );
            envolver(aFrase(c.nombre), derecha - lx - 22, 14, 2).forEach((l, j) => {
                piezas.push(texto(lx + 22, y + 24 + j * 18, l, { tamano: 14, color: p.textoTenue }));
            });
            piezas.push(texto(lx + 22, y + 72, c.importeFormateado, { tamano: 19, peso: "bold", color: p.texto }));
        });
    } else {
        // Compacta: código + nombre, y debajo importe y %. La fila crece con el
        // hueco disponible (6 capítulos no van tan apretados como 12).
        const fila = Math.min(FILA_LEYENDA_COMPACTA_MAXIMA, Math.max(FILA_LEYENDA_COMPACTA, (abajo - arriba) / n));
        const tamano = fila >= 52 ? 15 : 13;
        const salto = fila >= 52 ? 20 : 17;
        const yInicio = cy - (n * fila) / 2 + (fila - salto) / 2 + tamano * 0.8;
        d.capitulos.forEach((c, i) => {
            const y = yInicio + i * fila;
            piezas.push(rect(lx, y - tamano + 2, tamano - 2, tamano - 2, c.color, 2));
            const anchoCodigo = anchoDe(c.codigoJerarquico, tamano, true) + 8;
            piezas.push(texto(lx + tamano + 6, y, c.codigoJerarquico, { tamano, peso: "bold", color: p.texto }));
            piezas.push(
                texto(
                    lx + tamano + 6 + anchoCodigo,
                    y,
                    truncar(aFrase(c.nombre), derecha - lx - tamano - 6 - anchoCodigo, tamano),
                    { tamano, color: p.textoTenue }
                )
            );
            piezas.push(
                texto(lx + tamano + 6, y + salto, c.importeFormateado, { tamano, peso: "bold", color: p.texto })
            );
            piezas.push(
                texto(derecha, y + salto, `${formatearPorcentaje(c.porcentaje)} %`, {
                    tamano,
                    color: p.textoTenue,
                    anclaje: "end",
                })
            );
        });
    }

    return piezas.join("\n");
}

// ---------------------------------------------------------------------------
// Tarjeta derecha: importe por partida + la obra en cifras
// ---------------------------------------------------------------------------

function tarjetaPartidas(d: DatosPortada, p: PaletaPortada, m: Maqueta, x0: number, ancho: number): string {
    const y0 = m.yTarjetas;
    const izquierda = x0 + 30;
    const derecha = x0 + ancho - 30;
    const util = derecha - izquierda;

    const piezas: string[] = [
        rect(x0, y0, ancho, m.altoTarjetas, p.tarjeta, 18),
        rotulo(izquierda, y0 + 52, "IMPORTE POR PARTIDA", p.texto),
    ];

    // --- Barras ---
    let y = y0 + 92;
    for (const partida of d.partidas) {
        const anchoImporte = anchoDe(partida.importeFormateado, 16, true);
        const codigo = partida.codigo.trim();
        const anchoCodigo = codigo ? anchoDe(codigo, 16, true) + 14 : 0;

        if (codigo) piezas.push(texto(izquierda, y, codigo, { tamano: 16, peso: "bold", color: p.texto }));
        piezas.push(
            texto(izquierda + anchoCodigo, y, truncar(partida.resumen, util - anchoCodigo - anchoImporte - 18, 15), {
                tamano: 15,
                color: p.textoTenue,
            })
        );
        piezas.push(
            texto(derecha, y, partida.importeFormateado, { tamano: 16, peso: "bold", color: p.texto, anclaje: "end" })
        );
        piezas.push(rect(izquierda, y + 12, util, 12, p.pista, 6));
        piezas.push(rect(izquierda, y + 12, Math.max(12, util * partida.proporcion), 12, partida.color, 6));
        y += FILA_PARTIDA;
    }

    if (d.partidasRestantes) {
        const { numero, importeFormateado } = d.partidasRestantes;
        piezas.push(
            texto(
                izquierda,
                y - 4,
                `+ ${numero} ${numero === 1 ? "partida más" : "partidas más"} · ${importeFormateado}`,
                { tamano: 14, color: p.textoTenue }
            )
        );
        y += 26;
    }

    // --- La obra en cifras, justo debajo de las barras ---
    if (d.cifras.length === 0) return piezas.join("\n");

    const yRotulo = y + 22;
    const yCajas = yRotulo + 22;
    const anchoCaja = (util - HUECO_CIFRA) / CIFRAS_POR_FILA;

    piezas.push(rotulo(izquierda, yRotulo, "LA OBRA EN CIFRAS", p.texto));

    d.cifras.forEach((c, i) => {
        const cx = izquierda + (i % CIFRAS_POR_FILA) * (anchoCaja + HUECO_CIFRA);
        const cy = yCajas + Math.floor(i / CIFRAS_POR_FILA) * (ALTO_CIFRA + HUECO_CIFRA);
        piezas.push(rect(cx, cy, anchoCaja, ALTO_CIFRA, p.fondo, 12));
        piezas.push(
            texto(cx + 20, cy + 40, truncar(c.valor, anchoCaja - 40, 26, true), {
                tamano: 26,
                peso: "bold",
                color: p.texto,
            })
        );
        piezas.push(
            texto(cx + 20, cy + 64, truncar(c.etiqueta, anchoCaja - 40, 14), { tamano: 14, color: p.textoTenue })
        );
    });

    return piezas.join("\n");
}

// ---------------------------------------------------------------------------
// Totales y pie
// ---------------------------------------------------------------------------

function totales(d: DatosPortada, p: PaletaPortada, m: Maqueta): string {
    const y0 = m.yTotales;
    const hueco = 30;
    const anchos = [330, 330, W - 2 * M - 660 - 2 * hueco];
    const cajas: Array<[string, string, boolean]> = [
        ["BASE IMPONIBLE", d.pemFormateado, false],
        [d.ivaEtiqueta.toUpperCase(), d.ivaFormateado, false],
        ["TOTAL (IVA INCLUIDO)", d.totalFormateado, true],
    ];

    const piezas: string[] = [];
    let x = M;
    cajas.forEach(([etiqueta, valor, destacado], i) => {
        const ancho = anchos[i];
        piezas.push(rect(x, y0, ancho, ALTO_TOTALES, destacado ? p.oscuro : p.tarjeta, 16));
        piezas.push(
            texto(x + 28, y0 + 40, etiqueta, {
                tamano: 14,
                color: destacado ? p.textoClaroTenue : p.textoTenue,
                espaciado: 2.4,
            })
        );
        const tamano = destacado ? 36 : 29;
        piezas.push(
            texto(x + 28, y0 + 84, truncar(valor, ancho - 56, tamano, true), {
                tamano,
                peso: "bold",
                color: destacado ? p.textoClaro : p.texto,
            })
        );
        x += ancho + hueco;
    });

    return piezas.join("\n");
}

function pie(d: DatosPortada, p: PaletaPortada, m: Maqueta): string {
    return [
        rect(0, m.yPie, W, ALTO_PIE, p.oscuro),
        texto(M, m.yPie + 37, d.identidad.pie, { tamano: 15, peso: "bold", color: p.textoClaro }),
        texto(W - M, m.yPie + 37, d.identidad.contacto, {
            tamano: 15,
            color: p.textoClaroTenue,
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
    const m = calcularMaqueta(d);
    const anchoIzquierda = 540;
    const hueco = 30;

    const cuerpo = [
        definiciones(p, m),
        rect(0, 0, W, H, p.fondo),
        bloqueFoto(d, p, m),
        banda(d, p, m),
        tarjetaCapitulos(d, p, m, M, anchoIzquierda),
        tarjetaPartidas(d, p, m, M + anchoIzquierda + hueco, W - 2 * M - anchoIzquierda - hueco),
        totales(d, p, m),
        pie(d, p, m),
    ]
        .filter(Boolean)
        .join("\n");

    return [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
        cuerpo,
        "</svg>",
    ].join("\n");
}