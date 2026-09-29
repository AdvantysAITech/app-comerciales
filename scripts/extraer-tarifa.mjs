#!/usr/bin/env node
/**
 * scripts/tarifa/extraer-tarifa.mjs
 *
 * Extractor one-shot: Excel de tarifas -> catálogo JSON congelado.
 *
 * Uso:
 *   node scripts/tarifa/extraer-tarifa.mjs <ruta-excel> [ruta-salida-json]
 *
 * Reglas de negocio aplicadas (acordadas 31/08/2026):
 *  - Fuente de verdad: hoja RESUMEN. Las hojas por capítulo se IGNORAN
 *    (contienen 32 valores divergentes; decisión de Jacob: manda RESUMEN).
 *  - TARIFA EMPRESA = PRECIO CYPE * 1,25 salvo excepciones en LISTA_BLANCA.
 *  - El margen del 25% incluye la comisión del administrador (DERCAS 7.2).
 *  - Numeración jerárquica 1.CC.PP (obra . capítulo . partida).
 *  - Unidades normalizadas a catálogo cerrado.
 *
 * Este script NO se ejecuta en runtime. Se lanza a mano cuando el cliente
 * entrega una revisión de tarifa, y su salida (JSON) se commitea al repo.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

const HOJA_FUENTE = "RESUMEN";
const MARGEN_EMPRESA = 1.25;
const OBRA = "1"; // primer nivel de la numeración jerárquica 1.CC.PP

/** Prefijos de código válidos. Cualquier otro código aborta la extracción. */
const PREFIJOS = [
  "DEM", "AND", "FAC", "REV", "PIN", "IMP",
  "AMI", "CER", "SSO", "RCD", "VP", "INS",
];

/** Catálogo cerrado de unidades. Cualquier otra unidad aborta la extracción. */
const UNIDADES = ["ud", "m", "m²", "m³", "h", "kg", "día", "mes"];

/** Normalización de las variantes que trae el Excel. */
const NORMALIZA_UNIDAD = {
  "ud": "ud", "uds": "ud", "u": "ud",
  "m": "m",
  "m2": "m²", "m²": "m²",
  "m3": "m³", "m³": "m³",
  "h": "h", "hora": "h",
  "kg": "kg",
  "dia": "día", "día": "día",
  "mes": "mes",
};

/**
 * Excepciones aceptadas conscientemente por el cliente.
 * No son errores: son decisiones registradas. Se documentan aquí para que
 * el validador no las marque y para que quede constancia de por qué.
 */
const LISTA_BLANCA = {
  DEM016: {
    motivo:
      "Tarifa 2,91 € hardcodeada en el Excel en lugar de 2,80 x 1,25 = 3,50 €. " +
      "Confirmado por Jacob 31/08/2026 como precio pactado intencionadamente.",
    tarifaEsperada: 2.91,
  },
  VP001: {
    motivo:
      "395,12 €/ud para IRATA nivel 1, superior al nivel 2 (52 €/ud) y al " +
      "nivel 3 (68 €/h). Anomalía señalada a Jacob 31/08/2026; decisión: se " +
      "mantiene tal cual. Revisar en la validación E2E de Vertical con Toni.",
  },
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const dosDecimales = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const pad2 = (n) => String(n).padStart(2, "0");

function esFilaPartida(codigo) {
  if (typeof codigo !== "string") return false;
  const c = codigo.trim();
  return PREFIJOS.some((p) => c.startsWith(p)) && /\d{3}$/.test(c);
}

/** '  03 CERRAMIENTOS Y FACHADAS' -> { codigo: '03', nombre: 'CERRAMIENTOS Y FACHADAS' } */
function parseCabeceraCapitulo(valor) {
  if (typeof valor !== "string") return null;
  const m = valor.trim().match(/^(\d{2})\s+(.+)$/);
  if (!m) return null;
  return { codigo: m[1], nombre: m[2].trim() };
}

function normalizaUnidad(bruta, codigo) {
  const clave = String(bruta ?? "").trim().toLowerCase();
  const u = NORMALIZA_UNIDAD[clave];
  if (!u) {
    throw new Error(
      `[${codigo}] Unidad no reconocida: "${bruta}". ` +
        `Catálogo cerrado: ${UNIDADES.join(", ")}`
    );
  }
  return u;
}

// ---------------------------------------------------------------------------
// Extracción
// ---------------------------------------------------------------------------

function extraer(rutaExcel) {
  const libro = XLSX.read(readFileSync(rutaExcel), { cellFormula: true });

  if (!libro.SheetNames.includes(HOJA_FUENTE)) {
    throw new Error(
      `El Excel no contiene la hoja "${HOJA_FUENTE}". Hojas: ${libro.SheetNames.join(", ")}`
    );
  }

  const hoja = libro.Sheets[HOJA_FUENTE];
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, blankrows: false, raw: true });

  const capitulos = [];
  const partidas = [];
  const avisos = [];

  let capActual = null;
  let ordenEnCapitulo = 0;

  for (const fila of filas) {
    const c0 = fila[0];

    // ¿Cabecera de capítulo?
    const cab = parseCabeceraCapitulo(c0);
    if (cab && !esFilaPartida(c0)) {
      capActual = {
        codigo: cab.codigo,
        codigoJerarquico: `${OBRA}.${cab.codigo}`,
        nombre: cab.nombre,
      };
      capitulos.push(capActual);
      ordenEnCapitulo = 0;
      continue;
    }

    if (!esFilaPartida(c0)) continue;

    const codigo = String(c0).trim();

    if (!capActual) {
      throw new Error(`[${codigo}] Partida encontrada antes de ninguna cabecera de capítulo.`);
    }

    const descripcion = String(fila[1] ?? "").trim().replace(/\s+/g, " ");
    const unidad = normalizaUnidad(fila[2], codigo);
    const precioCype = Number(fila[3]);

    if (!Number.isFinite(precioCype) || precioCype <= 0) {
      throw new Error(`[${codigo}] Precio CYPE inválido: ${fila[3]}`);
    }
    if (!descripcion) {
      throw new Error(`[${codigo}] Descripción vacía.`);
    }

    // La columna E es una fórmula (=D5*1.25). Se recalcula siempre en código:
    // nunca se confía en el valor cacheado del Excel.
    const blanca = LISTA_BLANCA[codigo];
    const tarifaEmpresa = dosDecimales(
      blanca?.tarifaEsperada ?? precioCype * MARGEN_EMPRESA
    );

    if (blanca) {
      avisos.push({ codigo, motivo: blanca.motivo });
    }

    ordenEnCapitulo += 1;

    partidas.push({
      codigo,
      codigoJerarquico: `${capActual.codigoJerarquico}.${pad2(ordenEnCapitulo)}`,
      capitulo: capActual.codigo,
      orden: ordenEnCapitulo,
      descripcionCorta: descripcion,
      descripcionLarga: null, // se rellena en el bloque de generación (pendiente decisión)
      unidad,
      precioCype: dosDecimales(precioCype),
      tarifaEmpresa,
      excepcionAceptada: blanca ? blanca.motivo : null,
    });
  }

  return {
    meta: {
      version: "2026.1",
      generadoEl: new Date().toISOString().slice(0, 10),
      hojaFuente: HOJA_FUENTE,
      margenEmpresa: MARGEN_EMPRESA,
      ivaPorDefecto: 0.1,
      fuentePrecios: "CYPE Generador de Precios 2025-2026",
      empresas: ["scala", "vertical"],
      nota:
        "Catálogo congelado. Regenerar con scripts/tarifa/extraer-tarifa.mjs " +
        "únicamente cuando el cliente entregue una revisión de tarifa.",
    },
    capitulos,
    partidas,
    avisos,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const [, , rutaExcelArg, rutaSalidaArg] = process.argv;

if (!rutaExcelArg) {
  console.error("Uso: node scripts/tarifa/extraer-tarifa.mjs <ruta-excel> [salida.json]");
  process.exit(1);
}

const rutaExcel = resolve(rutaExcelArg);
const rutaSalida = resolve(rutaSalidaArg ?? "data/tarifa/tarifa-2026.json");

try {
  const catalogo = extraer(rutaExcel);

  mkdirSync(dirname(rutaSalida), { recursive: true });
  writeFileSync(rutaSalida, JSON.stringify(catalogo, null, 2) + "\n", "utf8");

  const porCapitulo = catalogo.capitulos.map((c) => {
    const n = catalogo.partidas.filter((p) => p.capitulo === c.codigo).length;
    return `  ${c.codigoJerarquico}  ${c.nombre.padEnd(42)} ${String(n).padStart(3)} partidas`;
  });

  console.log(`\n✔ Catálogo generado: ${rutaSalida}`);
  console.log(`  Capítulos: ${catalogo.capitulos.length}`);
  console.log(`  Partidas:  ${catalogo.partidas.length}\n`);
  console.log(porCapitulo.join("\n"));

  if (catalogo.avisos.length) {
    console.log(`\n⚠ Excepciones aceptadas (${catalogo.avisos.length}):`);
    for (const a of catalogo.avisos) console.log(`  - ${a.codigo}: ${a.motivo}`);
  }
  console.log("");
} catch (err) {
  console.error(`\n✖ Extracción abortada: ${err.message}\n`);
  process.exit(1);
}
