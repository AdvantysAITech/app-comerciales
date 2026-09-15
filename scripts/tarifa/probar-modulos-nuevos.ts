/**
 * scripts/tarifa/probar-modulos-nuevos.ts
 *
 * Gestión de residuos, Documentación y Varios (15/09/2026).
 *
 *   npm run modulos:probar
 *
 * Cubre el camino completo sin tocar GHL ni Soluciona: catálogo -> selección ->
 * validación -> payload -> auditoría -> motor económico.
 */
import { getModulo, getModulos, recorrerArbol, esPartida, type NodoCatalogo } from "../../lib/catalogo";
import { filtrarSinPrecio } from "../../lib/catalogo/disponibilidad";
import {
    buscarPartidas,
    codigoDeRutaBuscador,
    unidadFormularioDeTarifa,
    MODULO_BUSCADOR,
} from "../../lib/catalogo/buscador";
import {
    alternarNodo,
    alertasActivas,
    fijarCantidad,
    fijarNota,
    validarSeleccion,
    type SeleccionVisita,
} from "../../lib/visita/seleccion";
import { construirPayload } from "../../lib/visita/payload";
import {
    auditarPayload,
    mapearRuta,
    presupuestar,
    subrutaDe,
    validarMapeo,
} from "../../lib/documentos/mapeo-capitulos";
import { obtenerPartida } from "../../lib/documentos/tarifa";

let fallos = 0;
function check(nombre: string, cond: boolean, detalle = "") {
    console.log(`${cond ? "  ok  " : "  FAIL"}  ${nombre}${detalle ? "  -> " + detalle : ""}`);
    if (!cond) fallos++;
}

const SUB = "scala-valencia" as const;

// ---------------------------------------------------------------------------
console.log("\n== Catálogo ==");
// ---------------------------------------------------------------------------
const residuos = getModulo(SUB, "gestion_de_residuos")!;
const documentacion = getModulo(SUB, "documentacion")!;
const varios = getModulo(SUB, "varios")!;

check("Gestión de residuos es árbol", residuos?.captura === "arbol");
check("Documentación es árbol", documentacion?.captura === "arbol");
check("Varios es buscador", varios?.captura === "buscador");
check("no queda ningún módulo \"libre\"", getModulos(SUB).every((m) => m.captura !== "libre"));
check(
    "filtrarSinPrecio no poda nada de los módulos nuevos",
    JSON.stringify(filtrarSinPrecio(residuos).estructura) === JSON.stringify(residuos.estructura) &&
        JSON.stringify(filtrarSinPrecio(documentacion).estructura) === JSON.stringify(documentacion.estructura)
);

// ---------------------------------------------------------------------------
console.log("\n== Mapeo de Gestión de residuos y Documentación ==");
// ---------------------------------------------------------------------------
for (const modulo of [residuos, documentacion]) {
    let hojas = 0;
    recorrerArbol(modulo, (nodo: NodoCatalogo, ruta: string) => {
        if (!esPartida(nodo) || !nodo.medicion) return;
        hojas++;
        const m = mapearRuta(ruta);
        const partida = m?.codigo ? obtenerPartida(m.codigo) : undefined;
        if (!partida) {
            check(`${ruta} tiene partida`, false, m ? `código ${m.codigo}` : "sin mapeo");
            return;
        }
        const unidadEsperada = unidadFormularioDeTarifa(partida.unidad);
        if (unidadEsperada !== nodo.medicion.unidad) {
            check(`${ruta}: la unidad del formulario coincide con la tarifa`, false,
                `${nodo.medicion.unidad} vs ${partida.unidad} (${partida.codigo})`);
        }
    });
    check(`${modulo.label}: todas las hojas medibles tienen partida y unidad coherente`, hojas > 0, `${hojas} hojas`);
}

const codigosResiduos = new Set<string>();
recorrerArbol(residuos, (nodo, ruta) => {
    const c = mapearRuta(ruta)?.codigo;
    if (c) codigosResiduos.add(c);
});
check(
    "AMI003 (bajantes de fibrocemento) NO está en residuos: se cobraría dos veces",
    !codigosResiduos.has("AMI003")
);

const fallosMapeo = validarMapeo();
check("validarMapeo() sin fallos (incluye el índice del buscador)", fallosMapeo.length === 0, fallosMapeo.join(" | "));

// ---------------------------------------------------------------------------
console.log("\n== Buscador ==");
// ---------------------------------------------------------------------------
let hojasBuscador = 0;
recorrerArbol(varios, (nodo) => {
    if (esPartida(nodo) && nodo.medicion) hojasBuscador++;
});
check("el buscador ofrece las 199 partidas de la tarifa", hojasBuscador === 199, String(hojasBuscador));
check("codigoDeRutaBuscador: hoja", codigoDeRutaBuscador("varios.c10.rcd001") === "RCD001");
check("codigoDeRutaBuscador: texto libre", codigoDeRutaBuscador("varios.otros") === undefined);
check("codigoDeRutaBuscador: otro módulo", codigoDeRutaBuscador("medianeras.picado.picado_cantos") === undefined);

const r1 = buscarPartidas(MODULO_BUSCADOR, varios.estructura, "contenedor");
check("\"contenedor\" encuentra contenedores RCD", r1.some((r) => r.codigo === "RCD001"), r1.map((r) => r.codigo).join(","));
const r2 = buscarPartidas(MODULO_BUSCADOR, varios.estructura, "demolición cerámico");
check("sin distinguir acentos y con varias palabras", r2.some((r) => r.codigo === "DEM005"), r2.map((r) => r.codigo).join(","));
const r3 = buscarPartidas(MODULO_BUSCADOR, varios.estructura, "rcd009");
check("por código, primero", r3[0]?.codigo === "RCD009");
check("una letra no busca", buscarPartidas(MODULO_BUSCADOR, varios.estructura, "a").length === 0);
check("respeta el límite", buscarPartidas(MODULO_BUSCADOR, varios.estructura, "de", 5).length === 5);
check("todas las rutas devueltas se resuelven a su código", r1.every((r) => mapearRuta(r.ruta)?.codigo === r.codigo));

// ---------------------------------------------------------------------------
console.log("\n== Selección y validación ==");
// ---------------------------------------------------------------------------
const modulosElegidos = ["gestion_de_residuos", "documentacion", "varios"];
let sel: SeleccionVisita = {};
const marcar = (ruta: string) => (sel = alternarNodo(sel, SUB, ruta));

marcar("gestion_de_residuos.escombro");
marcar("gestion_de_residuos.escombro.contenedor");
marcar("gestion_de_residuos.escombro.contenedor.contenedor_7m3");
sel = fijarCantidad(sel, "gestion_de_residuos.escombro.contenedor.contenedor_7m3", 2);
marcar("gestion_de_residuos.escombro.canon_vertedero");
sel = fijarCantidad(sel, "gestion_de_residuos.escombro.canon_vertedero", 14);
marcar("gestion_de_residuos.amianto");
marcar("gestion_de_residuos.amianto.placas_cubierta");
sel = fijarCantidad(sel, "gestion_de_residuos.amianto.placas_cubierta", 40);
marcar("gestion_de_residuos.planes");
marcar("gestion_de_residuos.planes.plan_trabajo_amianto");
sel = fijarCantidad(sel, "gestion_de_residuos.planes.plan_trabajo_amianto", 1);

marcar("documentacion.seguridad_salud");
marcar("documentacion.seguridad_salud.estudio_basico");
sel = fijarCantidad(sel, "documentacion.seguridad_salud.estudio_basico", 1);
marcar("documentacion.otra_documentacion");
sel = fijarNota(sel, "documentacion.otra_documentacion", "Licencia de obra menor");

marcar("varios.c09.sso006");
check("partida buscada sin medición bloquea el envío",
    validarSeleccion(SUB, modulosElegidos, sel).some((e) => e.ruta === "varios.c09.sso006"));
sel = fijarCantidad(sel, "varios.c09.sso006", 25);
marcar("varios.otros");
sel = fijarNota(sel, "varios.otros", "Retirada de antena");

const errores = validarSeleccion(SUB, modulosElegidos, sel);
check("selección completa sin errores", errores.length === 0, errores.map((e) => e.mensaje).join(" | "));

const alertas = alertasActivas(SUB, modulosElegidos, sel);
check(
    "marcar Amianto activa la alerta (y con ella el mínimo de 3 fotos del formulario)",
    alertas.some((a) => a.moduloKey === "gestion_de_residuos")
);
const soloEscombro = alertasActivas(SUB, ["gestion_de_residuos"], {
    "gestion_de_residuos.escombro": {},
    "gestion_de_residuos.escombro.canon_vertedero": { cantidad: 3 },
});
check("solo escombro no exige fotos", soloEscombro.length === 0);

// ---------------------------------------------------------------------------
console.log("\n== Payload, auditoría y motor ==");
// ---------------------------------------------------------------------------
const payload = construirPayload({
    subcuenta: SUB,
    empresa: "Scala Valencia",
    comercial: "Prueba",
    comunidadId: "c1",
    comunidadNombre: "C/ Prueba, 1",
    comunidadCreada: false,
    administradorId: "a1",
    administradorNombre: "Admin",
    contacto: "Contacto",
    telefono: "600000000",
    fechaVisita: "2026-09-15",
    observaciones: "",
    modulosElegidos,
    seleccion: sel,
    fotosPorModulo: {},
});

const auditoria = auditarPayload(payload);
check("ninguna ruta desconocida", auditoria.desconocidas.length === 0, auditoria.desconocidas.join(","));
check("ninguna ruta sin equivalencia", auditoria.sinEquivalencia.length === 0);
check(
    "los dos textos libres van a avisos, no al cálculo",
    auditoria.textoLibre.map((t) => t.ruta).sort().join(",") === "documentacion.otra_documentacion,varios.otros"
);

const presupuesto = presupuestar(payload);
const codigos = presupuesto.capitulos.flatMap((c) => c.lineas.map((l) => l.codigo)).sort();
const esperados = ["AMI002", "AMI008", "RCD001", "RCD007", "SSO001", "SSO006"];
check("el motor valora exactamente las 6 partidas", JSON.stringify(codigos) === JSON.stringify(esperados), codigos.join(","));

// Cada línea se redondea a céntimos antes de sumar, igual que el motor.
const linea = (cantidad: number, codigo: string) =>
    Math.round(cantidad * obtenerPartida(codigo)!.tarifaEmpresa * 100);
const esperadoPem =
    (linea(2, "RCD001") +
        linea(14, "RCD007") +
        linea(40, "AMI002") +
        linea(1, "AMI008") +
        linea(1, "SSO001") +
        linea(25, "SSO006")) /
    100;
check("PEM = suma de cantidad x tarifa", Math.abs(presupuesto.pem - esperadoPem) < 0.005, `${presupuesto.pem} vs ${esperadoPem}`);

const falsa = structuredClone(payload);
falsa.modulos.find((m) => m.key === "varios")!.partidas.push({
    ruta: "varios.c10.xxx999",
    camino: ["x"],
    label: "x",
    cantidad: 1,
});
check("un código inexistente en el buscador bloquea como ruta desconocida",
    auditarPayload(falsa).desconocidas.includes("varios.c10.xxx999"));
check("subrutaDe sigue funcionando con rutas del buscador", subrutaDe("varios.c10.rcd001") === "c10.rcd001");

console.log(fallos === 0 ? "\n✔ Todos los checks pasan.\n" : `\n✘ ${fallos} fallo(s).\n`);
process.exit(fallos === 0 ? 0 : 1);