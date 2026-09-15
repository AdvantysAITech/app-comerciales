/**
 * lib/documentos/motor.ts
 *
 * Motor económico del presupuesto. Cálculo 100% determinista en TypeScript.
 *
 * NINGÚN importe de este fichero lo produce un LLM. Los presupuestos son
 * documentos precontractuales: mismo input -> mismo output, siempre.
 *
 * ---------------------------------------------------------------------------
 * REGLAS DE CÁLCULO (acordadas con Jacob, 31/08/2026)
 * ---------------------------------------------------------------------------
 *  1. importe de línea    = redondear2(cantidad x tarifaEmpresa)
 *  2. total de capítulo   = suma de importes de línea YA redondeados
 *  3. PEM                 = suma de totales de capítulo
 *  4. IVA                 = redondear2(PEM x 10%)
 *  5. TOTAL               = PEM + IVA
 *
 *  Consecuencia buscada: el documento cuadra siempre. El presupuesto de
 *  referencia del cliente no cuadraba en 5 de sus 8 capítulos porque los
 *  totales venían de otra fuente que las líneas.
 *
 *  No se aplican GG ni BI: el margen del 25% ya está dentro de tarifaEmpresa,
 *  e incluye la comisión del administrador (DERCAS 7.2).
 *
 * ---------------------------------------------------------------------------
 * ARITMÉTICA
 * ---------------------------------------------------------------------------
 *  Todo el cálculo interno se hace en CÉNTIMOS ENTEROS. Sumar floats acumula
 *  deriva: 0.1 + 0.2 !== 0.3, y `640.05 * 100` es 64004.99999999999 en
 *  IEEE-754. En un presupuesto de 60.000 € con 40 líneas, esa deriva se ve.
 *  Se convierte a euros una sola vez, al construir la salida.
 */

import {
  obtenerPartidaOFallar,
  obtenerCapitulo,
  listarCapitulos,
  resolverUnidadImpresa,
  unidadDivergente,
  catalogo,
  type PartidaTarifa,
  type Unidad,
  type UnidadSeleccionable,
} from "./tarifa";

// ---------------------------------------------------------------------------
// Tipos de entrada
// ---------------------------------------------------------------------------

export interface LineaSolicitada {
  /** Código del catálogo de tarifa: "DEM001", "CER001"... */
  codigo: string;
  /** Medición introducida por el comercial. Debe ser > 0. */
  cantidad: number;
  /**
   * Etiqueta elegida por el comercial en el formulario. Afecta solo al texto
   * impreso: el precio unitario aplicado es siempre tarifaEmpresa.
   */
  unidadSeleccionada?: UnidadSeleccionable | null;
  /**
   * Descripción larga. La inyecta la capa de generación de textos.
   * Si es null, el documento imprime solo la descripción corta.
   */
  descripcionLarga?: string | null;
}

export interface EntradaPresupuesto {
  lineas: LineaSolicitada[];
  /** Tipo de IVA en tanto por uno. Por defecto 0.10 (acordado 31/08/2026). */
  ivaTipo?: number;
}

// ---------------------------------------------------------------------------
// Tipos de salida
// ---------------------------------------------------------------------------

export interface LineaCalculada {
  codigo: string;
  codigoJerarquico: string;
  /** Título en negrita de la fila. */
  resumen: string;
  descripcionLarga: string | null;
  /** Unidad que se imprime. Puede diferir de la nativa. */
  unidad: Unidad;
  /** Unidad real del banco de precios. No se imprime; sirve para avisos. */
  unidadNativa: Unidad;
  /** true si la etiqueta impresa no coincide con la unidad nativa. */
  unidadDivergente: boolean;
  cantidad: number;
  precioUnitario: number;
  importe: number;
  /** Uso interno para análisis de rentabilidad. NO se imprime. */
  interno: { precioCype: number; importeCype: number; margen: number };
}

export interface CapituloCalculado {
  codigo: string;
  codigoJerarquico: string;
  nombre: string;
  lineas: LineaCalculada[];
  total: number;
}

export type NivelAviso = "info" | "atencion";

export interface AvisoCalculo {
  nivel: NivelAviso;
  codigo: string;
  mensaje: string;
}

export interface PresupuestoCalculado {
  capitulos: CapituloCalculado[];
  pem: number;
  ivaTipo: number;
  ivaImporte: number;
  total: number;
  /** Métricas internas de rentabilidad. NO se imprimen en el documento. */
  interno: { costeCype: number; margenTotal: number; margenPorcentaje: number };
  avisos: AvisoCalculo[];
  meta: { versionTarifa: string; calculadoEn: string };
}

// ---------------------------------------------------------------------------
// Aritmética en céntimos
// ---------------------------------------------------------------------------

/** Euros -> céntimos enteros, con redondeo half-up robusto frente a IEEE-754. */
export function aCentimos(euros: number): number {
  return Math.round((euros + Number.EPSILON) * 100);
}

/** Céntimos enteros -> euros con 2 decimales exactos. */
export function aEuros(centimos: number): number {
  return Math.round(centimos) / 100;
}

/**
 * cantidad (decimal) x precio (euros) -> céntimos enteros.
 * La cantidad puede tener decimales (54,50 m²), así que se multiplica sobre
 * el precio en céntimos y se redondea una sola vez.
 */
function importeEnCentimos(cantidad: number, precioEuros: number): number {
  return Math.round(cantidad * aCentimos(precioEuros));
}

// ---------------------------------------------------------------------------
// Normalización de entrada
// ---------------------------------------------------------------------------

interface LineaAgregada {
  partida: PartidaTarifa;
  cantidad: number;
  unidadSeleccionada: UnidadSeleccionable | null;
  descripcionLarga: string | null;
}

/**
 * Agrega líneas repetidas del mismo código sumando mediciones.
 *
 * Motivo: una visita puede tocar varias zonas del edificio (medianeras y
 * fachada trasera) que mapean a la misma partida. En el documento debe
 * aparecer una sola fila con la medición total, no dos filas idénticas.
 */
function agregarLineas(
  lineas: LineaSolicitada[],
  avisos: AvisoCalculo[]
): LineaAgregada[] {
  const mapa = new Map<string, LineaAgregada>();

  for (const [i, l] of lineas.entries()) {
    const codigo = String(l.codigo ?? "").trim().toUpperCase();

    if (!codigo) {
      throw new Error(`Línea ${i}: código vacío.`);
    }
    if (!Number.isFinite(l.cantidad)) {
      throw new Error(`[${codigo}] Cantidad no numérica: ${l.cantidad}`);
    }
    if (l.cantidad <= 0) {
      throw new Error(
        `[${codigo}] Cantidad debe ser mayor que 0 (recibido: ${l.cantidad}). ` +
          `Si la partida no aplica, no la incluyas en el presupuesto.`
      );
    }

    const partida = obtenerPartidaOFallar(codigo);
    const existente = mapa.get(codigo);

    if (!existente) {
      mapa.set(codigo, {
        partida,
        cantidad: l.cantidad,
        unidadSeleccionada: l.unidadSeleccionada ?? null,
        descripcionLarga: l.descripcionLarga ?? null,
      });
      continue;
    }

    // Agregación
    existente.cantidad += l.cantidad;
    avisos.push({
      nivel: "info",
      codigo,
      mensaje: `Mediciones agregadas en una sola línea. Total: ${existente.cantidad}.`,
    });

    const nuevaUnidad = l.unidadSeleccionada ?? null;
    if (nuevaUnidad && existente.unidadSeleccionada && nuevaUnidad !== existente.unidadSeleccionada) {
      avisos.push({
        nivel: "atencion",
        codigo,
        mensaje:
          `Unidades incompatibles al agregar: "${existente.unidadSeleccionada}" y ` +
          `"${nuevaUnidad}". Se conserva "${existente.unidadSeleccionada}". Revisa la medición.`,
      });
    }
    existente.unidadSeleccionada ??= nuevaUnidad;
    existente.descripcionLarga ??= l.descripcionLarga ?? null;
  }

  return [...mapa.values()];
}

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------

export function calcularPresupuesto(entrada: EntradaPresupuesto): PresupuestoCalculado {
  const avisos: AvisoCalculo[] = [];
  const ivaTipo = entrada.ivaTipo ?? catalogo.meta.ivaPorDefecto ?? 0.1;

  if (!Number.isFinite(ivaTipo) || ivaTipo < 0 || ivaTipo > 1) {
    throw new Error(`Tipo de IVA inválido: ${ivaTipo}. Se espera tanto por uno (0.10 = 10%).`);
  }
  if (!Array.isArray(entrada.lineas) || entrada.lineas.length === 0) {
    throw new Error("El presupuesto no contiene ninguna línea.");
  }

  const agregadas = agregarLineas(entrada.lineas, avisos);

  // Agrupación por capítulo
  const porCapitulo = new Map<string, LineaAgregada[]>();
  for (const a of agregadas) {
    const lista = porCapitulo.get(a.partida.capitulo) ?? [];
    lista.push(a);
    porCapitulo.set(a.partida.capitulo, lista);
  }

  const capitulos: CapituloCalculado[] = [];
  let pemCentimos = 0;
  let costeCypeCentimos = 0;

  // Recorrido en el orden del catálogo: el documento sigue siempre la misma
  // secuencia de capítulos, con independencia del orden de captura.
  for (const cap of listarCapitulos()) {
    const agregadasCap = porCapitulo.get(cap.codigo);
    if (!agregadasCap || agregadasCap.length === 0) continue;

    // Dentro del capítulo, orden del catálogo (no de captura).
    agregadasCap.sort((a, b) => a.partida.orden - b.partida.orden);

    const lineas: LineaCalculada[] = [];
    let totalCapCentimos = 0;

    for (const a of agregadasCap) {
      const p = a.partida;

      const impCent = importeEnCentimos(a.cantidad, p.tarifaEmpresa);
      const cypeCent = importeEnCentimos(a.cantidad, p.precioCype);

      totalCapCentimos += impCent;
      costeCypeCentimos += cypeCent;

      const divergente = unidadDivergente(p, a.unidadSeleccionada);
      if (divergente) {
        avisos.push({
          nivel: "atencion",
          codigo: p.codigo,
          mensaje:
            `Se imprime "${a.unidadSeleccionada}" pero la unidad real de medición es ` +
            `"${p.unidad}" (${p.tarifaEmpresa} €/${p.unidad}). Desviación aceptada; ` +
            `revisable en el ajuste de mediciones en obra.`,
        });
      }

      if (p.excepcionAceptada) {
        avisos.push({
          nivel: "info",
          codigo: p.codigo,
          mensaje: `Partida con excepción de tarifa registrada: ${p.excepcionAceptada}`,
        });
      }

      lineas.push({
        codigo: p.codigo,
        codigoJerarquico: p.codigoJerarquico,
        resumen: p.descripcionCorta,
        descripcionLarga: a.descripcionLarga ?? p.descripcionLarga ?? null,
        unidad: resolverUnidadImpresa(p, a.unidadSeleccionada),
        unidadNativa: p.unidad,
        unidadDivergente: divergente,
        cantidad: a.cantidad,
        precioUnitario: p.tarifaEmpresa,
        importe: aEuros(impCent),
        interno: {
          precioCype: p.precioCype,
          importeCype: aEuros(cypeCent),
          margen: aEuros(impCent - cypeCent),
        },
      });
    }

    pemCentimos += totalCapCentimos;

    capitulos.push({
      codigo: cap.codigo,
      codigoJerarquico: cap.codigoJerarquico,
      nombre: cap.nombre,
      lineas,
      total: aEuros(totalCapCentimos),
    });
  }

  const ivaCentimos = Math.round(pemCentimos * ivaTipo);
  const totalCentimos = pemCentimos + ivaCentimos;
  const margenCentimos = pemCentimos - costeCypeCentimos;

  return {
    capitulos,
    pem: aEuros(pemCentimos),
    ivaTipo,
    ivaImporte: aEuros(ivaCentimos),
    total: aEuros(totalCentimos),
    interno: {
      costeCype: aEuros(costeCypeCentimos),
      margenTotal: aEuros(margenCentimos),
      margenPorcentaje:
        costeCypeCentimos > 0
          ? Math.round((margenCentimos / costeCypeCentimos) * 10000) / 100
          : 0,
    },
    avisos,
    meta: {
      versionTarifa: catalogo.meta.version,
      calculadoEn: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Verificación aritmética
// ---------------------------------------------------------------------------

/**
 * Comprueba que el presupuesto cuadra de arriba abajo.
 *
 * Se llama SIEMPRE antes de enviar el payload a Soluciona y sobre el
 * resultado devuelto. Es la red que evita que salga un documento firmado
 * con un total que no es la suma de sus partes.
 */
export function verificarCuadre(p: PresupuestoCalculado): string[] {
  const fallos: string[] = [];

  let pemEsperado = 0;
  for (const cap of p.capitulos) {
    const suma = cap.lineas.reduce((acc, l) => acc + aCentimos(l.importe), 0);
    if (suma !== aCentimos(cap.total)) {
      fallos.push(
        `Capítulo ${cap.codigoJerarquico}: total ${cap.total} € != suma de líneas ${aEuros(suma)} €`
      );
    }
    pemEsperado += aCentimos(cap.total);
  }

  if (pemEsperado !== aCentimos(p.pem)) {
    fallos.push(`PEM ${p.pem} € != suma de capítulos ${aEuros(pemEsperado)} €`);
  }

  const ivaEsperado = Math.round(aCentimos(p.pem) * p.ivaTipo);
  if (ivaEsperado !== aCentimos(p.ivaImporte)) {
    fallos.push(
      `IVA ${p.ivaImporte} € != ${p.pem} x ${p.ivaTipo} = ${aEuros(ivaEsperado)} €`
    );
  }

  const totalEsperado = aCentimos(p.pem) + aCentimos(p.ivaImporte);
  if (totalEsperado !== aCentimos(p.total)) {
    fallos.push(`TOTAL ${p.total} € != PEM + IVA = ${aEuros(totalEsperado)} €`);
  }

  return fallos;
}

/** Igual que `verificarCuadre` pero lanza. Úsalo en la ruta de generación. */
export function assertCuadre(p: PresupuestoCalculado): void {
  const fallos = verificarCuadre(p);
  if (fallos.length) {
    throw new Error(`El presupuesto no cuadra:\n${fallos.map((f) => `  - ${f}`).join("\n")}`);
  }
}

// ---------------------------------------------------------------------------
// Formato es-ES para el payload
// ---------------------------------------------------------------------------

/**
 * `useGrouping: "always"` es obligatorio. Por defecto, Intl en es-ES NO agrupa
 * los números de 4 dígitos: 6748.42 saldría "6748,42". El presupuesto de
 * referencia del cliente escribe "4.880,82", con separador de millar desde
 * el millar. Sin este flag, el documento no respeta su formato.
 */
const OPCIONES_NUMERO = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  // `useGrouping: "always"` es ES2023. El cast evita exigir "lib": ["ES2023"]
  // en el tsconfig del proyecto. Soportado en Node 18+ y navegadores actuales.
  useGrouping: "always",
} as unknown as Intl.NumberFormatOptions;

const NF_IMPORTE = new Intl.NumberFormat("es-ES", OPCIONES_NUMERO);

const NF_CANTIDAD = new Intl.NumberFormat("es-ES", OPCIONES_NUMERO);

/** 58587.03 -> "58.587,03" */
export function formatearImporte(v: number): string {
  return NF_IMPORTE.format(v);
}

/** 54 -> "54,00" */
export function formatearCantidad(v: number): string {
  return NF_CANTIDAD.format(v);
}

/** 0.1 -> "10" (para el rótulo "IVA 10 %") */
export function formatearTipoIva(tipo: number): string {
  return String(Math.round(tipo * 1000) / 10);
}

/** "2026-08-31" -> "31 de agosto de 2026" */
export function formatearFechaLarga(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${d} de ${meses[m - 1]} de ${a}`;
}

/** Resumen por capítulos para el bloque "RESUMEN PRESUPUESTO" del documento. */
export function resumenPorCapitulos(
  p: PresupuestoCalculado
): { etiqueta: string; importe: string }[] {
  return p.capitulos.map((c) => ({
    etiqueta: `${c.codigoJerarquico}  ${c.nombre}`,
    importe: `${formatearImporte(c.total)} Eur`,
  }));
}

/** Comprobación de que un capítulo existe (para tests de mapeo en D5). */
export function capituloExiste(codigo: string): boolean {
  return obtenerCapitulo(codigo) !== undefined;
}
/**
 * Todas las cifras que el documento puede contener legítimamente.
 *
 * Alimenta `validarCifras` (contrato.ts): si una sección de IA imprime un
 * número que no está en esta lista, se lo ha inventado. Los prompts de
 * `TituloPresupuesto` y `ObjetoYAlcance` describen la intervención y NO deben
 * calcular nada, pero un modelo que ve importes en su contexto tiende a
 * resumirlos, y un total inventado en la prosa de un documento precontractual
 * es exactamente lo que no puede pasar.
 *
 * Se devuelven ya formateadas en es-ES, que es como aparecerían impresas.
 */
export function cifrasDelCalculo(p: PresupuestoCalculado): string[] {
  const cifras = new Set<string>();

  for (const cap of p.capitulos) {
    cifras.add(formatearImporte(cap.total));
    for (const l of cap.lineas) {
      cifras.add(formatearImporte(l.importe));
      cifras.add(formatearImporte(l.precioUnitario));
      cifras.add(formatearCantidad(l.cantidad));
    }
  }

  cifras.add(formatearImporte(p.pem));
  cifras.add(formatearImporte(p.ivaImporte));
  cifras.add(formatearImporte(p.total));

  return [...cifras];
}