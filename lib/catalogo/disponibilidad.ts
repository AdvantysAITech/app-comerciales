import type { ModuloTrabajo, NodoCatalogo } from "./tipos";

/**
 * lib/catalogo/disponibilidad.ts
 *
 * Qué trabajos del árbol de captura se le ofrecen al comercial.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ EXISTE ESTO (09/09/2026)
 * ---------------------------------------------------------------------------
 * 17 subrutas del catálogo no tienen partida equivalente en la tarifa 2026. En
 * el formulario son 38 opciones seleccionables, porque los cuatro módulos de
 * fachada comparten `estructuraFachadas()`.
 *
 * Hasta ahora el comercial podía marcarlas y el fallo llegaba tarde y lejos:
 * terminaba la visita, volvía, pulsaba generar y recibía un 422. Ocultarlas
 * mueve el problema al sitio correcto: si no se puede valorar, no se ofrece.
 *
 * Lo que queda fuera del catálogo NO se pierde. El nodo "Varios" admite texto
 * libre, no bloquea el presupuesto y sale como aviso en `/api/documentos/generar`
 * para que dirección lo añada a mano.
 *
 * Esto es TEMPORAL y reversible. En cuanto Miguel decida qué partida corresponde
 * a cada una (o se añadan a la tarifa), se borra la entrada de la lista y la
 * opción vuelve a aparecer. No se ha eliminado ni un nodo del árbol.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ LA LISTA ESTÁ AQUÍ Y NO SE CALCULA
 * ---------------------------------------------------------------------------
 * Lo natural sería derivarla de `MAPA_SUBRUTAS` en tiempo de ejecución, pero eso
 * obliga a importar `lib/documentos/mapeo-capitulos` desde un componente de
 * cliente, y con él la tarifa entera (51 KB de JSON) y el motor económico. En
 * una aplicación que se usa en obra, con el móvil y mala cobertura, eso no sale
 * a cuenta.
 *
 * Dos fuentes de verdad es justo el fallo que este proyecto evita en otros
 * sitios, así que NO se confía en que alguien mantenga las dos a mano:
 * `validarMapeo()` compara esta lista contra los estados reales del mapa y
 * `npm run mapeo:auditar` sale con código 1 si divergen.
 */

/**
 * Subrutas sin partida en la tarifa 2026. Clave: subruta (la ruta SIN el
 * prefijo del módulo), que es como indexa `MAPA_SUBRUTAS`.
 *
 * Generada desde la auditoría el 09/09/2026. No se edita a mano sin volver a
 * ejecutar `npm run mapeo:auditar`.
 */
export const SUBRUTAS_SIN_PRECIO: ReadonlySet<string> = new Set([
    // Andamio: la tarifa solo tiene tubular multidireccional (AND001-AND003).
    "medios_auxiliares.andamio.bimastil",
    "medios_auxiliares.andamio.colgante",

    // Descuelgues: el formulario mide en "ud" y la tarifa solo tiene jornadas de
    // equipo (VP004 media jornada, VP005 completa). No es un precio que falte,
    // es una unidad que no convierte sin un dato de productividad que no tenemos.
    "medios_auxiliares.descuelgues.brazo",
    "medios_auxiliares.descuelgues.colgante",
    "medios_auxiliares.descuelgues.tubular",
    "exterior.medios_auxiliares.descuelgues.brazo",
    "exterior.medios_auxiliares.descuelgues.colgante",
    "exterior.medios_auxiliares.descuelgues.tubular",

    // Cubiertas.
    "impermeabilizacion.epdm",
    "impermeabilizacion.mortero_fibras",
    "petos_y_casetones.casetones",
    "pintura.revestimiento_silicato",

    // Escaleras y zaguán.
    "saneado.masilla",
    "saneado.yeso",

    // Bajantes.
    "interior.demolicion.tabique",
    "interior.retirada.pvc",
    "exterior.retirada.pvc",
]);

/** "medianeras.picado.picado_cantos" -> "picado.picado_cantos" */
function subrutaDe(keys: readonly string[]): string {
    return keys.join(".");
}

/**
 * Poda recursiva.
 *
 * Un grupo que se queda sin hijos también desaparece: "Descuelgues" tiene tres
 * hijos y los tres están sin precio, así que dejarlo visible sería ofrecer una
 * carpeta vacía. "Andamio" en cambio se queda, porque Tubular sí tiene partida.
 */
function podar(nodos: readonly NodoCatalogo[], ancestros: readonly string[]): NodoCatalogo[] {
    const salida: NodoCatalogo[] = [];

    for (const nodo of nodos) {
        const keys = [...ancestros, nodo.key];

        if (SUBRUTAS_SIN_PRECIO.has(subrutaDe(keys))) continue;

        if (nodo.hijos?.length) {
            const hijos = podar(nodo.hijos, keys);
            if (hijos.length === 0) continue;
            salida.push({ ...nodo, hijos });
            continue;
        }

        salida.push(nodo);
    }

    return salida;
}

/**
 * Devuelve el módulo sin las opciones que no se pueden valorar.
 *
 * No muta: devuelve una copia. El catálogo original sigue completo, que es lo
 * que permite que `recorrerCatalogo()` y la auditoría sigan viendo las 118
 * partidas y sepan lo que falta por decidir.
 */
export function filtrarSinPrecio(modulo: ModuloTrabajo): ModuloTrabajo {
    if (modulo.captura !== "arbol") return modulo;
    return { ...modulo, estructura: podar(modulo.estructura, []) };
}