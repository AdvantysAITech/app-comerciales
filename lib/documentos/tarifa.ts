/**
 * lib/documentos/tarifa.ts
 *
 * Capa de acceso al catálogo de tarifa congelado (data/tarifa/tarifa-2026.json).
 *
 * El catálogo se genera off-line con scripts/tarifa/extraer-tarifa.mjs a partir
 * del Excel del cliente y se commitea al repo. En runtime NUNCA se lee el Excel:
 * el JSON es la única fuente de precios de la aplicación.
 *
 * Reglas de negocio (acordadas 31/08/2026):
 *  - Fuente de verdad: hoja RESUMEN del Excel.
 *  - tarifaEmpresa = precioCype * 1,25. El margen incluye la comisión del
 *    administrador (DERCAS 7.2). No se aplican GG ni BI adicionales.
 *  - El precio que se imprime en el documento es SIEMPRE tarifaEmpresa.
 *    precioCype se conserva solo para análisis interno de rentabilidad.
 *  - El comercial puede etiquetar la medición como "ud" o "m²" con
 *    independencia de la unidad nativa de la partida. Esa elección afecta
 *    únicamente a la etiqueta impresa: el precio unitario aplicado es el
 *    mismo en ambos casos. Ver `resolverUnidadImpresa`.
 */

import catalogoJson from "@/data/tarifa/tarifa-2026.json";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Catálogo cerrado de unidades nativas del banco de precios. */
export const UNIDADES = ["ud", "m", "m²", "m³", "h", "kg", "día", "mes"] as const;
export type Unidad = (typeof UNIDADES)[number];

/** Unidades que el comercial puede seleccionar en el formulario. */
export const UNIDADES_SELECCIONABLES = ["ud", "m²"] as const;
export type UnidadSeleccionable = (typeof UNIDADES_SELECCIONABLES)[number];

export interface CapituloTarifa {
  /** Código de dos dígitos: "01".."12". */
  codigo: string;
  /** Numeración jerárquica del documento: "1.01".."1.12". */
  codigoJerarquico: string;
  nombre: string;
}

export interface PartidaTarifa {
  /** Código del banco de precios: "DEM001", "CER001"... */
  codigo: string;
  /** Numeración jerárquica del documento: "1.08.01". */
  codigoJerarquico: string;
  /** Código de capítulo al que pertenece ("08"). */
  capitulo: string;
  /** Posición dentro del capítulo, 1-indexada. */
  orden: number;
  descripcionCorta: string;
  /** Descripción larga. `null` hasta que se resuelva el bloque de generación. */
  descripcionLarga: string | null;
  unidad: Unidad;
  /** Precio CYPE base, sin margen. Uso interno, NO se imprime. */
  precioCype: number;
  /** Precio de venta. Es el que se imprime y con el que se calcula. */
  tarifaEmpresa: number;
  /** Si no es null, es una anomalía aceptada conscientemente por el cliente. */
  excepcionAceptada: string | null;
}

export interface MetaTarifa {
  version: string;
  generadoEl: string;
  hojaFuente: string;
  margenEmpresa: number;
  ivaPorDefecto: number;
  fuentePrecios: string;
  empresas: string[];
  nota: string;
}

export interface CatalogoTarifa {
  meta: MetaTarifa;
  capitulos: CapituloTarifa[];
  partidas: PartidaTarifa[];
  avisos: { codigo: string; motivo: string }[];
}

// ---------------------------------------------------------------------------
// Carga e índices
// ---------------------------------------------------------------------------

export const catalogo = catalogoJson as unknown as CatalogoTarifa;

const porCodigo: ReadonlyMap<string, PartidaTarifa> = new Map(
  catalogo.partidas.map((p) => [p.codigo, p])
);

const capituloPorCodigo: ReadonlyMap<string, CapituloTarifa> = new Map(
  catalogo.capitulos.map((c) => [c.codigo, c])
);

const partidasPorCapitulo: ReadonlyMap<string, PartidaTarifa[]> = (() => {
  const m = new Map<string, PartidaTarifa[]>();
  for (const c of catalogo.capitulos) m.set(c.codigo, []);
  for (const p of catalogo.partidas) m.get(p.capitulo)?.push(p);
  for (const lista of m.values()) lista.sort((a, b) => a.orden - b.orden);
  return m;
})();

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export function obtenerPartida(codigo: string): PartidaTarifa | undefined {
  return porCodigo.get(codigo.trim().toUpperCase());
}

/**
 * Igual que `obtenerPartida` pero lanza si el código no existe.
 * Úsalo en el motor económico: una partida inexistente es un fallo de mapeo,
 * no un caso a tolerar en silencio.
 */
export function obtenerPartidaOFallar(codigo: string): PartidaTarifa {
  const p = obtenerPartida(codigo);
  if (!p) {
    throw new Error(
      `Partida "${codigo}" no existe en el catálogo de tarifa ${catalogo.meta.version}. ` +
        `Revisa lib/documentos/mapeo-capitulos.ts.`
    );
  }
  return p;
}

export function obtenerCapitulo(codigo: string): CapituloTarifa | undefined {
  return capituloPorCodigo.get(codigo.trim());
}

export function partidasDeCapitulo(codigoCapitulo: string): PartidaTarifa[] {
  return partidasPorCapitulo.get(codigoCapitulo.trim()) ?? [];
}

export function listarCapitulos(): CapituloTarifa[] {
  return [...catalogo.capitulos];
}

export function listarPartidas(): PartidaTarifa[] {
  return [...catalogo.partidas];
}

/** Búsqueda simple por texto, para el selector del formulario. */
export function buscarPartidas(texto: string, limite = 25): PartidaTarifa[] {
  const q = texto.trim().toLowerCase();
  if (!q) return [];
  const terminos = q.split(/\s+/);
  return catalogo.partidas
    .filter((p) => {
      const heno = `${p.codigo} ${p.descripcionCorta}`.toLowerCase();
      return terminos.every((t) => heno.includes(t));
    })
    .slice(0, limite);
}

/**
 * Resuelve la unidad que se imprime en el documento.
 *
 * El comercial elige "ud" o "m²". Esa elección NO cambia el precio unitario:
 * el importe es siempre cantidad x tarifaEmpresa. Solo cambia la etiqueta.
 *
 * DESVIACIÓN REGISTRADA (anexo DERCAS, 31/08/2026): en partidas cuya unidad
 * nativa es m, m³, h, kg, día o mes (52 de 199), la etiqueta impresa no
 * coincidirá con la unidad real de medición. En un presupuesto contradictorio
 * esto puede generar discusión en el ajuste de mediciones en obra.
 * Decisión de Jacob: se acepta.
 */
export function resolverUnidadImpresa(
  partida: PartidaTarifa,
  seleccion: UnidadSeleccionable | null | undefined
): Unidad {
  return seleccion ?? partida.unidad;
}

/** Devuelve true si la etiqueta elegida difiere de la unidad nativa. */
export function unidadDivergente(
  partida: PartidaTarifa,
  seleccion: UnidadSeleccionable | null | undefined
): boolean {
  return !!seleccion && seleccion !== partida.unidad;
}

/**
 * Texto de ayuda para el formulario: muestra al comercial contra qué está
 * multiplicando. No se imprime en el documento.
 */
export function ayudaPrecioBase(partida: PartidaTarifa): string {
  const precio = partida.tarifaEmpresa
    .toFixed(2)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `base: ${precio} €/${partida.unidad}`;
}