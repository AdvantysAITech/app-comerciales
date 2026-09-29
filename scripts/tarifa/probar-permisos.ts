import { filtroPropietario, puedeVerOportunidad } from "../../lib/ghl/oportunidades";

/**
 * scripts/tarifa/probar-permisos.ts
 *
 * Quién puede ver qué oportunidad (lib/ghl/oportunidades.ts, usado por
 * lib/permisos.ts en todas las rutas que reciben un id).
 *
 *     npm run permisos:probar
 *
 * El caso que lo motiva (24/09/2026): con el id de una oportunidad ajena, un
 * comercial podía regenerar su presupuesto o consultar su estado.
 */

let fallos = 0;
function check(nombre: string, cond: boolean) {
    console.log(`${cond ? "  ok  " : "  FAIL"}  ${nombre}`);
    if (!cond) fallos++;
}

const jose = filtroPropietario({ rol: "comercial", usuarioGhl: "GHL_JOSE" });
const joseSinId = filtroPropietario({ rol: "comercial", usuarioGhl: null });
const joseIdVacio = filtroPropietario({ rol: "comercial", usuarioGhl: "   " });
const miguel = filtroPropietario({ rol: "direccion", usuarioGhl: "GHL_MIGUEL" });

const deJose = { asignadoA: "GHL_JOSE" };
const deOtro = { asignadoA: "GHL_TONI" };
const sinPropietario = { asignadoA: null };

console.log("\npuedeVerOportunidad");
check("comercial ve la suya", puedeVerOportunidad(jose, deJose));
check("comercial NO ve la de otro", !puedeVerOportunidad(jose, deOtro));
check("comercial NO ve una sin propietario", !puedeVerOportunidad(jose, sinPropietario));
check("comercial sin id de GHL no ve nada", !puedeVerOportunidad(joseSinId, deJose));
check("comercial con id en blanco no ve nada", !puedeVerOportunidad(joseIdVacio, sinPropietario));
check("dirección ve la de un comercial", puedeVerOportunidad(miguel, deJose));
check("dirección ve una sin propietario", puedeVerOportunidad(miguel, sinPropietario));

console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} fallo(s).\n`);
process.exit(fallos === 0 ? 0 : 1);
