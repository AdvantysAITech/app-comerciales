/**
 * lib/documentos/tarifa.validacion.ts
 *
 * Validador de integridad del catálogo de tarifa.
 *
 * Se ejecuta:
 *  - En CI / pre-commit vía `npm run tarifa:validar`.
 *  - Opcionalmente al arrancar en desarrollo (ver `assertCatalogoValido`).
 *
 * Principio: un catálogo corrupto tiene que romper el build, no producir
 * presupuestos con importes silenciosamente mal. Los presupuestos son
 * documentos precontractuales.
 */

import {
  catalogo,
  UNIDADES,
  type PartidaTarifa,
  type Unidad,
} from "./tarifa";

export interface ProblemaCatalogo {
  gravedad: "error" | "aviso";
  codigo: string;
  mensaje: string;
}

export interface ResultadoValidacion {
  valido: boolean;
  errores: ProblemaCatalogo[];
  avisos: ProblemaCatalogo[];
  resumen: {
    capitulos: number;
    partidas: number;
    sinDescripcionLarga: number;
    excepcionesAceptadas: number;
    porUnidad: Record<string, number>;
  };
}

const TOLERANCIA_CENTIMOS = 0.011; // margen para redondeo a 2 decimales

/**
 * Comprobación de 2 decimales tolerante a coma flotante.
 * `640.05 * 100` es 64004.99999999999 en IEEE-754, así que una comparación
 * estricta contra Math.round daría un falso positivo.
 */
function tieneDosDecimales(v: number): boolean {
  return Math.abs(Math.round(v * 100) - v * 100) < 1e-6;
}

function esUnidadValida(u: string): u is Unidad {
  return (UNIDADES as readonly string[]).includes(u);
}

export function validarCatalogo(): ResultadoValidacion {
  const errores: ProblemaCatalogo[] = [];
  const avisos: ProblemaCatalogo[] = [];

  const { meta, capitulos, partidas } = catalogo;

  // --- Metadatos -----------------------------------------------------------

  if (!meta?.version) {
    errores.push({ gravedad: "error", codigo: "META", mensaje: "Falta meta.version." });
  }
  if (typeof meta?.margenEmpresa !== "number" || meta.margenEmpresa <= 1) {
    errores.push({
      gravedad: "error",
      codigo: "META",
      mensaje: `meta.margenEmpresa inválido: ${meta?.margenEmpresa}`,
    });
  }
  if (meta?.ivaPorDefecto !== 0.1) {
    avisos.push({
      gravedad: "aviso",
      codigo: "META",
      mensaje: `IVA por defecto es ${meta?.ivaPorDefecto}; lo acordado con el cliente es 0.1 (10%).`,
    });
  }

  // --- Capítulos -----------------------------------------------------------

  if (capitulos.length === 0) {
    errores.push({ gravedad: "error", codigo: "CAPITULOS", mensaje: "No hay capítulos." });
  }

  const vistosCap = new Set<string>();
  for (const c of capitulos) {
    if (vistosCap.has(c.codigo)) {
      errores.push({
        gravedad: "error",
        codigo: c.codigo,
        mensaje: `Capítulo duplicado: ${c.codigo}`,
      });
    }
    vistosCap.add(c.codigo);

    if (!/^\d{2}$/.test(c.codigo)) {
      errores.push({
        gravedad: "error",
        codigo: c.codigo,
        mensaje: `Código de capítulo no es de dos dígitos.`,
      });
    }
    if (c.codigoJerarquico !== `1.${c.codigo}`) {
      errores.push({
        gravedad: "error",
        codigo: c.codigo,
        mensaje: `codigoJerarquico "${c.codigoJerarquico}" no coincide con "1.${c.codigo}".`,
      });
    }
    if (!c.nombre?.trim()) {
      errores.push({ gravedad: "error", codigo: c.codigo, mensaje: "Nombre de capítulo vacío." });
    }
  }

  // --- Partidas ------------------------------------------------------------

  const vistosPart = new Set<string>();
  const vistosJerarquicos = new Set<string>();
  const ordenPorCapitulo = new Map<string, number[]>();
  const porUnidad: Record<string, number> = {};
  let sinDescripcionLarga = 0;
  let excepcionesAceptadas = 0;

  for (const p of partidas as PartidaTarifa[]) {
    // Unicidad
    if (vistosPart.has(p.codigo)) {
      errores.push({ gravedad: "error", codigo: p.codigo, mensaje: "Código de partida duplicado." });
    }
    vistosPart.add(p.codigo);

    if (vistosJerarquicos.has(p.codigoJerarquico)) {
      errores.push({
        gravedad: "error",
        codigo: p.codigo,
        mensaje: `Código jerárquico duplicado: ${p.codigoJerarquico}`,
      });
    }
    vistosJerarquicos.add(p.codigoJerarquico);

    // Coherencia jerárquica
    const esperado = `1.${p.capitulo}.${String(p.orden).padStart(2, "0")}`;
    if (p.codigoJerarquico !== esperado) {
      errores.push({
        gravedad: "error",
        codigo: p.codigo,
        mensaje: `codigoJerarquico "${p.codigoJerarquico}" debería ser "${esperado}".`,
      });
    }

    if (!vistosCap.has(p.capitulo)) {
      errores.push({
        gravedad: "error",
        codigo: p.codigo,
        mensaje: `Referencia a capítulo inexistente: "${p.capitulo}".`,
      });
    }

    const ordenes = ordenPorCapitulo.get(p.capitulo) ?? [];
    ordenes.push(p.orden);
    ordenPorCapitulo.set(p.capitulo, ordenes);

    // Unidad
    if (!esUnidadValida(p.unidad)) {
      errores.push({
        gravedad: "error",
        codigo: p.codigo,
        mensaje: `Unidad "${p.unidad}" fuera del catálogo cerrado (${UNIDADES.join(", ")}).`,
      });
    }
    porUnidad[p.unidad] = (porUnidad[p.unidad] ?? 0) + 1;

    // Descripciones
    if (!p.descripcionCorta?.trim()) {
      errores.push({ gravedad: "error", codigo: p.codigo, mensaje: "descripcionCorta vacía." });
    }
    if (!p.descripcionLarga?.trim()) sinDescripcionLarga += 1;

    // Precios
    if (!Number.isFinite(p.precioCype) || p.precioCype <= 0) {
      errores.push({
        gravedad: "error",
        codigo: p.codigo,
        mensaje: `precioCype inválido: ${p.precioCype}`,
      });
    }
    if (!Number.isFinite(p.tarifaEmpresa) || p.tarifaEmpresa <= 0) {
      errores.push({
        gravedad: "error",
        codigo: p.codigo,
        mensaje: `tarifaEmpresa inválida: ${p.tarifaEmpresa}`,
      });
    }
    if (!tieneDosDecimales(p.tarifaEmpresa)) {
      errores.push({
        gravedad: "error",
        codigo: p.codigo,
        mensaje: `tarifaEmpresa con más de 2 decimales: ${p.tarifaEmpresa}`,
      });
    }

    // Margen
    const esperadoMargen = Math.round(p.precioCype * meta.margenEmpresa * 100) / 100;
    const desvia = Math.abs(p.tarifaEmpresa - esperadoMargen) > TOLERANCIA_CENTIMOS;

    if (p.excepcionAceptada) {
      excepcionesAceptadas += 1;
      avisos.push({
        gravedad: "aviso",
        codigo: p.codigo,
        mensaje: `Excepción aceptada: ${p.excepcionAceptada}`,
      });
    } else if (desvia) {
      errores.push({
        gravedad: "error",
        codigo: p.codigo,
        mensaje:
          `tarifaEmpresa ${p.tarifaEmpresa} no cuadra con precioCype ${p.precioCype} ` +
          `x ${meta.margenEmpresa} = ${esperadoMargen}. Si es intencionado, añádelo a ` +
          `LISTA_BLANCA en scripts/tarifa/extraer-tarifa.mjs con su motivo.`,
      });
    }
  }

  // Órdenes correlativos sin huecos dentro de cada capítulo
  for (const [cap, ordenes] of ordenPorCapitulo) {
    const ordenado = [...ordenes].sort((a, b) => a - b);
    for (let i = 0; i < ordenado.length; i++) {
      if (ordenado[i] !== i + 1) {
        errores.push({
          gravedad: "error",
          codigo: `CAP-${cap}`,
          mensaje: `Orden no correlativo en el capítulo ${cap}: se esperaba ${i + 1} y hay ${ordenado[i]}.`,
        });
        break;
      }
    }
  }

  // Capítulos vacíos
  for (const c of capitulos) {
    if (!ordenPorCapitulo.has(c.codigo)) {
      avisos.push({
        gravedad: "aviso",
        codigo: c.codigo,
        mensaje: `Capítulo "${c.nombre}" sin ninguna partida.`,
      });
    }
  }

  return {
    valido: errores.length === 0,
    errores,
    avisos,
    resumen: {
      capitulos: capitulos.length,
      partidas: partidas.length,
      sinDescripcionLarga,
      excepcionesAceptadas,
      porUnidad,
    },
  };
}

/**
 * Lanza si el catálogo no es válido. Pensado para llamarse una vez al
 * arrancar en desarrollo, o desde un test.
 */
export function assertCatalogoValido(): void {
  const r = validarCatalogo();
  if (!r.valido) {
    const detalle = r.errores.map((e) => `  [${e.codigo}] ${e.mensaje}`).join("\n");
    throw new Error(`Catálogo de tarifa inválido (${r.errores.length} errores):\n${detalle}`);
  }
}