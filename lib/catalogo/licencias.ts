import type { ModuloTrabajo, NodoCatalogo } from "./tipos";

/**
 * lib/catalogo/licencias.ts
 *
 * Trabajos que una subcuenta NO puede ofrecer porque la empresa no tiene la
 * licencia que exigen.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ EXISTE ESTO (16/09/2026)
 * ---------------------------------------------------------------------------
 * Vertical Projects no tiene licencia RERA para retirar amianto (DERCAS §4.1).
 * Hasta hoy las dos subcuentas compartían el mismo árbol y Toni podía marcar
 * partidas AMI, que se guardaban en el GHL de Vertical y se habrían valorado
 * en un presupuesto con la marca de Vertical. La única barrera era un texto de
 * alerta.
 *
 * Decisión de Jacob (16/09/2026), opción A: en Vertical no se muestra ninguna
 * opción de amianto. Es una DESVIACIÓN TEMPORAL del DERCAS §5.4, que pide que
 * Toni capture el trabajo y se derive a Scala Valencia. La derivación entre
 * subcuentas (opción C) queda pendiente; cuando exista, esta poda se sustituye
 * por la captura + derivación, no se amplía.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ SE PODA EL CATÁLOGO Y NO SOLO EL FORMULARIO
 * ---------------------------------------------------------------------------
 * `filtrarSinPrecio` (disponibilidad.ts) solo actúa en el formulario: el
 * catálogo sigue completo para que la auditoría vea lo que falta por decidir.
 * Aquí es al revés: el trabajo no debe existir para esa subcuenta en ningún
 * sitio. Podando en `getCatalogo()`:
 *  - el formulario no lo pinta, tampoco en el buscador de Varios;
 *  - `alternarNodo` ignora la ruta, porque no se resuelve;
 *  - `construirPayload` en el servidor recorre el catálogo de la subcuenta de
 *    la SESIÓN, así que una petición manipulada con rutas de amianto llega a
 *    GHL sin esas partidas.
 *
 * ---------------------------------------------------------------------------
 * CÓMO SE MANTIENE
 * ---------------------------------------------------------------------------
 * Las rutas incluyen el prefijo del módulo, a diferencia de SUBRUTAS_SIN_PRECIO:
 * "retirada.fibrocemento" existe también fuera de Bajantes y no queremos podar
 * por coincidencia. `npm run licencias:probar` comprueba que cada ruta existe
 * en el catálogo base y que en Vertical no queda NINGUNA hoja que mapee a un
 * código AMI; si mañana se añade un nodo de amianto en otro módulo, el test
 * falla y obliga a añadirlo aquí.
 */

type Subcuenta = "scala-valencia" | "vertical-projects";

export const RUTAS_SIN_LICENCIA: Record<Subcuenta, ReadonlySet<string>> = {
    "scala-valencia": new Set(),
    "vertical-projects": new Set([
        // Gestión de residuos: grupo completo (AMI002, AMI004-AMI007).
        "gestion_de_residuos.amianto",
        // Planes y controles: plan de trabajo (AMI008) y mediciones higiénicas
        // de aire (AMI009). El plan de gestión de residuos (RCD009) se queda.
        "gestion_de_residuos.planes.plan_trabajo_amianto",
        "gestion_de_residuos.planes.mediciones_higienicas",
        // Bajantes: las dos opciones de fibrocemento mapean a AMI003. "Normal"
        // también: el fibrocemento es amianto lleve o no documentación.
        "bajantes.interior.retirada.fibrocemento",
        "bajantes.exterior.retirada.fibrocemento",
        // Varios (buscador): capítulo 1.07 "Retirada de amianto RERA" entero.
        "varios.c07",
    ]),
};

/**
 * Poda recursiva por ruta completa.
 *
 * Igual que en disponibilidad.ts, un grupo que se queda sin hijos desaparece:
 * no se ofrece una carpeta vacía.
 */
function podar(
    nodos: readonly NodoCatalogo[],
    ancestros: readonly string[],
    excluidas: ReadonlySet<string>
): NodoCatalogo[] {
    const salida: NodoCatalogo[] = [];

    for (const nodo of nodos) {
        const keys = [...ancestros, nodo.key];

        if (excluidas.has(keys.join("."))) continue;

        if (nodo.hijos?.length) {
            const hijos = podar(nodo.hijos, keys, excluidas);
            if (hijos.length === 0) continue;
            salida.push({ ...nodo, hijos });
            continue;
        }

        salida.push(nodo);
    }

    return salida;
}

/**
 * Devuelve los módulos sin los trabajos que la subcuenta no puede ejecutar.
 *
 * No muta: el catálogo base (MODULOS) sigue completo para Scala Valencia.
 * Un módulo con estructura que se quedara vacío tras la poda se elimina; los
 * módulos que ya nacen vacíos (Proyectos, importación) se conservan.
 */
export function aplicarLicencias(subcuenta: Subcuenta, modulos: readonly ModuloTrabajo[]): ModuloTrabajo[] {
    const excluidas = RUTAS_SIN_LICENCIA[subcuenta];
    if (excluidas.size === 0) return [...modulos];

    return modulos.flatMap((modulo) => {
        if (modulo.estructura.length === 0) return [modulo];
        const estructura = podar(modulo.estructura, [modulo.key], excluidas);
        return estructura.length === 0 ? [] : [{ ...modulo, estructura }];
    });
}