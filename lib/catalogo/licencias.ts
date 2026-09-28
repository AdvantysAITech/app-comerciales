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

// ---------------------------------------------------------------------------
// Partidas de la propuesta por IA (28/09/2026)
// ---------------------------------------------------------------------------
//
// La propuesta por IA no pasa por el árbol del catálogo: sus partidas salen de
// la tarifa, de CYPE o las escribe el comercial. La poda de arriba no les
// alcanza, así que sin esto la IA le proponía a Vertical partidas AMI y el
// servidor las aceptaba. Mismo criterio que la poda (opción A, 16/09/2026): en
// Vertical no existe ningún trabajo de amianto, tampoco el fibrocemento "sin
// documentación". Es pura (sin tarifa) para poder usarla en el navegador.

/** Capítulo de la tarifa "Retirada de amianto RERA" (AMI001-AMI012). */
export const CAPITULO_AMIANTO = "07";

const TEXTO_AMIANTO = /amianto|fibrocemento|uralita|\brera\b/i;

/**
 * Menciones que NIEGAN el amianto ("sin amianto", "no es de uralita",
 * "libre de amianto"). Se quitan antes de buscar: si no, un dictado que dice
 * "la cubierta es de chapa, no de uralita" se descartaba entero en Vertical.
 * Ojo: "placa de fibrocemento sin amianto" sigue contando por "fibrocemento"
 * (opción A: en Vertical el fibrocemento es amianto lleve o no documentación).
 */
const NEGACION_AMIANTO =
    /\b(?:sin|libre de|libres de|exent[oa]s? de|no (?:es |son |hay |tiene |contiene |lleva )?(?:de )?)(?:amianto|fibrocemento|uralita)/gi;

/** El texto habla de amianto de verdad (no para negarlo). */
export function textoMencionaAmianto(texto: string): boolean {
    return TEXTO_AMIANTO.test(texto.replace(NEGACION_AMIANTO, " "));
}

/** Aviso de la propuesta cuando hay trabajo de amianto (Scala Valencia). */
export const ALERTA_AMIANTO_PROPUESTA =
    "Trabajo con amianto: solo lo ejecuta Scala Valencia con empresa RERA. Añade el plan de trabajo y el " +
    "transporte de residuos, y mínimo 3 fotos.";

/** Capítulos que la subcuenta no puede presupuestar. */
export const CAPITULOS_SIN_LICENCIA: Record<Subcuenta, ReadonlySet<string>> = {
    "scala-valencia": new Set(),
    "vertical-projects": new Set([CAPITULO_AMIANTO]),
};

type PartidaComprobable = {
    codigo?: string | null;
    capitulo?: string | null;
    descripcionCorta?: string | null;
    descripcionLarga?: string | null;
};

/**
 * La partida es un trabajo de amianto (capítulo 07, código AMI o su título lo
 * dice). Solo el título (`descripcionCorta`), no la descripción larga: las de
 * CYPE incluyen frases como "no incluye la retirada de elementos con amianto"
 * en trabajos que no tienen nada que ver.
 */
export function esPartidaAmianto(p: PartidaComprobable): boolean {
    if (p.capitulo === CAPITULO_AMIANTO) return true;
    if ((p.codigo ?? "").toUpperCase().startsWith("AMI")) return true;
    return textoMencionaAmianto(p.descripcionCorta ?? "");
}

/** El capítulo existe para esta subcuenta. */
export function capituloPermitido(subcuenta: string, capitulo: string): boolean {
    return !CAPITULOS_SIN_LICENCIA[subcuenta as Subcuenta]?.has(capitulo);
}

/**
 * La subcuenta puede presupuestar esta partida. Hoy solo lo impide el amianto
 * en Vertical Projects.
 */
export function partidaPermitida(subcuenta: string, p: PartidaComprobable): boolean {
    if (subcuenta !== "vertical-projects") return true;
    return !esPartidaAmianto(p) && capituloPermitido(subcuenta, p.capitulo ?? "");
}

/** Motivo legible del rechazo, para el comercial. */
export const MOTIVO_SIN_LICENCIA =
    "Vertical Projects no tiene licencia RERA: los trabajos de amianto o fibrocemento los presupuesta Scala Valencia.";
