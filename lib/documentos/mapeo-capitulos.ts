import type { PayloadVisita } from "@/lib/visita/payload";
import { calcularEconomia, type Economia, type PartidaValorada } from "./economia";

/**
 * Correspondencia entre el catálogo de captura y los capítulos del presupuesto.
 *
 * Aquí se resuelve la asimetría estructural del proyecto: el catálogo se
 * organiza por MÓDULO (zona del edificio: cubiertas, fachada, bajantes) porque
 * es como recorre el edificio el comercial, y el presupuesto se organiza por
 * CAPÍTULO (actuaciones previas, impermeabilización, medios auxiliares) porque
 * es como lo lee un administrador y como se compara con un banco de precios.
 *
 * No es una relación 1:1. Un módulo alimenta varios capítulos y un capítulo
 * recibe partidas de varios módulos: el andamio de Cubiertas y el andamio de
 * Fachada principal caen los dos en "Medios auxiliares".
 *
 * ============================ BLOQUEADO ============================
 * TABLA_PARTIDAS está VACÍA a propósito. Los códigos de capítulo, los códigos
 * de partida del banco de precios y los precios unitarios los tiene que aportar
 * Miguel en la sesión de alimentación de datos (DERCAS 6.3 y 12.5).
 *
 * No se inventan precios ni códigos: un presupuesto con importes plausibles
 * pero falsos es peor que uno que no se genera, porque nadie lo detecta hasta
 * que el administrador lo firma.
 *
 * Mientras la tabla esté vacía, `presupuestar()` lanza un error que enumera
 * exactamente qué partidas faltan. Eso ES el entregable de la sesión con
 * Miguel: la lista de rutas que hay que valorar.
 * ===================================================================
 */

export type EntradaCatalogoPrecios = {
    /** Código de la partida en el banco de precios (p. ej. "E27PL040"). */
    codigo: string;
    /** Código del capítulo al que pertenece (p. ej. "01"). */
    capituloCodigo: string;
    /** Nombre del capítulo tal como debe salir impreso. */
    capituloNombre: string;
    /** Precio unitario EN CÉNTIMOS. Entero, nunca decimal. */
    precioCentimos: number;
    /**
     * Descripción técnica larga para la columna RESUMEN del desglose.
     * Si viene informada, el prompt la usa tal cual y no la reescribe: es la
     * forma de sacar a la IA de encima el texto que ya está normalizado.
     */
    descripcion?: string;
};

/**
 * Clave: `ruta` de la partida en el catálogo (contrato estable, no renombrar).
 * Valor: su ficha económica.
 *
 * PENDIENTE DE MIGUEL. Ejemplo de la forma esperada:
 *
 *   "cubiertas.impermeabilizacion.epdm": {
 *       codigo: "E10ATE030",
 *       capituloCodigo: "03",
 *       capituloNombre: "Impermeabilización",
 *       precioCentimos: 4210,
 *       descripcion: "Impermeabilización de cubierta con lámina de EPDM...",
 *   },
 */
export const TABLA_PARTIDAS: Record<string, EntradaCatalogoPrecios> = {};

/** Orden de los capítulos en el documento. PENDIENTE DE MIGUEL. */
export const ORDEN_CAPITULOS: readonly string[] = [];

export class PreciosPendientesError extends Error {
    constructor(public readonly rutasSinPrecio: readonly string[]) {
        super(
            `No se puede presupuestar: ${rutasSinPrecio.length} partida(s) sin precio en el catálogo. ` +
                `Pendiente de la sesión de alimentación de datos con Miguel (DERCAS 6.3).\n` +
                rutasSinPrecio.map((r) => `  - ${r}`).join("\n")
        );
        this.name = "PreciosPendientesError";
    }
}

/** Rutas del payload que no tienen ficha económica. */
export function rutasSinPrecio(payload: PayloadVisita): string[] {
    return payload.modulos
        .flatMap((m) => m.partidas)
        .map((p) => p.ruta)
        .filter((ruta) => !TABLA_PARTIDAS[ruta]);
}

/**
 * Convierte la visita en economía calculada.
 *
 * Reagrupa por capítulo (no por módulo) y delega el cálculo en `economia.ts`.
 * Lanza si falta el precio de cualquier partida: mejor no generar que generar
 * un presupuesto incompleto sin que nadie lo note.
 */
export function presupuestar(payload: PayloadVisita, porcentajeIva?: number): Economia {
    const faltantes = rutasSinPrecio(payload);
    if (faltantes.length > 0) throw new PreciosPendientesError(faltantes);

    const porCapitulo = new Map<string, { nombre: string; partidas: PartidaValorada[] }>();

    for (const modulo of payload.modulos) {
        for (const partida of modulo.partidas) {
            const ficha = TABLA_PARTIDAS[partida.ruta];

            const valorada: PartidaValorada = {
                ruta: partida.ruta,
                codigo: ficha.codigo,
                // La descripción normalizada del catálogo manda sobre el camino
                // del árbol: es la que está redactada para salir impresa.
                descripcion: ficha.descripcion ?? partida.camino.join(" > "),
                unidad: partida.unidad ?? "",
                cantidad: partida.cantidad ?? 0,
                precioUnitario: ficha.precioCentimos,
            };

            const grupo = porCapitulo.get(ficha.capituloCodigo);
            if (grupo) grupo.partidas.push(valorada);
            else porCapitulo.set(ficha.capituloCodigo, { nombre: ficha.capituloNombre, partidas: [valorada] });
        }
    }

    // Orden explícito del documento. Los capítulos no listados van al final,
    // por código, para que añadir uno nuevo no lo esconda.
    const ordenados = new Map(
        [...porCapitulo.entries()].sort(([a], [b]) => {
            const ia = ORDEN_CAPITULOS.indexOf(a);
            const ib = ORDEN_CAPITULOS.indexOf(b);
            if (ia === -1 && ib === -1) return a.localeCompare(b);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        })
    );

    return calcularEconomia(ordenados, porcentajeIva);
}