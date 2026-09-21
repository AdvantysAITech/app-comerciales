import { calcularPresupuesto, verificarCuadre, type EntradaPresupuesto } from "../../lib/documentos/motor";
import { aplicarAjustes, hayAjustes, type AjustesPresupuesto } from "../../lib/documentos/ajustes";

/**
 * scripts/tarifa/probar-ajustes.ts
 *
 * Comprueba que los ajustes de dirección hacen lo que dicen y que el
 * presupuesto sigue cuadrando después de aplicarlos.
 *
 *     npm run ajustes:probar
 *
 * No toca GHL: trabaja sobre la entrada del motor, que es donde vive la lógica.
 */

let fallos = 0;
function check(nombre: string, cond: boolean, detalle = "") {
    console.log(`${cond ? "  ok  " : "  FAIL"}  ${nombre}${detalle ? "  -> " + detalle : ""}`);
    if (!cond) fallos++;
}

function ajustes(parcial: Partial<AjustesPresupuesto>): AjustesPresupuesto {
    return {
        version: 1,
        lineas: {},
        autor: "Miguel",
        actualizadoEn: new Date().toISOString(),
        ...parcial,
    };
}

const ENTRADA: EntradaPresupuesto = {
    lineas: [
        { codigo: "DEM015", cantidad: 54 },
        { codigo: "FAC007", cantidad: 74 },
        { codigo: "IMP001", cantidad: 45 },
    ],
};

const BASE = calcularPresupuesto(ENTRADA);

// --- 0. Sin ajustes, nada cambia -------------------------------------------
console.log("\n== Sin ajustes ==");
check("hayAjustes(null) es falso", !hayAjustes(null));
check("hayAjustes({}) es falso", !hayAjustes(ajustes({})));
check("la entrada se devuelve intacta", aplicarAjustes(ENTRADA, null) === ENTRADA);

const sinTocar = calcularPresupuesto(aplicarAjustes(ENTRADA, ajustes({})));
check("mismo PEM que el cálculo base", sinTocar.pem === BASE.pem, `${sinTocar.pem} €`);

// --- 1. Precio ajustado ----------------------------------------------------
console.log("\n== Precio ajustado por dirección ==");
const conPrecio = calcularPresupuesto(
    aplicarAjustes(ENTRADA, ajustes({ lineas: { IMP001: { precioUnitario: 10 } } }))
);
const lineaImp = conPrecio.capitulos.flatMap((c) => c.lineas).find((l) => l.codigo === "IMP001")!;

check("precio unitario impreso = el ajustado", lineaImp.precioUnitario === 10);
check("importe = cantidad x precio ajustado", lineaImp.importe === 450, `${lineaImp.importe} €`);
check("el presupuesto cuadra", verificarCuadre(conPrecio).length === 0);
check(
    "hay aviso de precio ajustado",
    conPrecio.avisos.some((a) => a.codigo === "IMP001" && a.mensaje.includes("ajustado")),
);
check(
    "el coste CYPE no se toca",
    lineaImp.interno.precioCype ===
        BASE.capitulos.flatMap((c) => c.lineas).find((l) => l.codigo === "IMP001")!.interno.precioCype,
);

// --- 2. Cantidad sobre partida agregada ------------------------------------
// Dos zonas que caen en la misma partida: el override es la medición TOTAL,
// no se suma a lo capturado.
console.log("\n== Cantidad sobre partida agregada ==");
const dosZonas: EntradaPresupuesto = {
    lineas: [
        { codigo: "FAC007", cantidad: 74 },
        { codigo: "FAC007", cantidad: 26 },
    ],
};
const agregado = calcularPresupuesto(aplicarAjustes(dosZonas, ajustes({})));
check("sin override se suman las dos zonas", agregado.capitulos[0].lineas[0].cantidad === 100);

const conCantidad = calcularPresupuesto(
    aplicarAjustes(dosZonas, ajustes({ lineas: { FAC007: { cantidad: 80 } } }))
);
check("con override la medición es la de dirección", conCantidad.capitulos[0].lineas[0].cantidad === 80);
check("una sola línea en el documento", conCantidad.capitulos[0].lineas.length === 1);
check("el presupuesto cuadra", verificarCuadre(conCantidad).length === 0);

// --- 3. Partida excluida ---------------------------------------------------
console.log("\n== Partida excluida ==");
const sinImp = calcularPresupuesto(
    aplicarAjustes(ENTRADA, ajustes({ lineas: { IMP001: { excluida: true } } }))
);
check(
    "la partida desaparece",
    !sinImp.capitulos.flatMap((c) => c.lineas).some((l) => l.codigo === "IMP001"),
);
check("el PEM baja", sinImp.pem < BASE.pem, `${sinImp.pem} € < ${BASE.pem} €`);
check("el presupuesto cuadra", verificarCuadre(sinImp).length === 0);

let vacioLanzo = false;
try {
    aplicarAjustes(ENTRADA, ajustes({
        lineas: { DEM015: { excluida: true }, FAC007: { excluida: true }, IMP001: { excluida: true } },
    }));
} catch {
    vacioLanzo = true;
}
check("excluirlo todo lanza en vez de generar un documento vacío", vacioLanzo);

// --- 4. IVA ----------------------------------------------------------------
console.log("\n== Tipo de IVA ==");
const conIva21 = calcularPresupuesto(aplicarAjustes(ENTRADA, ajustes({ ivaTipo: 0.21 })));
check("el tipo se aplica", conIva21.ivaTipo === 0.21);
check("IVA = PEM x 21%", conIva21.ivaImporte === Math.round(conIva21.pem * 0.21 * 100) / 100);
check("el presupuesto cuadra", verificarCuadre(conIva21).length === 0);

// --- 5. Partida añadida ----------------------------------------------------
console.log("\n== Partida añadida por dirección ==");
const conAnadida = calcularPresupuesto(
    aplicarAjustes(ENTRADA, ajustes({ anadidas: [{ codigo: "RCD001", cantidad: 2 }] }))
);
check(
    "la partida entra en el cálculo",
    conAnadida.capitulos.flatMap((c) => c.lineas).some((l) => l.codigo === "RCD001"),
);
check("el PEM sube", conAnadida.pem > BASE.pem, `${conAnadida.pem} €`);
check("el presupuesto cuadra", verificarCuadre(conAnadida).length === 0);

// --- 6. Casos límite -------------------------------------------------------
console.log("\n== Casos límite ==");
const ajusteHuerfano = calcularPresupuesto(
    aplicarAjustes(ENTRADA, ajustes({ lineas: { ZZZ999: { precioUnitario: 5 } } }))
);
check("un ajuste sobre una partida que ya no está se ignora", ajusteHuerfano.pem === BASE.pem);

let precioNegativoLanzo = false;
try {
    calcularPresupuesto(aplicarAjustes(ENTRADA, ajustes({ lineas: { IMP001: { precioUnitario: -3 } } })));
} catch {
    precioNegativoLanzo = true;
}
check("un precio negativo lanza", precioNegativoLanzo);

const aCero = calcularPresupuesto(
    aplicarAjustes(ENTRADA, ajustes({ lineas: { IMP001: { precioUnitario: 0 } } }))
);
check(
    "precio 0 se admite (partida incluida sin cargo) y cuadra",
    verificarCuadre(aCero).length === 0 &&
        aCero.capitulos.flatMap((c) => c.lineas).find((l) => l.codigo === "IMP001")!.importe === 0,
);

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLO(S)`}\n`);
process.exit(fallos === 0 ? 0 : 1);