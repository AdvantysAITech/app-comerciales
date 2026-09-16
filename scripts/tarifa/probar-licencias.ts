/**
 * scripts/tarifa/probar-licencias.ts
 *
 * Amianto fuera de Vertical Projects (16/09/2026, opción A).
 *
 *   npm run licencias:probar
 *
 * Qué garantiza:
 *  1. Cada ruta de RUTAS_SIN_LICENCIA existe en el catálogo base. Si una clave
 *     cambia, la poda dejaría de actuar en silencio.
 *  2. En Vertical no queda NINGUNA hoja que mapee a un código AMI, en ningún
 *     módulo ni en el buscador. Es la red de seguridad real: si alguien añade
 *     un nodo de amianto nuevo, esto falla.
 *  3. Scala Valencia conserva todo lo de amianto.
 *  4. En Vertical, marcar una ruta de amianto no hace nada y un payload
 *     manipulado con esas rutas sale sin ellas (lo que ocurre en el servidor).
 *  5. El resto de Vertical sigue intacto.
 *
 * Sin GHL ni Soluciona.
 */
import {
    buscarNodoPorRuta,
    esPartida,
    getModulo,
    getModulos,
    recorrerArbol,
} from "../../lib/catalogo";
import { MODULOS } from "../../lib/catalogo/modulos";
import { RUTAS_SIN_LICENCIA } from "../../lib/catalogo/licencias";
import { buscarPartidas, MODULO_BUSCADOR } from "../../lib/catalogo/buscador";
import { alternarNodo, alertasActivas, type SeleccionVisita } from "../../lib/visita/seleccion";
import { construirPayload } from "../../lib/visita/payload";
import { mapearRuta } from "../../lib/documentos/mapeo-capitulos";

let fallos = 0;
function check(nombre: string, cond: boolean, detalle = "") {
    console.log(`${cond ? "  ok  " : "  FAIL"}  ${nombre}${detalle ? "  -> " + detalle : ""}`);
    if (!cond) fallos++;
}

const SCALA = "scala-valencia" as const;
const VERTICAL = "vertical-projects" as const;

const ES_AMIANTO = /amiant|fibrocemento|uralita|rera/i;

/** Hojas de la subcuenta cuyo código de tarifa es AMI o cuyo texto habla de amianto. */
function hojasAmianto(subcuenta: typeof SCALA | typeof VERTICAL): string[] {
    const encontradas: string[] = [];
    for (const modulo of getModulos(subcuenta)) {
        recorrerArbol(modulo, (nodo, ruta) => {
            if (!esPartida(nodo)) return;
            const codigo = mapearRuta(ruta)?.codigo ?? "";
            if (codigo.startsWith("AMI") || ES_AMIANTO.test(nodo.label)) encontradas.push(`${ruta} (${codigo || "sin código"})`);
        });
    }
    return encontradas;
}

// ---------------------------------------------------------------------------
console.log("\n== Rutas de la lista ==");
// ---------------------------------------------------------------------------
for (const ruta of RUTAS_SIN_LICENCIA[VERTICAL]) {
    const [moduloKey, ...resto] = ruta.split(".");
    const base = MODULOS.find((m) => m.key === moduloKey);
    let nivel = base?.estructura ?? [];
    let existe = Boolean(base);
    for (const key of resto) {
        const nodo = nivel.find((n) => n.key === key);
        if (!nodo) {
            existe = false;
            break;
        }
        nivel = nodo.hijos ?? [];
    }
    check(`existe en el catálogo base: ${ruta}`, existe);
    check(`no se resuelve en Vertical: ${ruta}`, !buscarNodoPorRuta(VERTICAL, ruta));
    check(`sí se resuelve en Scala: ${ruta}`, Boolean(buscarNodoPorRuta(SCALA, ruta)));
}

// ---------------------------------------------------------------------------
console.log("\n== Vertical sin amianto ==");
// ---------------------------------------------------------------------------
const amiantoVertical = hojasAmianto(VERTICAL);
check("ninguna hoja de Vertical mapea a AMI ni habla de amianto", amiantoVertical.length === 0, amiantoVertical.join(" | "));

const alertasVertical: string[] = [];
for (const modulo of getModulos(VERTICAL)) {
    recorrerArbol(modulo, (nodo, ruta) => {
        if (nodo.alerta && ES_AMIANTO.test(nodo.alerta)) alertasVertical.push(ruta);
    });
}
check("Vertical no tiene nodos con alerta de amianto", alertasVertical.length === 0, alertasVertical.join(" | "));

const variosVertical = getModulo(VERTICAL, MODULO_BUSCADOR)!;
for (const consulta of ["amianto", "fibrocemento", "ami001", "rera"]) {
    const r = buscarPartidas(MODULO_BUSCADOR, variosVertical.estructura, consulta);
    check(`buscador de Vertical: "${consulta}" no devuelve nada`, r.length === 0, r.map((x) => x.codigo).join(","));
}

// ---------------------------------------------------------------------------
console.log("\n== Scala conserva el amianto ==");
// ---------------------------------------------------------------------------
const codigosScala = new Set(hojasAmianto(SCALA).map((h) => h.match(/\((AMI\d+)\)/)?.[1]).filter(Boolean));
for (const codigo of ["AMI002", "AMI003", "AMI004", "AMI005", "AMI006", "AMI007", "AMI008", "AMI009"]) {
    check(`Scala ofrece ${codigo} en los módulos de captura`, codigosScala.has(codigo));
}
const variosScala = getModulo(SCALA, MODULO_BUSCADOR)!;
check(
    "buscador de Scala encuentra el capítulo 1.07",
    buscarPartidas(MODULO_BUSCADOR, variosScala.estructura, "amianto", 50).length === 12
);

// ---------------------------------------------------------------------------
console.log("\n== Selección y payload ==");
// ---------------------------------------------------------------------------
const rutaAmianto = "gestion_de_residuos.amianto.placas_cubierta";
let sel: SeleccionVisita = {};
sel = alternarNodo(sel, VERTICAL, "gestion_de_residuos.amianto");
check("Vertical: marcar el grupo Amianto no hace nada", Object.keys(sel).length === 0);

// Petición manipulada: rutas de amianto inyectadas a mano junto a una válida.
const manipulada: SeleccionVisita = {
    "gestion_de_residuos.amianto": {},
    [rutaAmianto]: { cantidad: 40 },
    "gestion_de_residuos.planes": {},
    "gestion_de_residuos.planes.plan_trabajo_amianto": { cantidad: 1 },
    "gestion_de_residuos.planes.plan_gestion_residuos": { cantidad: 1 },
    "bajantes.exterior": {},
    "bajantes.exterior.retirada": {},
    "bajantes.exterior.retirada.fibrocemento": {},
    "bajantes.exterior.retirada.fibrocemento.normal": { cantidad: 12 },
    "varios.c07.ami001": { cantidad: 10 },
    "varios.c10.rcd001": { cantidad: 1 },
};
const modulosElegidos = ["gestion_de_residuos", "bajantes", "varios"];

const base = {
    empresa: "x",
    comercial: "x",
    comunidadId: null,
    comunidadNombre: "C/ Prueba, 1",
    comunidadCreada: false,
    administradorId: null,
    administradorNombre: null,
    contacto: "x",
    telefono: "600000000",
    fechaVisita: "2026-09-16",
    observaciones: "",
    modulosElegidos,
    seleccion: manipulada,
    fotosPorModulo: {},
};

const payloadVertical = construirPayload({ ...base, subcuenta: VERTICAL } as Parameters<typeof construirPayload>[0]);
const rutasVertical = payloadVertical.modulos.flatMap((m) => m.partidas.map((p) => p.ruta));
check(
    "Vertical: el payload descarta todas las rutas de amianto",
    rutasVertical.every((r) => !(mapearRuta(r)?.codigo ?? "").startsWith("AMI")),
    rutasVertical.join(",")
);
check(
    "Vertical: el payload conserva las partidas legítimas",
    rutasVertical.includes("gestion_de_residuos.planes.plan_gestion_residuos") && rutasVertical.includes("varios.c10.rcd001"),
    rutasVertical.join(",")
);
check(
    "Vertical: sin alertas en el payload",
    payloadVertical.modulos.every((m) => m.alertas.length === 0) &&
        alertasActivas(VERTICAL, modulosElegidos, manipulada).length === 0
);

const payloadScala = construirPayload({ ...base, subcuenta: SCALA } as Parameters<typeof construirPayload>[0]);
const rutasScala = payloadScala.modulos.flatMap((m) => m.partidas.map((p) => p.ruta));
check(
    "Scala: la misma selección conserva el amianto",
    [rutaAmianto, "varios.c07.ami001", "bajantes.exterior.retirada.fibrocemento.normal"].every((r) => rutasScala.includes(r)),
    rutasScala.join(",")
);

// ---------------------------------------------------------------------------
console.log("\n== Resto de Vertical intacto ==");
// ---------------------------------------------------------------------------
check("mismos módulos en las dos subcuentas", getModulos(VERTICAL).length === getModulos(SCALA).length);

let hojasScala = 0;
let hojasVertical = 0;
for (const m of getModulos(SCALA)) recorrerArbol(m, (n) => void (esPartida(n) && hojasScala++));
for (const m of getModulos(VERTICAL)) recorrerArbol(m, (n) => void (esPartida(n) && hojasVertical++));
const podadas = hojasScala - hojasVertical;
// 5 amianto + 2 planes + 2x2 fibrocemento en bajantes + 12 del capítulo 07.
check("Vertical pierde exactamente 23 hojas", podadas === 23, `${hojasScala} Scala / ${hojasVertical} Vertical`);

console.log(fallos === 0 ? "\n✔ Todos los checks pasan.\n" : `\n✘ ${fallos} fallo(s).\n`);
process.exit(fallos === 0 ? 0 : 1);