import { desviacion, leerDecimal } from "../../lib/numero";

/**
 * scripts/tarifa/probar-numero.ts
 *
 * Lectura de importes tecleados en la pantalla de revisión.
 *
 *     npm run numero:probar
 *
 * El caso que lo motiva (24/09/2026): "14.5" se leía como 145.
 */

let fallos = 0;
function check(nombre: string, cond: boolean, detalle = "") {
    console.log(`${cond ? "  ok  " : "  FAIL"}  ${nombre}${detalle ? "  -> " + detalle : ""}`);
    if (!cond) fallos++;
}

const CASOS: Array<[string, number | null]> = [
    // El bug: punto decimal.
    ["14.5", 14.5],
    ["54.5", 54.5],
    ["0.29", 0.29],
    [".5", 0.5],
    // Coma decimal (teclado español).
    ["14,5", 14.5],
    ["54,50", 54.5],
    ["12,15", 12.15],
    // Miles con punto y coma decimal.
    ["1.250,50", 1250.5],
    ["1.234.567,8", 1234567.8],
    // Varios puntos = miles.
    ["1.250.000", 1250000],
    // Enteros, espacios y símbolo de euro.
    ["145", 145],
    [" 12,15 € ", 12.15],
    ["1 250,50", 1250.5],
    // Ambiguo: un solo punto es decimal (ver lib/numero.ts).
    ["1.250", 1.25],
    // Ilegibles: nunca 0.
    ["", null],
    ["   ", null],
    ["abc", null],
    ["12,5,3", null],
    ["1.25.3", null],
    ["12.5,3", null],
    ["1,2.5", null],
    ["12a", null],
];

console.log("\nleerDecimal");
for (const [entrada, esperado] of CASOS) {
    const obtenido = leerDecimal(entrada);
    check(JSON.stringify(entrada), obtenido === esperado, `esperado ${esperado}, obtenido ${obtenido}`);
}

console.log("\ndesviacion");
check("igual = 1", desviacion(12.15, 12.15) === 1);
check("145 frente a 12,15 > 11", (desviacion(145, 12.15) ?? 0) > 11);
check("simétrica", desviacion(6, 12) === desviacion(24, 12));
check("sin referencia = null", desviacion(10, 0) === null);
check("valor 0 = null", desviacion(0, 10) === null);

console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} fallo(s).\n`);
process.exit(fallos === 0 ? 0 : 1);