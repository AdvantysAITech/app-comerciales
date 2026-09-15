/**
 * scripts/verificar-build.mjs
 *
 * Se ejecuta DESPUÉS de `next build` (ver "build" en package.json). Si falla,
 * el despliegue de Vercel falla con él.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ (15/09/2026)
 * ---------------------------------------------------------------------------
 * El minificador del build de producción compiló mal la plantilla de estilos
 * de tabla de lib/documentos/odf.ts: se comió 147 caracteres y el ODT salía con
 * el XML mal formado. En desarrollo no se minifica, así que en local todo
 * funcionaba y en Vercel Gotenberg rechazaba el documento con un error que
 * hablaba de "recursos". Ninguna prueba lo detectaba porque todas corren sobre
 * el código fuente, no sobre el compilado.
 *
 * Esto mira el código COMPILADO:
 *  1. Los estilos que inyecta odf.ts siguen íntegros.
 *  2. No hay ningún atributo XML cortado por una etiqueta (`="6.5<style:`),
 *     que es la huella de ese fallo.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(process.cwd(), ".next", "server");

if (!existsSync(RAIZ)) {
    console.error("\n  verificar-build: no existe .next/server. Ejecuta antes `next build`.\n");
    process.exit(1);
}

function ficherosJs(dir) {
    return readdirSync(dir).flatMap((nombre) => {
        const ruta = join(dir, nombre);
        if (statSync(ruta).isDirectory()) return ficherosJs(ruta);
        return nombre.endsWith(".js") ? [ruta] : [];
    });
}

/** Fragmentos que el código compilado TIENE que contener tal cual. */
const OBLIGATORIOS = [
    'style:width="6.5in" table:align="left" fo:margin-top="0.08in" fo:margin-bottom="0.08in"/></style:style>',
    '<style:style style:name="AICelda" style:family="table-cell"><style:table-cell-properties fo:border="0.5pt solid #b8b8b8"',
];

/** Atributo cuyo valor se interrumpe con una etiqueta: XML roto seguro. */
const ATRIBUTO_CORTADO = /\b[a-z-]+:[a-z-]+="[^"<>\n]{0,40}<(style|text|table|draw|office):/g;

const ficheros = ficherosJs(RAIZ);
const fallos = [];
const encontrados = new Set();

for (const fichero of ficheros) {
    const codigo = readFileSync(fichero, "utf8");
    for (const fragmento of OBLIGATORIOS) if (codigo.includes(fragmento)) encontrados.add(fragmento);
    for (const m of codigo.matchAll(ATRIBUTO_CORTADO)) {
        fallos.push(`${fichero.slice(RAIZ.length + 1)}: atributo cortado -> ${codigo.slice(m.index - 60, m.index + 60)}`);
    }
}

for (const fragmento of OBLIGATORIOS) {
    if (!encontrados.has(fragmento)) fallos.push(`falta en el código compilado: ${fragmento}`);
}

if (fallos.length > 0) {
    console.error("\n  ✘ verificar-build: el código compilado genera XML roto.\n");
    for (const f of fallos) console.error(`    · ${f}`);
    console.error("");
    process.exit(1);
}

console.log(`  ✔ verificar-build: ${ficheros.length} ficheros del servidor revisados, estilos ODF íntegros.`);
