import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { calcularPresupuesto, assertCuadre, aCentimos, type EntradaPresupuesto } from "../../lib/documentos/motor";
import {
    construirPortada,
    verificarPortada,
    repartirPorcentajes,
    abreviarImporte,
    validarCronograma,
    type FasePortada,
} from "../../lib/documentos/portada";
import { renderizarPortada } from "../../lib/documentos/portada.svg";

let fallos = 0;
function check(nombre: string, cond: boolean, detalle = "") {
    console.log(`${cond ? "  ok  " : "  FAIL"}  ${nombre}${detalle ? "  -> " + detalle : ""}`);
    if (!cond) fallos++;
}

// --- Presupuesto de referencia (mismo fixture que probar-motor) ------------
const entrada: EntradaPresupuesto = {
    lineas: [
        { codigo: "DEM015", cantidad: 54 },
        { codigo: "DEM001", cantidad: 190 },
        { codigo: "DEM017", cantidad: 950 },
        { codigo: "FAC010", cantidad: 74 },
        { codigo: "FAC007", cantidad: 74 },
        { codigo: "REV001", cantidad: 190 },
        { codigo: "IMP001", cantidad: 45 },
        { codigo: "AND002", cantidad: 950 },
        { codigo: "AND006", cantidad: 950 },
        { codigo: "CER001", cantidad: 6, unidadSeleccionada: "ud" },
        { codigo: "RCD001", cantidad: 6, unidadSeleccionada: "ud" },
        { codigo: "RCD004", cantidad: 36, unidadSeleccionada: "ud" },
    ],
};

const p = calcularPresupuesto(entrada);
assertCuadre(p);

// Cronograma PROVISIONAL: reparto proporcional al importe de cada capítulo.
// No es un plazo real y no se publica así. Está para validar que la banda
// encaja; en H6 lo sustituye la propuesta de la IA, ya validada.
function cronogramaProvisional(dias: number): FasePortada[] {
    const fases: FasePortada[] = [];
    let dia = 1;

    p.capitulos.forEach((c, i) => {
        const tramo = Math.max(1, Math.round((c.total / p.pem) * dias));
        const fin = i === p.capitulos.length - 1 ? dias : Math.min(dias, dia + tramo - 1);
        fases.push({
            etiqueta: dia === fin ? `Día ${dia}` : `Días ${dia}-${fin}`,
            diaInicio: dia,
            diaFin: fin,
        });
        dia = fin + 1;
    });

    return fases;
}

const portada = construirPortada(p, {
    subcuenta: "vertical-projects",
    titulo: "Rehabilitación de fachada y cubierta",
    comunidad: "Cdad. Prop. Carrar 5-7",
    localidad: "Gandía",
    expediente: "VP-2026-0001",
    fecha: "18/06/2026",
    administrador: "Ecofincas",
    administradorLocalidad: "Paterna",
    cronograma: cronogramaProvisional(35),
});

// --- Cuadre con el motor ---------------------------------------------------
console.log("\n== Cuadre con el motor ==");
const errores = verificarPortada(portada, p);
check("la portada cuadra", errores.length === 0, errores.join(" | "));
check(
    "un capítulo de portada por capítulo del motor",
    portada.capitulos.length === p.capitulos.length,
    String(portada.capitulos.length)
);
check(
    "códigos compartidos con el desglose",
    portada.capitulos.every((c, i) => c.codigoJerarquico === p.capitulos[i].codigoJerarquico),
    portada.capitulos.map((c) => c.codigoJerarquico).join(",")
);

// --- Porcentajes -----------------------------------------------------------
console.log("\n== Porcentajes ==");
const suma = portada.capitulos.reduce((acc, c) => acc + Math.round(c.porcentaje * 10), 0);
check("suman 100,0 exacto", suma === 1000, `${suma / 10} %`);

const iMayor = portada.capitulos.reduce(
    (mejor, c, i) => (c.importe > portada.capitulos[mejor].importe ? i : mejor),
    0
);
check(
    "el resto lo absorbe el capítulo mayor",
    portada.capitulos[iMayor].importe === Math.max(...portada.capitulos.map((c) => c.importe)),
    `${portada.capitulos[iMayor].codigoJerarquico} (${portada.capitulos[iMayor].porcentaje} %)`
);

const tresIguales = repartirPorcentajes([3333, 3333, 3334], 10000);
check("caso 33,33 % x3 sigue sumando 100", tresIguales.reduce((a, b) => a + b, 0) === 100, tresIguales.join(" + "));

const unoSolo = repartirPorcentajes([5000], 5000);
check("capítulo único al 100 %", unoSolo[0] === 100, String(unoSolo[0]));

const doce = repartirPorcentajes(Array(12).fill(1000), 12000);
check("12 capítulos iguales suman 100", doce.reduce((a, b) => a + Math.round(b * 10), 0) / 10 === 100, doce.join(","));

// --- Abreviatura -----------------------------------------------------------
console.log("\n== Abreviatura de importe ==");
check("59.910,60 -> 59,9k €", abreviarImporte(59910.6) === "59,9k €", abreviarImporte(59910.6));
check("840,50 -> 840,50 €", abreviarImporte(840.5) === "840,50 €", abreviarImporte(840.5));
check("1.250.000 -> 1,25M €", abreviarImporte(1250000) === "1,25M €", abreviarImporte(1250000));

// --- Cronograma ------------------------------------------------------------
console.log("\n== Validación de cronograma ==");
check("el provisional es contiguo", validarCronograma(portada.cronograma).length === 0);
check(
    "detecta hueco entre tramos",
    validarCronograma([
        { etiqueta: "a", diaInicio: 1, diaFin: 3 },
        { etiqueta: "b", diaInicio: 5, diaFin: 8 },
    ]).length > 0
);
check(
    "detecta solape",
    validarCronograma([
        { etiqueta: "a", diaInicio: 1, diaFin: 5 },
        { etiqueta: "b", diaInicio: 4, diaFin: 8 },
    ]).length > 0
);
check(
    "detecta tramo invertido",
    validarCronograma([{ etiqueta: "a", diaInicio: 5, diaFin: 2 }]).length > 0
);
check("sin cronograma es válido", validarCronograma(null).length === 0);

const conCronogramaRoto = construirPortada(p, {
    subcuenta: "scala-valencia",
    comunidad: "C/ Islas Canarias, 180",
    localidad: "Valencia",
    expediente: "SV-2026-0001",
    fecha: "10/09/2026",
    administrador: "Fincas Ejemplo",
    cronograma: [{ etiqueta: "a", diaInicio: 4, diaFin: 9 }],
});
check("un cronograma inválido se descarta, no revienta", conCronogramaRoto.cronograma === null);

// --- Degradación -----------------------------------------------------------
console.log("\n== Degradación ==");
check("sin título de IA hay respaldo", conCronogramaRoto.titulo.length > 0, conCronogramaRoto.titulo);
check(
    "sin diagnóstico de IA se derivan 5 tarjetas",
    conCronogramaRoto.diagnostico.length === Math.min(5, p.capitulos.length),
    String(conCronogramaRoto.diagnostico.length)
);
check(
    "el respaldo ordena por importe",
    conCronogramaRoto.diagnostico[0].titulo === [...p.capitulos].sort((a, b) => b.total - a.total)[0].nombre,
    conCronogramaRoto.diagnostico[0].titulo
);

// --- Render ----------------------------------------------------------------
console.log("\n== Render ==");
const svg = renderizarPortada(portada);
check("es un SVG", svg.startsWith("<svg") && svg.trimEnd().endsWith("</svg>"));
check("determinista", renderizarPortada(portada) === svg);
check("sin markerkeys sin resolver", !/\{\{|\[\[/.test(svg));

const importesEnSvg = portada.capitulos.every((c) => svg.includes(c.importeFormateado));
check("todos los importes de capítulo aparecen", importesEnSvg);
check("el PEM aparece", svg.includes(portada.pemFormateado));
check("el TOTAL aparece", svg.includes(portada.totalFormateado));

// Portada de 12 capítulos, para comprobar que la maqueta aguanta el máximo.
const doceCap = calcularPresupuesto({
    lineas: [
        { codigo: "DEM001", cantidad: 100 },
        { codigo: "AND002", cantidad: 100 },
        { codigo: "FAC007", cantidad: 100 },
        { codigo: "REV001", cantidad: 100 },
        { codigo: "PIN008", cantidad: 100 },
        { codigo: "IMP001", cantidad: 100 },
        { codigo: "AMI003", cantidad: 100 },
        { codigo: "CER001", cantidad: 10 },
        { codigo: "SSO001", cantidad: 10 },
        { codigo: "RCD001", cantidad: 10 },
        { codigo: "VP004", cantidad: 10 },
        { codigo: "INS004", cantidad: 100 },
    ],
});
const portadaDoce = construirPortada(doceCap, {
    subcuenta: "scala-valencia",
    titulo: "Intervención integral en zonas comunes",
    comunidad: "C/ Islas Canarias, 180",
    localidad: "Valencia",
    expediente: "SV-2026-0002",
    fecha: "10/09/2026",
    administrador: "Fincas Ejemplo",
    administradorLocalidad: "Valencia",
});
check(
    "12 capítulos cuadran",
    verificarPortada(portadaDoce, doceCap).length === 0,
    verificarPortada(portadaDoce, doceCap).join(" | ")
);
check("12 capítulos: PEM coherente", aCentimos(doceCap.pem) > 0);

// Salida en el repo, no en /tmp: en Windows "/tmp" resuelve a "C:\\tmp", que
// no existe, y el script moria al final con ENOENT despues de pasar todos los
// checks. `join` mantiene el separador correcto en los dos sistemas.
const salida = join(process.cwd(), "salida", "portada");
mkdirSync(salida, { recursive: true });

const ficheros: Array<[string, string]> = [
    ["portada-vertical.svg", svg],
    ["portada-scala-12.svg", renderizarPortada(portadaDoce)],
];

for (const [nombre, contenido] of ficheros) {
    writeFileSync(join(salida, nombre), contenido, "utf8");
}

console.log(`\n  SVG en ${salida}`);
for (const [nombre] of ficheros) console.log(`    ${nombre}`);

console.log(fallos === 0 ? `\n✔ ${"Todos los checks pasan."}\n` : `\n✘ ${fallos} fallo(s).\n`);
process.exit(fallos === 0 ? 0 : 1);