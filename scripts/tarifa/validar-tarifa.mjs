#!/usr/bin/env node
/**
 * scripts/tarifa/validar-tarifa.mjs
 *
 * Valida el catálogo congelado sin arrancar Next.js. Pensado para CI y para
 * ejecutarlo tras cada regeneración de tarifa.
 *
 * Uso:
 *   node scripts/tarifa/validar-tarifa.mjs [ruta-json]
 *
 * Salida: código 0 si el catálogo es válido, 1 si hay errores.
 *
 * Replica la lógica de lib/documentos/tarifa.validacion.ts en JS plano para
 * no depender del pipeline de TypeScript. Si cambias una regla en un sitio,
 * cámbiala en el otro: el test de lib/documentos/__tests__ debe cubrir ambas.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const UNIDADES = ["ud", "m", "m²", "m³", "h", "kg", "día", "mes"];
const TOLERANCIA = 0.011;

/**
 * Comprobación de 2 decimales tolerante a coma flotante.
 * `640.05 * 100` es 64004.99999999999 en IEEE-754, así que una comparación
 * estricta contra Math.round daría un falso positivo.
 */
function tieneDosDecimales(v) {
  return Math.abs(Math.round(v * 100) - v * 100) < 1e-6;
}

const ruta = resolve(process.argv[2] ?? "data/tarifa/tarifa-2026.json");

let catalogo;
try {
  catalogo = JSON.parse(readFileSync(ruta, "utf8"));
} catch (err) {
  console.error(`\n✖ No se pudo leer el catálogo en ${ruta}: ${err.message}\n`);
  process.exit(1);
}

const { meta, capitulos = [], partidas = [] } = catalogo;
const errores = [];
const avisos = [];

const codigosCap = new Set(capitulos.map((c) => c.codigo));

for (const c of capitulos) {
  if (c.codigoJerarquico !== `1.${c.codigo}`) {
    errores.push(`[${c.codigo}] codigoJerarquico "${c.codigoJerarquico}" ≠ "1.${c.codigo}"`);
  }
  if (!c.nombre?.trim()) errores.push(`[${c.codigo}] nombre de capítulo vacío`);
}

const vistos = new Set();
const ordenPorCap = new Map();
const porUnidad = {};
let sinDescLarga = 0;
let excepciones = 0;

for (const p of partidas) {
  if (vistos.has(p.codigo)) errores.push(`[${p.codigo}] código duplicado`);
  vistos.add(p.codigo);

  if (!codigosCap.has(p.capitulo)) {
    errores.push(`[${p.codigo}] capítulo inexistente "${p.capitulo}"`);
  }

  const esperado = `1.${p.capitulo}.${String(p.orden).padStart(2, "0")}`;
  if (p.codigoJerarquico !== esperado) {
    errores.push(`[${p.codigo}] codigoJerarquico "${p.codigoJerarquico}" ≠ "${esperado}"`);
  }

  if (!UNIDADES.includes(p.unidad)) {
    errores.push(`[${p.codigo}] unidad "${p.unidad}" fuera de catálogo`);
  }
  porUnidad[p.unidad] = (porUnidad[p.unidad] ?? 0) + 1;

  if (!p.descripcionCorta?.trim()) errores.push(`[${p.codigo}] descripcionCorta vacía`);
  if (!p.descripcionLarga?.trim()) sinDescLarga += 1;

  if (!(p.precioCype > 0)) errores.push(`[${p.codigo}] precioCype inválido: ${p.precioCype}`);
  if (!(p.tarifaEmpresa > 0)) errores.push(`[${p.codigo}] tarifaEmpresa inválida: ${p.tarifaEmpresa}`);
  if (!tieneDosDecimales(p.tarifaEmpresa)) {
    errores.push(`[${p.codigo}] tarifaEmpresa con >2 decimales: ${p.tarifaEmpresa}`);
  }

  const esperadoMargen = Math.round(p.precioCype * meta.margenEmpresa * 100) / 100;
  const desvia = Math.abs(p.tarifaEmpresa - esperadoMargen) > TOLERANCIA;

  if (p.excepcionAceptada) {
    excepciones += 1;
    avisos.push(`[${p.codigo}] excepción aceptada: ${p.excepcionAceptada}`);
  } else if (desvia) {
    errores.push(
      `[${p.codigo}] tarifaEmpresa ${p.tarifaEmpresa} ≠ ${p.precioCype} x ${meta.margenEmpresa} = ${esperadoMargen}`
    );
  }

  const lista = ordenPorCap.get(p.capitulo) ?? [];
  lista.push(p.orden);
  ordenPorCap.set(p.capitulo, lista);
}

for (const [cap, ordenes] of ordenPorCap) {
  const ord = [...ordenes].sort((a, b) => a - b);
  for (let i = 0; i < ord.length; i++) {
    if (ord[i] !== i + 1) {
      errores.push(`[CAP-${cap}] orden no correlativo: esperado ${i + 1}, hay ${ord[i]}`);
      break;
    }
  }
}

// --- Salida ----------------------------------------------------------------

console.log(`\nCatálogo de tarifa  ·  ${ruta}`);
console.log(`  versión ${meta?.version}  ·  generado ${meta?.generadoEl}  ·  hoja ${meta?.hojaFuente}`);
console.log(`  ${capitulos.length} capítulos  ·  ${partidas.length} partidas`);
console.log(
  `  unidades: ${Object.entries(porUnidad)
    .sort((a, b) => b[1] - a[1])
    .map(([u, n]) => `${u}=${n}`)
    .join("  ")}`
);
console.log(`  sin descripción larga: ${sinDescLarga}  ·  excepciones aceptadas: ${excepciones}`);

if (avisos.length) {
  console.log(`\n⚠ Avisos (${avisos.length}):`);
  for (const a of avisos) console.log(`  ${a}`);
}

if (errores.length) {
  console.log(`\n✖ Errores (${errores.length}):`);
  for (const e of errores) console.log(`  ${e}`);
  console.log("");
  process.exit(1);
}

console.log(`\n✔ Catálogo válido.\n`);
