/**
 * scripts/tarifa/auditar-mapeo.ts
 *
 * Audita la cobertura del catálogo de captura contra la tarifa y produce la
 * lista de decisiones pendientes. La salida ES el documento que se le lleva a
 * Miguel: decisiones concretas con su contexto, no una sesión abierta.
 *
 * Uso:  npm run mapeo:auditar
 */

import {
    recorrerCatalogo,
    resumenCobertura,
    validarMapeo,
    type EstadoMapeo,
    type PartidaCatalogo,
} from "../../lib/documentos/mapeo-capitulos";
import { obtenerPartida, obtenerCapitulo } from "../../lib/documentos/tarifa";

const ETIQUETA: Record<EstadoMapeo | "sin_mapear", string> = {
    confirmado: "OK",
    propuesto: "??",
    sin_equivalencia: "XX",
    sin_mapear: "--",
};

function euros(v: number): string {
    return new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function estadoDe(p: PartidaCatalogo): EstadoMapeo | "sin_mapear" {
    return p.mapeo ? p.mapeo.estado : "sin_mapear";
}

// --- Integridad -------------------------------------------------------------

const fallos = validarMapeo();
if (fallos.length) {
    console.log(`\n✖ La tabla de mapeo tiene ${fallos.length} problema(s):`);
    for (const f of fallos) console.log(`  - ${f}`);
    console.log("");
    process.exit(1);
}

// --- Resumen ----------------------------------------------------------------

const r = resumenCobertura();
const decididas = r.confirmado + r.propuesto;
const pct = Math.round((decididas / r.subrutas) * 100);

console.log(`\nCobertura del catálogo de captura  ·  Scala Valencia`);
console.log(`  ${r.partidas} partidas en el árbol, ${r.subrutas} subrutas distintas`);
console.log(`  (los 4 módulos de fachada comparten estructura: la decisión se toma una vez)\n`);
console.log(`  confirmadas ....... ${String(r.confirmado).padStart(3)}`);
console.log(`  propuestas ........ ${String(r.propuesto).padStart(3)}   (a validar por Miguel)`);
console.log(`  sin equivalencia .. ${String(r.sinEquivalencia).padStart(3)}   (no hay partida en la tarifa)`);
console.log(`  sin mapear ........ ${String(r.sinMapear).padStart(3)}   (pendientes de decidir)`);
console.log(`  de texto libre .... ${String(r.textoLibre).padStart(3)}   (nunca presupuestables)`);
console.log(`\n  COBERTURA: ${decididas}/${r.subrutas} subrutas (${pct} %)\n`);

// --- Detalle por módulo -----------------------------------------------------

const partidas = recorrerCatalogo();
const porModulo = new Map<string, PartidaCatalogo[]>();
for (const p of partidas) porModulo.set(p.moduloLabel, [...(porModulo.get(p.moduloLabel) ?? []), p]);

console.log("─".repeat(78));
console.log("DETALLE POR MÓDULO\n");

for (const [modulo, lista] of porModulo) {
    const pendientes = lista.filter((p) => estadoDe(p) !== "confirmado").length;
    console.log(`### ${modulo}  (${lista.length} partidas, ${pendientes} pendientes)`);

    for (const p of lista) {
        const est = estadoDe(p);
        const tarifa = p.mapeo?.codigo ? obtenerPartida(p.mapeo.codigo) : undefined;
        const cap = tarifa ? obtenerCapitulo(tarifa.capitulo) : undefined;

        console.log(`  ${ETIQUETA[est]}  ${p.unidad.padEnd(4)} ${p.camino}`);
        if (tarifa && cap) {
            console.log(
                `         -> ${tarifa.codigo}  ${tarifa.descripcionCorta}` +
                    `\n            ${cap.codigoJerarquico} ${cap.nombre} · ${euros(tarifa.tarifaEmpresa)} €/${tarifa.unidad}`
            );
        } else if (p.textoLibre) {
            console.log(`         -> texto libre: no hay partida de tarifa posible`);
        }
        if (p.mapeo?.nota) console.log(`         nota: ${p.mapeo.nota}`);
    }
    console.log("");
}

// --- Decisiones pendientes, agrupadas por subruta ---------------------------

const porSubruta = new Map<string, PartidaCatalogo[]>();
for (const p of partidas) porSubruta.set(p.subruta, [...(porSubruta.get(p.subruta) ?? []), p]);

const sinMapear: [string, PartidaCatalogo[]][] = [];
const sinEquiv: [string, PartidaCatalogo[]][] = [];
const propuestas: [string, PartidaCatalogo[]][] = [];

for (const [subruta, lista] of porSubruta) {
    const est = estadoDe(lista[0]);
    if (est === "sin_mapear") sinMapear.push([subruta, lista]);
    else if (est === "sin_equivalencia") sinEquiv.push([subruta, lista]);
    else if (est === "propuesto") propuestas.push([subruta, lista]);
}

console.log("─".repeat(78));
console.log("DECISIONES PENDIENTES PARA MIGUEL\n");

function bloque(titulo: string, grupos: [string, PartidaCatalogo[]][]) {
    if (grupos.length === 0) return;
    console.log(`${titulo} (${grupos.length}):\n`);
    for (const [subruta, lista] of grupos) {
        const modulos = [...new Set(lista.map((p) => p.moduloLabel))].join(", ");
        const p = lista[0];
        console.log(`  · ${p.camino}   [${p.unidad}]`);
        console.log(`    afecta a: ${modulos}`);
        if (p.mapeo?.codigo) console.log(`    propuesto: ${p.mapeo.codigo}`);
        if (p.mapeo?.nota) console.log(`    ${p.mapeo.nota}`);
        console.log(`    subruta: ${subruta}`);
        console.log("");
    }
}

bloque("A) SIN MAPEAR — hay que decidir qué partida les corresponde", sinMapear);
bloque("B) SIN EQUIVALENCIA — no existe partida en la tarifa 2026", sinEquiv);
bloque("C) PROPUESTAS — equivalencia elegida por Advantys, a validar", propuestas);

if (r.textoLibre > 0) {
    console.log(`D) TEXTO LIBRE (${r.textoLibre}): nodos "Varios" y "Otros".`);
    console.log(`   No hay partida de tarifa para texto libre. Decidir si se excluyen`);
    console.log(`   del presupuesto y van a observaciones, o si se convierten en`);
    console.log(`   partida alzada (el catálogo ya contempla la unidad "pa").\n`);
}