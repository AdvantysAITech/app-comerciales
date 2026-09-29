import type { SubcuentaSlug } from "@/lib/subcuenta";
import { aCentimos, formatearImporte, formatearTipoIva, type PresupuestoCalculado } from "./motor";

/**
 * lib/documentos/portada.ts
 *
 * Contrato de datos de la infografía de portada.
 *
 * TODA cifra de este fichero procede de `PresupuestoCalculado`. No se recalcula
 * ningún importe ni se consulta la tarifa: si el motor dice 59.910,60 €, la
 * portada dice 59.910,60 €. Es la misma regla que rige `payloadDocumento.ts`.
 *
 * El presupuesto de referencia del cliente (VP-2026-001) tiene la portada
 * calculada aparte del cuerpo: sus ocho capítulos suman 60.001,85 € en líneas
 * pero imprimen 59.910,60 € en el donut. 91,25 € de desvío que nadie detectó
 * porque la portada nunca se contrastó con el desglose. Aquí no puede pasar:
 * el único input es el objeto que ya pasó `assertCuadre()`.
 *
 * ---------------------------------------------------------------------------
 * CÓDIGOS COMPARTIDOS (decisión de Jacob, 10/09/2026)
 * ---------------------------------------------------------------------------
 * La portada usa `codigoJerarquico` ("1.01", "1.06"...), el mismo que imprime
 * el desglose de capítulos. El documento de referencia renumeraba la portada
 * de 01 a 08 correlativo, así que un administrador veía "04 Revestimientos"
 * arriba y "1.12.08 REVESTIMIENTOS" abajo. Se descarta esa réplica.
 *
 * ---------------------------------------------------------------------------
 * PORTADA CON FOTO (29/09/2026)
 * ---------------------------------------------------------------------------
 * Nuevo diseño: foto de la obra a sangre arriba (la que sube el comercial en
 * "Imagen de portada"), banda oscura con obra / cliente / propuesta, y debajo
 * dos tarjetas claras: distribución por capítulos (donut) e importe por
 * partida (barras) con "la obra en cifras". Cierra con base, IVA y total.
 *
 * Todo lo nuevo sigue siendo DETERMINISTA: las barras y las cifras salen de las
 * líneas que calculó el motor (importe, medición y unidad), nunca de la IA. La
 * única pieza de texto libre sigue siendo el título, que ya titula el cuerpo.
 */

// ---------------------------------------------------------------------------
// Paleta
// ---------------------------------------------------------------------------

export interface PaletaPortada {
    /** Azul noche de la banda, los titulares y la caja del total. */
    oscuro: string;
    /** Color de acento: filetes, subrayados, barras secundarias. */
    acento: string;
    /** Fondo de la página por debajo de la foto. */
    fondo: string;
    /** Relleno de las tarjetas claras. */
    tarjeta: string;
    /** Carril de las barras y filetes suaves sobre tarjeta. */
    pista: string;
    /** Texto sobre fondo claro. */
    texto: string;
    textoTenue: string;
    /** Texto sobre la foto y sobre la banda oscura. */
    textoClaro: string;
    textoClaroTenue: string;
    /**
     * Serie del donut y de las barras. Se recorre cíclicamente: con 12
     * capítulos y 6 colores, el 7 repite el color del 1. Es deliberado - la
     * lectura va por la leyenda, no por el color, que solo separa sectores
     * contiguos.
     */
    serie: readonly string[];
}

/**
 * Branding por subcuenta (DERCAS 5.1). Los datos fiscales completos y el
 * logotipo vectorial los aporta Miguel; hasta entonces la marca va como texto,
 * no como imagen.
 */
export interface IdentidadPortada {
    /** Marca completa en una línea: "SCALA VALENCIA". */
    nombreMarca: string;
    claim: string;
    pie: string;
    contacto: string;
    paleta: PaletaPortada;
}

const IDENTIDAD: Record<SubcuentaSlug, IdentidadPortada> = {
    "vertical-projects": {
        nombreMarca: "VERTICAL PROJECTS",
        claim: "TRABAJOS VERTICALES  ·  ACCESO POR CUERDA  ·  FACHADAS",
        pie: "VERTICAL PROJECTS  ·  Trabajos Verticales y Accesos Especiales",
        contacto: "info@verticalprojects.es   ·   +34 963 858 534",
        paleta: {
            oscuro: "#12233d",
            acento: "#c9a45c",
            fondo: "#ffffff",
            tarjeta: "#eef1f5",
            pista: "#dde3ea",
            texto: "#12233d",
            textoTenue: "#6b7686",
            textoClaro: "#ffffff",
            textoClaroTenue: "#aebbd0",
            serie: ["#12233d", "#c9a45c", "#4a7fbf", "#8aa9d0", "#7c5f2a", "#2d4d7a"],
        },
    },
    "scala-valencia": {
        nombreMarca: "SCALA VALENCIA",
        claim: "REHABILITACIÓN DE EDIFICIOS  ·  RETIRADA DE AMIANTO RERA",
        pie: "SCALA VALENCIA  ·  Rehabilitación y Retirada de Amianto",
        contacto: "info@scalavalencia.es",
        paleta: {
            oscuro: "#13223b",
            acento: "#3d6b9e",
            fondo: "#ffffff",
            tarjeta: "#eef1f5",
            pista: "#dde3ea",
            texto: "#13223b",
            textoTenue: "#6b7686",
            textoClaro: "#ffffff",
            textoClaroTenue: "#aebbd0",
            serie: ["#13223b", "#3d6b9e", "#8fb0d3", "#5c7d99", "#b9c9dc", "#2a4a70"],
        },
    },
};

export function identidadDe(subcuenta: SubcuentaSlug): IdentidadPortada {
    return IDENTIDAD[subcuenta];
}

// ---------------------------------------------------------------------------
// Tipos de salida
// ---------------------------------------------------------------------------

export interface CapituloPortada {
    /** "01".."12". Uso interno para el color de serie. */
    codigo: string;
    /** "1.01".."1.12". Es lo que se imprime, igual que en el desglose. */
    codigoJerarquico: string;
    nombre: string;
    importe: number;
    importeFormateado: string;
    /** Un decimal. La suma de todos es exactamente 100.0. */
    porcentaje: number;
    color: string;
}

/** Barra del bloque "Importe por partida". */
export interface PartidaPortada {
    codigo: string;
    resumen: string;
    importe: number;
    importeFormateado: string;
    /** 0..1 respecto a la partida de mayor importe. */
    proporcion: number;
    /** Color del capítulo al que pertenece. */
    color: string;
}

/** Tarjeta del bloque "Diagnóstico y frentes de obra" (diseño anterior). */
export interface TarjetaPortada {
    ordinal: string;
    titulo: string;
    texto: string;
}

/** Tramo del cronograma orientativo. */
export interface FasePortada {
    etiqueta: string;
    diaInicio: number;
    diaFin: number;
}

/** Caja de cifra: valor grande sobre etiqueta pequeña. */
export interface CajaPortada {
    valor: string;
    etiqueta: string;
}

/**
 * Foto de portada ya descargada. La descarga la hace quien llama
 * (`imagenPortada.ts`): este módulo no hace red.
 */
export interface ImagenPortada {
    mimetype: "image/jpeg" | "image/png";
    datos: Uint8Array;
    ancho: number;
    alto: number;
}

export interface DatosPortada {
    identidad: IdentidadPortada;

    antetitulo: string;
    titulo: string;
    comunidad: string;
    localidad: string;

    expediente: string;
    fecha: string;
    /** "dd/mm/aaaa" o vacío si no se ha podido calcular. */
    fechaValidez: string;
    administrador: string;

    /** `null` = sin foto: el bloque superior se pinta en azul noche. */
    imagen: ImagenPortada | null;
    /** Etiquetas sobre el título ("Cubiertas", "12 partidas"...). */
    etiquetas: string[];

    capitulos: CapituloPortada[];
    /** Las de mayor importe, ya ordenadas. */
    partidas: PartidaPortada[];
    /** Partidas que no caben en la lista y su importe conjunto. */
    partidasRestantes: { numero: number; importeFormateado: string } | null;
    /** "La obra en cifras". */
    cifras: CajaPortada[];

    pemFormateado: string;
    pemAbreviado: string;
    ivaEtiqueta: string;
    ivaFormateado: string;
    totalFormateado: string;

    diagnostico: TarjetaPortada[];
    /** `null` cuando no hay cronograma validado. */
    cronograma: FasePortada[] | null;
    cajas: CajaPortada[];
}

/** Lo que aporta la capa de arriba y no vive en el presupuesto. */
export interface EntradaPortada {
    subcuenta: SubcuentaSlug;
    /** Titular de la obra. Lo genera la IA; hay respaldo si falta. */
    titulo?: string | null;
    comunidad: string;
    localidad: string;
    expediente: string;
    /** Ya formateada en es-ES por `payloadDocumento`. */
    fecha: string;
    /** Fecha de validez ya formateada ("dd/mm/aaaa"). */
    fechaValidez?: string | null;
    administrador: string;
    administradorLocalidad?: string | null;
    /** Foto de portada descargada. Sin ella, fondo liso. */
    imagen?: ImagenPortada | null;
    /** Tipos de trabajo de la visita, para las etiquetas del título. */
    tiposTrabajo?: readonly string[] | null;
    /** Tarjetas de diagnóstico. Si faltan, se derivan de los capítulos. */
    diagnostico?: TarjetaPortada[] | null;
    /** Cronograma YA VALIDADO. Si es null o inválido, no se usa. */
    cronograma?: FasePortada[] | null;
}

// ---------------------------------------------------------------------------
// Porcentajes
// ---------------------------------------------------------------------------

/**
 * Reparto de porcentajes con el resto absorbido por el capítulo mayor.
 *
 * Redondear cada porción por separado deja la suma en 99,9 % o en 100,1 %:
 * con ocho capítulos el error es visible en la leyenda, y en el donut deja un
 * hueco o un solape de un par de grados. Se redondean todos menos uno y ese
 * uno se lleva la diferencia.
 *
 * Absorbe el de mayor importe, no el último: sobre una porción del 36 % un
 * ajuste de 0,1 puntos es invisible, sobre una del 0,4 % la desplaza un 25 %.
 */
export function repartirPorcentajes(importesCent: readonly number[], pemCent: number): number[] {
    if (importesCent.length === 0) return [];
    if (pemCent <= 0) return importesCent.map(() => 0);

    const bruto = importesCent.map((c) => Math.round((c * 1000) / pemCent) / 10);

    let iMayor = 0;
    for (let i = 1; i < importesCent.length; i++) {
        if (importesCent[i] > importesCent[iMayor]) iMayor = i;
    }

    const restoDecimas =
        1000 - bruto.reduce((acc, v, i) => (i === iMayor ? acc : acc + Math.round(v * 10)), 0);

    bruto[iMayor] = Math.round(restoDecimas) / 10;
    return bruto;
}

/** 59910.6 -> "59,9k €" · 1250000 -> "1,25M €" · 840.5 -> "840,50 €" */
export function abreviarImporte(euros: number): string {
    if (euros >= 1_000_000) {
        return `${(Math.round((euros / 1_000_000) * 100) / 100).toLocaleString("es-ES")}M €`;
    }
    if (euros >= 1000) {
        return `${(Math.round(euros / 100) / 10).toLocaleString("es-ES", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
        })}k €`;
    }
    return `${formatearImporte(euros)} €`;
}

// ---------------------------------------------------------------------------
// Respaldos
// ---------------------------------------------------------------------------

/**
 * Tarjetas de diagnóstico derivadas de los capítulos de mayor importe.
 *
 * El diseño con foto ya no las pinta, pero se siguen calculando: los scripts
 * de prueba las comprueban y no cuesta nada mantenerlas.
 */
export function diagnosticoPorDefecto(
    capitulos: readonly CapituloPortada[],
    maximo = 5
): TarjetaPortada[] {
    return [...capitulos]
        .sort((a, b) => b.importe - a.importe)
        .slice(0, maximo)
        .map((c, i) => ({
            ordinal: String(i + 1).padStart(2, "0"),
            titulo: c.nombre,
            texto: `${c.porcentaje.toLocaleString("es-ES", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
            })} % del presupuesto de ejecución material.`,
        }));
}

const CAJAS_POR_DEFECTO: CajaPortada[] = [
    { valor: "2 años", etiqueta: "Garantía de ejecución" },
    { valor: "30 días", etiqueta: "Validez del presupuesto" },
    { valor: "Certificado", etiqueta: "Personal IRATA titulado" },
    { valor: "Incluido", etiqueta: "Gestión residuos RCD" },
];

/** Máximo de barras en "Importe por partida". Más no caben en la tarjeta. */
export const MAXIMO_PARTIDAS_PORTADA = 5;

/** Unidades que dicen algo como cifra de obra ("30 m²"). "1 ud" no dice nada. */
const UNIDADES_MEDIBLES = new Set(["m", "m²", "m³", "kg", "h", "día", "mes"]);

/** 30 -> "30" · 54.5 -> "54,5" · 1250 -> "1.250" */
function formatearMedicion(v: number): string {
    return v.toLocaleString("es-ES", { maximumFractionDigits: 2 });
}

/**
 * "IMPERMEABILIZACIÓN CON MALLA" -> "Impermeabilización con malla".
 * Los resúmenes de la tarifa vienen en caja alta; en una etiqueta pequeña bajo
 * una cifra grande, la caja alta grita y no cabe.
 */
function aFrase(texto: string): string {
    const limpio = texto.replace(/\s+/g, " ").trim();
    if (limpio === "" || limpio !== limpio.toUpperCase()) return limpio;
    const minusculas = limpio.toLocaleLowerCase("es-ES");
    return minusculas.charAt(0).toLocaleUpperCase("es-ES") + minusculas.slice(1);
}

function plural(n: number, singular: string, pluralTexto: string): string {
    return `${n} ${n === 1 ? singular : pluralTexto}`;
}

// ---------------------------------------------------------------------------
// Construcción
// ---------------------------------------------------------------------------

export function construirPortada(
    presupuesto: PresupuestoCalculado,
    entrada: EntradaPortada
): DatosPortada {
    const identidad = identidadDe(entrada.subcuenta);
    const serie = identidad.paleta.serie;

    const importesCent = presupuesto.capitulos.map((c) => aCentimos(c.total));
    const porcentajes = repartirPorcentajes(importesCent, aCentimos(presupuesto.pem));

    const capitulos: CapituloPortada[] = presupuesto.capitulos.map((c, i) => ({
        codigo: c.codigo,
        codigoJerarquico: c.codigoJerarquico,
        nombre: c.nombre,
        importe: c.total,
        importeFormateado: `${formatearImporte(c.total)} €`,
        porcentaje: porcentajes[i],
        color: serie[i % serie.length],
    }));

    // --- Partidas: todas las líneas, por importe descendente ---------------
    // El orden es estable a igualdad de importe (orden del documento), así el
    // SVG sigue siendo determinista.
    const lineas = presupuesto.capitulos.flatMap((c, i) =>
        c.lineas.map((l, j) => ({ l, color: serie[i % serie.length], orden: i * 1000 + j }))
    );
    const porImporte = [...lineas].sort((a, b) => b.l.importe - a.l.importe || a.orden - b.orden);
    const mayor = porImporte[0]?.l.importe ?? 0;

    const partidas: PartidaPortada[] = porImporte.slice(0, MAXIMO_PARTIDAS_PORTADA).map(({ l, color }) => ({
        codigo: l.codigo,
        resumen: aFrase(l.resumen),
        importe: l.importe,
        importeFormateado: `${formatearImporte(l.importe)} €`,
        proporcion: mayor > 0 ? l.importe / mayor : 0,
        color,
    }));

    const restantes = porImporte.slice(MAXIMO_PARTIDAS_PORTADA);
    const partidasRestantes =
        restantes.length > 0
            ? {
                  numero: restantes.length,
                  importeFormateado: `${formatearImporte(
                      restantes.reduce((acc, r) => acc + aCentimos(r.l.importe), 0) / 100
                  )} €`,
              }
            : null;

    // --- La obra en cifras: mediciones reales + datos del presupuesto -------
    const cifras: CajaPortada[] = porImporte
        .filter(({ l }) => UNIDADES_MEDIBLES.has(l.unidad) || (l.unidad === "ud" && l.cantidad > 1))
        .slice(0, 2)
        .map(({ l }) => ({ valor: `${formatearMedicion(l.cantidad)} ${l.unidad}`, etiqueta: aFrase(l.resumen) }));

    const numeroPartidas = lineas.length;
    const relleno: CajaPortada[] = [
        {
            valor: plural(numeroPartidas, "partida", "partidas"),
            etiqueta: `en ${plural(capitulos.length, "capítulo", "capítulos")}`,
        },
        { valor: "30 días", etiqueta: "validez del presupuesto" },
        { valor: "2 años", etiqueta: "garantía de ejecución" },
    ];
    for (const caja of relleno) {
        if (cifras.length >= 4) break;
        cifras.push(caja);
    }

    // --- Etiquetas sobre el título -----------------------------------------
    const cronogramaValido =
        validarCronograma(entrada.cronograma).length === 0 ? entrada.cronograma ?? null : null;

    const tipos = [...new Set((entrada.tiposTrabajo ?? []).map((t) => t.trim()).filter(Boolean))];
    const etiquetas: string[] = tipos.slice(0, 3);
    if (tipos.length > 3) etiquetas.push(`+${tipos.length - 3}`);
    if (cronogramaValido && cronogramaValido.length > 0) {
        etiquetas.push(`Plazo ${plural(cronogramaValido[cronogramaValido.length - 1].diaFin, "día", "días")}`);
    }
    if (etiquetas.length === 0) {
        etiquetas.push(plural(numeroPartidas, "partida", "partidas"), plural(capitulos.length, "capítulo", "capítulos"));
    }

    const administrador = entrada.administradorLocalidad
        ? `${entrada.administrador} · ${entrada.administradorLocalidad}`
        : entrada.administrador;

    return {
        identidad,

        antetitulo: "PRESUPUESTO DE OBRA",
        titulo: entrada.titulo?.trim() || "Propuesta de intervención",
        comunidad: entrada.comunidad,
        localidad: entrada.localidad,

        expediente: entrada.expediente,
        fecha: entrada.fecha,
        fechaValidez: entrada.fechaValidez?.trim() ?? "",
        administrador,

        imagen: entrada.imagen ?? null,
        etiquetas,

        capitulos,
        partidas,
        partidasRestantes,
        cifras,

        pemFormateado: `${formatearImporte(presupuesto.pem)} €`,
        pemAbreviado: abreviarImporte(presupuesto.pem),
        ivaEtiqueta: `IVA ${formatearTipoIva(presupuesto.ivaTipo)} %`,
        ivaFormateado: `${formatearImporte(presupuesto.ivaImporte)} €`,
        totalFormateado: `${formatearImporte(presupuesto.total)} €`,

        diagnostico:
            entrada.diagnostico && entrada.diagnostico.length > 0
                ? entrada.diagnostico.slice(0, 5)
                : diagnosticoPorDefecto(capitulos),

        cronograma: cronogramaValido,

        cajas: CAJAS_POR_DEFECTO,
    };
}

// ---------------------------------------------------------------------------
// Verificación
// ---------------------------------------------------------------------------

/**
 * Comprueba que la portada dice lo mismo que el motor.
 *
 * Se llama SIEMPRE antes de renderizar. Una portada que no cuadra no se pinta:
 * es preferible publicar el documento sin infografía que con una que
 * contradice su propio desglose.
 */
export function verificarPortada(
    portada: DatosPortada,
    presupuesto: PresupuestoCalculado
): string[] {
    const fallos: string[] = [];

    if (portada.capitulos.length !== presupuesto.capitulos.length) {
        fallos.push(
            `La portada tiene ${portada.capitulos.length} capítulos y el presupuesto ${presupuesto.capitulos.length}.`
        );
        return fallos;
    }

    for (const [i, c] of portada.capitulos.entries()) {
        const origen = presupuesto.capitulos[i];
        if (c.codigoJerarquico !== origen.codigoJerarquico) {
            fallos.push(
                `Capítulo ${i}: la portada dice "${c.codigoJerarquico}" y el presupuesto "${origen.codigoJerarquico}".`
            );
        }
        if (aCentimos(c.importe) !== aCentimos(origen.total)) {
            fallos.push(
                `Capítulo ${c.codigoJerarquico}: importe ${c.importe} € != ${origen.total} € del motor.`
            );
        }
    }

    const sumaDecimas = portada.capitulos.reduce((acc, c) => acc + Math.round(c.porcentaje * 10), 0);
    if (sumaDecimas !== 1000) {
        fallos.push(`Los porcentajes suman ${sumaDecimas / 10} %, no 100 %.`);
    }

    for (const c of portada.capitulos) {
        if (c.porcentaje < 0) {
            fallos.push(`Capítulo ${c.codigoJerarquico}: porcentaje negativo (${c.porcentaje}).`);
        }
    }

    // Las barras tienen que ser líneas reales del motor, con su importe.
    const importesMotor = new Map<string, number[]>();
    for (const c of presupuesto.capitulos) {
        for (const l of c.lineas) {
            importesMotor.set(l.codigo, [...(importesMotor.get(l.codigo) ?? []), aCentimos(l.importe)]);
        }
    }
    for (const p of portada.partidas) {
        if (!(importesMotor.get(p.codigo) ?? []).includes(aCentimos(p.importe))) {
            fallos.push(`Partida ${p.codigo}: importe ${p.importe} € no es ninguna línea del motor.`);
        }
    }

    if (portada.pemFormateado !== `${formatearImporte(presupuesto.pem)} €`) {
        fallos.push(`PEM de portada "${portada.pemFormateado}" != ${presupuesto.pem} € del motor.`);
    }
    if (portada.totalFormateado !== `${formatearImporte(presupuesto.total)} €`) {
        fallos.push(`TOTAL de portada "${portada.totalFormateado}" != ${presupuesto.total} € del motor.`);
    }

    fallos.push(...validarCronograma(portada.cronograma));

    return fallos;
}

/**
 * Reglas del cronograma. Vacío = válido (o no hay, o está bien).
 *
 * El cronograma lo propone la IA, así que se trata como entrada no fiable:
 * tramos contiguos, sin solapes ni huecos, arrancando en el día 1. Un
 * cronograma que se contradice a sí mismo no se usa.
 */
export function validarCronograma(fases: readonly FasePortada[] | null | undefined): string[] {
    if (!fases || fases.length === 0) return [];

    const fallos: string[] = [];
    let esperado = 1;

    for (const [i, f] of fases.entries()) {
        if (!Number.isInteger(f.diaInicio) || !Number.isInteger(f.diaFin)) {
            fallos.push(`Cronograma, tramo ${i + 1}: días no enteros (${f.diaInicio}-${f.diaFin}).`);
            continue;
        }
        if (f.diaFin < f.diaInicio) {
            fallos.push(`Cronograma, tramo ${i + 1}: termina (${f.diaFin}) antes de empezar (${f.diaInicio}).`);
        }
        if (f.diaInicio !== esperado) {
            fallos.push(
                `Cronograma, tramo ${i + 1}: empieza el día ${f.diaInicio} y el anterior terminó el ${esperado - 1}.`
            );
        }
        esperado = f.diaFin + 1;
    }

    return fallos;
}

/** Igual que `verificarPortada` pero lanza. Para scripts y pruebas. */
export function assertPortada(portada: DatosPortada, presupuesto: PresupuestoCalculado): void {
    const fallos = verificarPortada(portada, presupuesto);
    if (fallos.length) {
        throw new Error(`La portada no cuadra:\n${fallos.map((f) => `  - ${f}`).join("\n")}`);
    }
}