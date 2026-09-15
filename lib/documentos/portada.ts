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
 */

// ---------------------------------------------------------------------------
// Paleta
// ---------------------------------------------------------------------------

export interface PaletaPortada {
    /** Fondo de la página. */
    fondo: string;
    /** Paneles y cajas sobre el fondo. */
    panel: string;
    /** Borde de paneles y filetes. */
    borde: string;
    /** Color de marca. Titulares y filete superior. */
    marca: string;
    /** Color de acento. Importes destacados y subrayados. */
    acento: string;
    texto: string;
    textoTenue: string;
    /**
     * Serie del donut. Se recorre cíclicamente: con 12 capítulos y 4 colores,
     * el capítulo 5 repite el color del 1. Es deliberado - la lectura va por
     * la leyenda, no por el color, que solo separa sectores contiguos.
     */
    serie: readonly string[];
}

/**
 * Branding por subcuenta (DERCAS 5.1). Los datos fiscales completos y el
 * logotipo vectorial los aporta Miguel; hasta entonces el pie lleva los datos
 * de contacto y la marca va como texto, no como imagen.
 */
export interface IdentidadPortada {
    nombreMarca: string;
    /** Segunda mitad del logotipo, en peso normal. Puede ir vacía. */
    nombreMarcaSecundario: string;
    claim: string;
    pie: string;
    contacto: string;
    paleta: PaletaPortada;
}

const IDENTIDAD: Record<SubcuentaSlug, IdentidadPortada> = {
    "vertical-projects": {
        nombreMarca: "VERTICAL",
        nombreMarcaSecundario: "PROJECTS",
        claim: "TRABAJOS VERTICALES  ·  ACCESO POR CUERDA  ·  FACHADAS",
        pie: "VERTICAL PROJECTS  ·  Trabajos Verticales y Accesos Especiales",
        contacto: "info@verticalprojects.es   ·   +34 963 858 534",
        paleta: {
            fondo: "#12233d",
            panel: "#1b3355",
            borde: "#2d4d7a",
            marca: "#d9b168",
            acento: "#d9b168",
            texto: "#ffffff",
            textoTenue: "#9fb3cc",
            serie: ["#d9b168", "#4a7fbf", "#8aa9d0", "#c08f3e"],
        },
    },
    "scala-valencia": {
        nombreMarca: "SCALA",
        nombreMarcaSecundario: "VALENCIA",
        claim: "REHABILITACIÓN  ·  IMPERMEABILIZACIÓN  ·  AMIANTO RERA",
        pie: "SCALA VALENCIA  ·  Rehabilitación y Retirada de Amianto",
        contacto: "info@scalavalencia.es",
        paleta: {
            fondo: "#12233d",
            panel: "#1b3355",
            borde: "#2d4d7a",
            marca: "#d9b168",
            acento: "#d9b168",
            texto: "#ffffff",
            textoTenue: "#9fb3cc",
            serie: ["#d9b168", "#4a7fbf", "#8aa9d0", "#c08f3e"],
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

/** Tarjeta del bloque "Diagnóstico y frentes de obra". */
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

/** Caja del pie: valor grande sobre etiqueta pequeña. */
export interface CajaPortada {
    valor: string;
    etiqueta: string;
}

export interface DatosPortada {
    identidad: IdentidadPortada;

    antetitulo: string;
    titulo: string;
    comunidad: string;
    localidad: string;

    expediente: string;
    fecha: string;
    administrador: string;

    capitulos: CapituloPortada[];

    pemFormateado: string;
    pemAbreviado: string;
    ivaEtiqueta: string;
    ivaFormateado: string;
    totalFormateado: string;

    diagnostico: TarjetaPortada[];
    /** `null` cuando no hay cronograma validado. La banda no se pinta. */
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
    administrador: string;
    administradorLocalidad?: string | null;
    /** Tarjetas de diagnóstico. Si faltan, se derivan de los capítulos. */
    diagnostico?: TarjetaPortada[] | null;
    /** Cronograma YA VALIDADO. Si es null o inválido, la banda no se pinta. */
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
 * Es el respaldo cuando la IA no ha respondido, y también lo que se pinta
 * mientras ese bloque no exista. No inventa nada: son los capítulos que el
 * motor ya calculó, ordenados por peso económico.
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

// ---------------------------------------------------------------------------
// Construcción
// ---------------------------------------------------------------------------

export function construirPortada(
    presupuesto: PresupuestoCalculado,
    entrada: EntradaPortada
): DatosPortada {
    const identidad = identidadDe(entrada.subcuenta);

    const importesCent = presupuesto.capitulos.map((c) => aCentimos(c.total));
    const porcentajes = repartirPorcentajes(importesCent, aCentimos(presupuesto.pem));

    const capitulos: CapituloPortada[] = presupuesto.capitulos.map((c, i) => ({
        codigo: c.codigo,
        codigoJerarquico: c.codigoJerarquico,
        nombre: c.nombre,
        importe: c.total,
        importeFormateado: `${formatearImporte(c.total)} €`,
        porcentaje: porcentajes[i],
        color: identidad.paleta.serie[i % identidad.paleta.serie.length],
    }));

    const administrador = entrada.administradorLocalidad
        ? `${entrada.administrador} · ${entrada.administradorLocalidad}`
        : entrada.administrador;

    return {
        identidad,

        antetitulo: "PROPUESTA TÉCNICA DE OBRA",
        titulo: entrada.titulo?.trim() || "Propuesta de intervención",
        comunidad: entrada.comunidad,
        localidad: entrada.localidad,

        expediente: entrada.expediente,
        fecha: entrada.fecha,
        administrador,

        capitulos,

        pemFormateado: `${formatearImporte(presupuesto.pem)} €`,
        pemAbreviado: abreviarImporte(presupuesto.pem),
        ivaEtiqueta: `IVA ${formatearTipoIva(presupuesto.ivaTipo)} %`,
        ivaFormateado: `${formatearImporte(presupuesto.ivaImporte)} €`,
        totalFormateado: `${formatearImporte(presupuesto.total)} €`,

        diagnostico:
            entrada.diagnostico && entrada.diagnostico.length > 0
                ? entrada.diagnostico.slice(0, 5)
                : diagnosticoPorDefecto(capitulos),

        cronograma: validarCronograma(entrada.cronograma).length === 0 ? entrada.cronograma ?? null : null,

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
 * cronograma que se contradice a sí mismo no se pinta.
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