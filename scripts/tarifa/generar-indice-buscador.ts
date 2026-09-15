/**
 * scripts/tarifa/generar-indice-buscador.ts
 *
 * Genera `lib/catalogo/indiceTarifa.generado.ts`, el índice ligero que usa el
 * buscador del módulo Varios.
 *
 *   npm run buscador:indice
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ UN FICHERO GENERADO Y NO IMPORTAR LA TARIFA
 * ---------------------------------------------------------------------------
 * El buscador vive en el formulario, que se ejecuta en el móvil del comercial.
 * Importar `data/tarifa/tarifa-2026.json` metería en ese bundle los precios CYPE,
 * los márgenes y las descripciones largas: más peso en obra con mala cobertura
 * y datos internos que el navegador no necesita. El índice solo lleva código,
 * capítulo, descripción corta y unidad.
 *
 * Dos copias de la misma verdad solo son aceptables si algo las vigila:
 * `validarMapeo()` compara el índice con la tarifa y `npm run mapeo:auditar`
 * falla si divergen. Si cambia la tarifa, se vuelve a ejecutar este script.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { listarCapitulos, catalogo } from "../../lib/documentos/tarifa";

const capitulos = listarCapitulos().map((c) => ({
    codigo: c.codigo,
    codigoJerarquico: c.codigoJerarquico,
    nombre: c.nombre,
}));

const partidas = [...catalogo.partidas]
    .sort((a, b) => a.capitulo.localeCompare(b.capitulo) || a.orden - b.orden)
    .map((p) => ({
        codigo: p.codigo,
        capitulo: p.capitulo,
        descripcion: p.descripcionCorta,
        unidad: p.unidad,
    }));

const contenido =
    `/**\n` +
    ` * GENERADO por scripts/tarifa/generar-indice-buscador.ts. NO EDITAR A MANO.\n` +
    ` *\n` +
    ` * Índice ligero de la tarifa ${catalogo.meta.version} para el buscador de Varios.\n` +
    ` * \`validarMapeo()\` comprueba que coincide con data/tarifa. Si la tarifa cambia:\n` +
    ` *   npm run buscador:indice\n` +
    ` */\n\n` +
    `export const VERSION_TARIFA_INDICE = ${JSON.stringify(catalogo.meta.version)};\n\n` +
    `export const CAPITULOS_INDICE = ${JSON.stringify(capitulos, null, 4)} as const;\n\n` +
    `export const PARTIDAS_INDICE: ReadonlyArray<{\n` +
    `    codigo: string;\n` +
    `    capitulo: string;\n` +
    `    descripcion: string;\n` +
    `    unidad: string;\n` +
    `}> = ${JSON.stringify(partidas, null, 4)};\n`;

const destino = join(process.cwd(), "lib", "catalogo", "indiceTarifa.generado.ts");
writeFileSync(destino, contenido, "utf8");
console.log(`  ✔ ${partidas.length} partidas en ${capitulos.length} capítulos -> ${destino}`);