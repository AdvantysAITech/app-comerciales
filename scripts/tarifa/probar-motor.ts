import {
  calcularPresupuesto,
  verificarCuadre,
  formatearImporte,
  formatearCantidad,
  formatearTipoIva,
  formatearFechaLarga,
  resumenPorCapitulos,
  type EntradaPresupuesto,
} from "../../lib/documentos/motor";
import { validarCatalogo } from "../../lib/documentos/tarifa.validacion";
import { listarPartidas } from "../../lib/documentos/tarifa";

let fallos = 0;
function check(nombre: string, cond: boolean, detalle = "") {
  console.log(`${cond ? "  ok  " : "  FAIL"}  ${nombre}${detalle ? "  -> " + detalle : ""}`);
  if (!cond) fallos++;
}

// --- 0. Catálogo -----------------------------------------------------------
const v = validarCatalogo();
console.log("\n== Catálogo ==");
check("catálogo válido", v.valido, `${v.errores.length} errores`);
check("199 partidas", v.resumen.partidas === 199, String(v.resumen.partidas));

// --- 1. Presupuesto realista ----------------------------------------------
console.log("\n== Presupuesto de prueba ==");
const entrada: EntradaPresupuesto = {
  lineas: [
    { codigo: "DEM015", cantidad: 54 },                              // limpieza pinturas m2
    { codigo: "DEM001", cantidad: 190 },                             // demolicion aplacado m2
    { codigo: "DEM017", cantidad: 950 },                             // limpieza chapado m2
    { codigo: "FAC010", cantidad: 74 },                              // picado aleros m2
    { codigo: "FAC007", cantidad: 74 },                              // renovacion monocapa m2
    { codigo: "REV001", cantidad: 190 },                             // gres porcelanico m2
    { codigo: "IMP001", cantidad: 45 },                              // lamina bituminosa m2
    { codigo: "AND002", cantidad: 950 },                             // andamio m2
    { codigo: "AND006", cantidad: 950 },                             // malla m2
    { codigo: "CER001", cantidad: 6, unidadSeleccionada: "ud" },     // barandilla nativa "m"
    { codigo: "RCD001", cantidad: 6, unidadSeleccionada: "ud" },     // contenedor
    { codigo: "RCD004", cantidad: 36, unidadSeleccionada: "ud" },    // clasificacion nativa "m3"
    { codigo: "DEM001", cantidad: 10 },                              // repetida -> agrega a 200
  ],
};

const p = calcularPresupuesto(entrada);

for (const c of p.capitulos) {
  console.log(`\n  ${c.codigoJerarquico}  ${c.nombre}`);
  for (const l of c.lineas) {
    console.log(
      `    ${l.codigoJerarquico}  ${l.codigo.padEnd(7)} ${formatearCantidad(l.cantidad).padStart(9)} ${l.unidad.padEnd(3)}` +
        ` x ${formatearImporte(l.precioUnitario).padStart(9)} = ${formatearImporte(l.importe).padStart(11)}` +
        (l.unidadDivergente ? `   [nativa: ${l.unidadNativa}]` : "")
    );
  }
  console.log(`    ${"TOTAL".padStart(58)} ${formatearImporte(c.total).padStart(11)}`);
}

console.log("\n  RESUMEN");
for (const r of resumenPorCapitulos(p)) {
  console.log(`    ${r.etiqueta.padEnd(46)} ${r.importe.padStart(14)}`);
}
console.log(`    ${"TOTAL PEM".padEnd(46)} ${formatearImporte(p.pem).padStart(10)} Eur`);
console.log(`    ${("IVA " + formatearTipoIva(p.ivaTipo) + " %").padEnd(46)} ${formatearImporte(p.ivaImporte).padStart(10)} Eur`);
console.log(`    ${"TOTAL (IVA INCLUIDO)".padEnd(46)} ${formatearImporte(p.total).padStart(10)} Eur`);
console.log(`\n  [interno] coste CYPE ${formatearImporte(p.interno.costeCype)} · margen ${formatearImporte(p.interno.margenTotal)} (${p.interno.margenPorcentaje} %)`);

// --- 2. Cuadre -------------------------------------------------------------
console.log("\n== Cuadre ==");
const fallosCuadre = verificarCuadre(p);
check("el presupuesto cuadra", fallosCuadre.length === 0, fallosCuadre.join(" | "));

let sumaCap = 0;
for (const c of p.capitulos) {
  const suma = c.lineas.reduce((a, l) => a + Math.round(l.importe * 100), 0);
  check(`cap ${c.codigoJerarquico} suma líneas`, suma === Math.round(c.total * 100));
  sumaCap += Math.round(c.total * 100);
}
check("PEM = suma capítulos", sumaCap === Math.round(p.pem * 100));
check("IVA = 10% PEM", Math.round(p.pem * 100 * 0.1) === Math.round(p.ivaImporte * 100));
check("TOTAL = PEM + IVA", Math.round(p.pem * 100) + Math.round(p.ivaImporte * 100) === Math.round(p.total * 100));

// --- 3. Comportamientos concretos ------------------------------------------
console.log("\n== Comportamiento ==");
const dem = p.capitulos.find((c) => c.codigo === "01")!.lineas.find((l) => l.codigo === "DEM001")!;
check("agrega líneas repetidas (190+10=200)", dem.cantidad === 200, String(dem.cantidad));

const cer = p.capitulos.find((c) => c.codigo === "08")!.lineas[0];
check("unidad impresa 'ud' sobre partida nativa 'm'", cer.unidad === "ud" && cer.unidadNativa === "m");
check("precio no cambia al cambiar etiqueta", cer.precioUnitario === 640.05, String(cer.precioUnitario));
check("importe = 6 x 640,05", Math.round(cer.importe * 100) === Math.round(6 * 640.05 * 100), String(cer.importe));

const ordenCaps = p.capitulos.map((c) => c.codigo).join(",");
check("capítulos en orden de catálogo", ordenCaps === "01,02,03,04,06,08,10", ordenCaps);
check("solo capítulos con líneas", p.capitulos.every((c) => c.lineas.length > 0));
check("hay avisos de divergencia de unidad", p.avisos.some((a) => a.nivel === "atencion"));

// --- 4. Errores esperados --------------------------------------------------
console.log("\n== Validación de entrada ==");
function lanza(nombre: string, fn: () => unknown) {
  try { fn(); check(nombre, false, "no lanzó"); }
  catch { check(nombre, true); }
}
lanza("código inexistente", () => calcularPresupuesto({ lineas: [{ codigo: "XXX999", cantidad: 1 }] }));
lanza("cantidad 0", () => calcularPresupuesto({ lineas: [{ codigo: "DEM001", cantidad: 0 }] }));
lanza("cantidad negativa", () => calcularPresupuesto({ lineas: [{ codigo: "DEM001", cantidad: -5 }] }));
lanza("sin líneas", () => calcularPresupuesto({ lineas: [] }));
lanza("IVA inválido", () => calcularPresupuesto({ lineas: [{ codigo: "DEM001", cantidad: 1 }], ivaTipo: 10 }));

// --- 5. Precisión con decimales --------------------------------------------
console.log("\n== Precisión ==");
const dec = calcularPresupuesto({
  lineas: [
    { codigo: "CER001", cantidad: 6.35 },
    { codigo: "FAC011", cantidad: 35.5 },
    { codigo: "IMP013", cantidad: 123.45 },
  ],
});
check("cuadra con cantidades decimales", verificarCuadre(dec).length === 0, verificarCuadre(dec).join(" | "));
check("640,05 x 6,35 = 4.064,32", Math.round(dec.capitulos.find(c=>c.codigo==="08")!.lineas[0].importe*100) === Math.round(6.35*640.05*100));

// Estrés: 199 partidas a la vez
const todas = calcularPresupuesto({
  lineas: listarPartidas().map((x) => ({ codigo: x.codigo, cantidad: 7.25 })),
});
check("cuadra con las 199 partidas", verificarCuadre(todas).length === 0, verificarCuadre(todas).join(" | "));
console.log(`  PEM 199 partidas x 7,25: ${formatearImporte(todas.pem)} €  ·  TOTAL ${formatearImporte(todas.total)} €`);

// --- 6. Formato ------------------------------------------------------------
console.log("\n== Formato ==");
check("importe es-ES", formatearImporte(58587.03) === "58.587,03", formatearImporte(58587.03));
check("millar en 4 digitos", formatearImporte(4880.82) === "4.880,82", formatearImporte(4880.82));
check("cantidad es-ES", formatearCantidad(54) === "54,00", formatearCantidad(54));
check("tipo IVA", formatearTipoIva(0.1) === "10", formatearTipoIva(0.1));
check("fecha larga", formatearFechaLarga("2026-08-31") === "31 de agosto de 2026", formatearFechaLarga("2026-08-31"));

console.log(fallos === 0 ? "\n✔ Todos los checks pasan.\n" : `\n✖ ${fallos} checks fallidos.\n`);