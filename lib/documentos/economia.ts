export const IVA_POR_DEFECTO = 21;

/** Céntimos. Trabajar en enteros evita el arrastre de los flotantes. */
export type Centimos = number;

/** Una partida ya valorada, lista para entrar en un capítulo. */
export type PartidaValorada = {
    /** Ruta del catálogo. Trazabilidad hacia la visita. */
    ruta: string;
    /** Código del banco de precios. Pendiente del catálogo de Miguel. */
    codigo: string;
    /** Texto para la columna RESUMEN. */
    descripcion: string;
    unidad: string;
    cantidad: number;
    precioUnitario: Centimos;
};

export type CapituloCalculado = {
    codigo: string;
    nombre: string;
    partidas: readonly PartidaValoradaConImporte[];
    total: Centimos;
    /** Peso sobre el PEM, en tanto por ciento. */
    porcentaje: number;
};

export type PartidaValoradaConImporte = PartidaValorada & { importe: Centimos };

export type Economia = {
    capitulos: readonly CapituloCalculado[];
    pem: Centimos;
    porcentajeIva: number;
    importeIva: Centimos;
    total: Centimos;
};

// --- Formato ------------------------------------------------------------

/**
 * Número en formato español, siempre con dos decimales y sin unidad.
 *
 * SIN símbolo a propósito: la plantilla escribe " €" pegado al markerkey.
 * Devolverlo aquí produce "12.450,00 € €" (comprobado en TEST-001).
 */
export function formatearImporte(centimos: Centimos): string {
    // Agrupación manual y no toLocaleString(): el es-ES de Intl omite el punto
    // de millar en los números de cuatro cifras ("5398,88"), lo que en un
    // presupuesto convive con "12.450,00" y queda incoherente. Aquí se agrupa
    // siempre, que es lo que espera un banco de precios.
    const negativo = centimos < 0;
    const absoluto = Math.abs(centimos);
    const entero = Math.trunc(absoluto / 100);
    const decimales = String(absoluto % 100).padStart(2, "0");
    const agrupado = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${negativo ? "-" : ""}${agrupado},${decimales}`;
}

/** Cantidad de medición: sin decimales si es entera, coma decimal si no. */
export function formatearCantidadMedicion(cantidad: number): string {
    return Number.isInteger(cantidad)
        ? String(cantidad)
        : cantidad.toLocaleString("es-ES", { maximumFractionDigits: 2 });
}

/** Peso de un capítulo sobre el PEM: siempre con un decimal ("94,8"). */
export function formatearPorcentaje(valor: number): string {
    return valor.toFixed(1).replace(".", ",");
}

/**
 * Tipo de IVA. Sin decimales cuando es entero: la plantilla imprime "IVA 21 %",
 * y "IVA 21,0 %" chirría en un documento que va al administrador.
 */
export function formatearPorcentajeIva(valor: number): string {
    return Number.isInteger(valor) ? String(valor) : formatearPorcentaje(valor);
}

// --- Cálculo ------------------------------------------------------------

/**
 * Importe de una partida. Redondeo al céntimo en el último paso.
 *
 * `precioUnitario` está en céntimos y `cantidad` puede tener decimales
 * (18,5 ml), así que el producto se redondea explícitamente en lugar de
 * arrastrar fracciones de céntimo hasta el total.
 */
export function importePartida(partida: PartidaValorada): Centimos {
    return Math.round(partida.precioUnitario * partida.cantidad);
}

/**
 * Agrupa partidas valoradas en capítulos y calcula los totales.
 *
 * OJO a la asimetría estructural: el catálogo se organiza por MÓDULO (zona del
 * edificio) y el presupuesto por CAPÍTULO. Un módulo alimenta varios capítulos y
 * un capítulo recibe partidas de varios módulos. Esa correspondencia la resuelve
 * `mapeo-capitulos.ts`, no este fichero: aquí las partidas llegan ya asignadas.
 */
export function calcularEconomia(
    partidasPorCapitulo: ReadonlyMap<string, { nombre: string; partidas: readonly PartidaValorada[] }>,
    porcentajeIva: number = IVA_POR_DEFECTO
): Economia {
    const capitulosSinPorcentaje = [...partidasPorCapitulo.entries()].map(([codigo, datos]) => {
        const partidas = datos.partidas.map((p) => ({ ...p, importe: importePartida(p) }));
        const total = partidas.reduce((suma, p) => suma + p.importe, 0);
        return { codigo, nombre: datos.nombre, partidas, total };
    });

    const pem = capitulosSinPorcentaje.reduce((suma, c) => suma + c.total, 0);

    const capitulos: CapituloCalculado[] = capitulosSinPorcentaje.map((c) => ({
        ...c,
        porcentaje: pem === 0 ? 0 : (c.total / pem) * 100,
    }));

    const importeIva = Math.round((pem * porcentajeIva) / 100);

    return { capitulos, pem, porcentajeIva, importeIva, total: pem + importeIva };
}

// --- Render de tablas ---------------------------------------------------

/**
 * Fila Markdown CON pipe de cierre.
 *
 * El pipe final es OBLIGATORIO: sin el, el conversor no reconoce el bloque como
 * tabla y lo imprime como texto plano con pipes a la vista. Verificado sobre un
 * documento real, y es la diferencia entre TEST-006 (con pipe, salio
 * <table:table>) y la primera version de este render (sin pipe, salio texto).
 *
 * El efecto secundario conocido es una columna vacia a la derecha, porque el
 * conversor cuenta el pipe de cierre como separador. Se absorbe: una columna de
 * sobra es un defecto cosmetico, una tabla sin renderizar es un presupuesto
 * inservible.
 */
function fila(celdas: readonly string[]): string {
    return `| ${celdas.map(escaparCelda).join(" | ")} |`;
}

/** El pipe dentro de una celda rompería la tabla. Se sustituye por "/". */
function escaparCelda(texto: string): string {
    return texto.replace(/\|/g, "/").replace(/\n/g, " ").trim();
}

/**
 * Tabla del markerkey `presup.ResumenCapitulos`.
 * Columnas: CÓDIGO | CAPÍTULO | IMPORTE | %
 */
export function renderResumenCapitulos(economia: Economia): string {
    const lineas = [
        fila(["CÓDIGO", "CAPÍTULO", "IMPORTE", "%"]),
        "|---|---|---:|---:|",
    ];

    for (const capitulo of economia.capitulos) {
        lineas.push(
            fila([
                capitulo.codigo,
                capitulo.nombre,
                formatearImporte(capitulo.total),
                `${formatearPorcentaje(capitulo.porcentaje)} %`,
            ])
        );
    }

    return lineas.join("\n");
}

/**
 * Tabla del markerkey `presup.ResumenPresupuesto`.
 * Capítulos en mayúsculas más las tres filas de cierre en negrita.
 */
export function renderResumenPresupuesto(economia: Economia): string {
    const lineas = [fila(["CÓDIGO", "CAPÍTULO", "IMPORTE"]), "|---|---|---:|"];

    for (const capitulo of economia.capitulos) {
        lineas.push(fila([capitulo.codigo, capitulo.nombre.toUpperCase(), formatearImporte(capitulo.total)]));
    }

    // SIN negrita. El conversor Markdown -> ODF procesa `**` correctamente en
    // texto corrido (ObjetoYAlcance sale en AI-Bold), pero DENTRO DE UNA CELDA
    // de tabla anula el contenido: la celda sale vacia. Verificado sobre un
    // documento real: las tres filas de total salieron en blanco.
    //
    // Un presupuesto sin totales es un fallo grave, asi que se sacrifica el
    // resalte. Si Miguel lo quiere en negrita, se resuelve con un estilo en la
    // plantilla, nunca con Markdown.
    lineas.push(fila(["", "TOTAL PEM", formatearImporte(economia.pem)]));
    lineas.push(
        fila([
            "",
            `IVA ${formatearPorcentajeIva(economia.porcentajeIva)} %`,
            formatearImporte(economia.importeIva),
        ])
    );
    lineas.push(fila(["", "TOTAL PRESUPUESTO (IVA INCLUIDO)", formatearImporte(economia.total)]));

    return lineas.join("\n");
}

/**
 * Todas las cifras que el cálculo considera válidas.
 *
 * Alimenta `validarCifras()`: cualquier importe que aparezca en el texto de una
 * sección de IA y no esté en esta lista es una invención del modelo.
 */
export function cifrasDelCalculo(economia: Economia): string[] {
    const cifras = new Set<string>();

    cifras.add(formatearImporte(economia.pem));
    cifras.add(formatearImporte(economia.importeIva));
    cifras.add(formatearImporte(economia.total));

    for (const capitulo of economia.capitulos) {
        cifras.add(formatearImporte(capitulo.total));
        for (const partida of capitulo.partidas) {
            cifras.add(formatearImporte(partida.importe));
            cifras.add(formatearImporte(partida.precioUnitario));
        }
    }

    return [...cifras];
}