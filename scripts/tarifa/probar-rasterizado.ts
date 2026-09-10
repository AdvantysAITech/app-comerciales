import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { calcularPresupuesto } from "../../lib/documentos/motor";
import { assertPortada, construirPortada } from "../../lib/documentos/portada";
import { renderizarPortada } from "../../lib/documentos/portada.svg";
import { rasterizarSvg, FAMILIA_FUENTE } from "../../lib/documentos/rasterizar";

/**
 * scripts/tarifa/probar-rasterizado.ts
 *
 * Comprueba que el SVG de la portada se convierte a PNG CON TEXTO usando las
 * fuentes empaquetadas, sin depender de las del sistema.
 *
 * Es la prueba que faltaba: resvg con una fuente que no encuentra no falla,
 * devuelve un PNG válido y sin una letra. En local, con Arial instalada, el
 * fallo es invisible; en Vercel el documento sale con la portada en blanco.
 */

let fallos = 0;
function check(nombre: string, cond: boolean, detalle = "") {
    console.log(`${cond ? "  ok  " : "  FAIL"}  ${nombre}${detalle ? "  -> " + detalle : ""}`);
    if (!cond) fallos++;
}

const p = calcularPresupuesto({
    lineas: [
        { codigo: "DEM001", cantidad: 190 },
        { codigo: "AND002", cantidad: 950 },
        { codigo: "REV001", cantidad: 190 },
        { codigo: "IMP001", cantidad: 45 },
    ],
});
const portada = construirPortada(p, {
    subcuenta: "scala-valencia",
    titulo: "Rehabilitación de fachada y cubierta",
    comunidad: "C/ Islas Canarias, 180",
    localidad: "Náquera",
    expediente: "SV-2026-0001",
    fecha: "10/09/2026",
    administrador: "Fincas Turia Gestión",
    administradorLocalidad: "Náquera",
});
assertPortada(portada, p);

const svg = renderizarPortada(portada);

console.log("\n== Fuente ==");
check("el SVG declara la familia empaquetada", svg.includes(FAMILIA_FUENTE), FAMILIA_FUENTE);

console.log("\n== Rasterizado ==");
const png = rasterizarSvg(svg);
check("cabecera PNG", png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47);
check("tamaño con contenido", png.length > 50_000, `${Math.round(png.length / 1024)} KB`);

// Un A4 sin texto pesa muy poco: son bloques planos que comprimen casi a nada.
// La diferencia entre pintar texto y no pintarlo se ve en el peso.
check("determinista", rasterizarSvg(svg).length === png.length);

console.log("\n== Ancho configurable ==");
const grande = rasterizarSvg(svg, { ancho: 2480 });
check("300 dpi pesa más que 150", grande.length > png.length, `${Math.round(grande.length / 1024)} KB`);

console.log("\n== SVG inválido ==");
let lanzo = false;
try {
    rasterizarSvg("<svg>sin cerrar");
} catch {
    lanzo = true;
}
check("un SVG roto lanza, no devuelve basura", lanzo);

const salida = join(process.cwd(), "salida", "rasterizado");
mkdirSync(salida, { recursive: true });
writeFileSync(join(salida, "portada.png"), Buffer.from(png));
console.log(`\n  PNG en ${join(salida, "portada.png")}`);

console.log(fallos === 0 ? "\n✔ Todos los checks pasan.\n" : `\n✘ ${fallos} fallo(s).\n`);
process.exit(fallos === 0 ? 0 : 1);