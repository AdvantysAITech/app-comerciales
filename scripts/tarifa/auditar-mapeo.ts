/**
 * scripts/tarifa/auditar-mapeo.ts
 *
 * Audita la tabla de mapeo ruta -> tarifa y produce la lista de decisiones
 * pendientes. La salida de este script ES el documento que se le lleva a
 * Miguel: una hoja de decisiones concretas, no una sesión abierta.
 *
 * Uso:  npm run mapeo:auditar
 */

import {
  MAPA_RUTAS,
  validarMapeo,
  resumenMapeo,
  type EstadoMapeo,
} from "../../lib/documentos/mapeo-capitulos";
import { obtenerPartida, obtenerCapitulo } from "../../lib/documentos/tarifa";

const ETIQUETA: Record<EstadoMapeo, string> = {
  confirmado: "OK ",
  propuesto: "?? ",
  sin_equivalencia: "XX ",
};

function euros(v: number): string {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

// --- Integridad ------------------------------------------------------------

const fallos = validarMapeo();
if (fallos.length) {
  console.log(`\n✖ La tabla de mapeo tiene ${fallos.length} problema(s):`);
  for (const f of fallos) console.log(`  - ${f}`);
  console.log("");
}

// --- Resumen ---------------------------------------------------------------

const r = resumenMapeo();
console.log(`\nMapeo captura -> tarifa`);
console.log(
  `  ${r.total} rutas  ·  ${r.confirmado} confirmadas  ·  ` +
    `${r.propuesto} propuestas  ·  ${r.sin_equivalencia} sin equivalencia\n`
);

// --- Detalle ---------------------------------------------------------------

const entradas = Object.entries(MAPA_RUTAS).sort(([a], [b]) => a.localeCompare(b));

for (const [ruta, m] of entradas) {
  const p = m.codigo ? obtenerPartida(m.codigo) : undefined;
  const cap = p ? obtenerCapitulo(p.capitulo) : undefined;

  console.log(`${ETIQUETA[m.estado]} ${ruta}`);
  if (p && cap) {
    console.log(
      `      -> ${p.codigo}  ${p.descripcionCorta}` +
        `\n         ${cap.codigoJerarquico} ${cap.nombre}  ·  ` +
        `${euros(p.tarifaEmpresa)} €/${p.unidad}`
    );
  } else {
    console.log(`      -> (sin partida)`);
  }
  if (m.nota) console.log(`         nota: ${m.nota}`);
  console.log("");
}

// --- Decisiones pendientes -------------------------------------------------

const pendientes = entradas.filter(([, m]) => m.estado !== "confirmado");

if (pendientes.length) {
  console.log("─".repeat(78));
  console.log("DECISIONES PENDIENTES PARA MIGUEL\n");

  const sinEq = pendientes.filter(([, m]) => m.estado === "sin_equivalencia");
  const prop = pendientes.filter(([, m]) => m.estado === "propuesto");

  if (sinEq.length) {
    console.log(`A) Sin partida en la tarifa (${sinEq.length}) — bloquean el presupuesto:`);
    for (const [ruta, m] of sinEq) console.log(`   - ${ruta}\n     ${m.nota ?? ""}`);
    console.log("");
  }
  if (prop.length) {
    console.log(`B) Equivalencia propuesta, a validar (${prop.length}):`);
    for (const [ruta, m] of prop) {
      const p = obtenerPartida(m.codigo);
      console.log(`   - ${ruta}\n     -> ${m.codigo} ${p?.descripcionCorta ?? ""}\n     ${m.nota ?? ""}`);
    }
    console.log("");
  }
} else {
  console.log("✔ Todas las rutas están confirmadas.\n");
}