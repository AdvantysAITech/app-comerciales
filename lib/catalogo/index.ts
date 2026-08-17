import type { Catalogo, ModuloTrabajo, NodoCatalogo } from "./tipos";
import { MODULOS } from "./modulos";

export type { Catalogo, ModuloTrabajo, NodoCatalogo, Unidad, ModeloNegocioDercas, TipoCaptura } from "./tipos";
export { ETIQUETA_UNIDAD } from "./tipos";

/**
 * Versión del catálogo. Se serializa junto a los datos de la visita para que el
 * motor de IA de Fase 2 sepa contra qué árbol se capturaron. Súbela cuando
 * cambie la estructura de forma incompatible (renombrar o eliminar claves).
 */
export const VERSION_CATALOGO = 1;

type Subcuenta = "scala-valencia" | "vertical-projects";

/**
 * Catálogo por subcuenta.
 *
 * Hoy ambas apuntan al mismo árbol porque el brief viene de Scala y el DERCAS
 * §1.4 dice que los snapshots son idénticos en lógica de negocio. La separación
 * existe desde el día uno porque Vertical acabará divergiendo (no tiene licencia
 * de amianto) y no queremos refactorizar el modelo cuando ocurra.
 */
const CATALOGOS: Record<Subcuenta, Catalogo> = {
    "scala-valencia": { version: VERSION_CATALOGO, modulos: MODULOS },
    "vertical-projects": { version: VERSION_CATALOGO, modulos: MODULOS },
};

export function getCatalogo(subcuenta: Subcuenta): Catalogo {
    return CATALOGOS[subcuenta];
}

/** Módulos ordenados para el selector. */
export function getModulos(subcuenta: Subcuenta): ModuloTrabajo[] {
    return [...getCatalogo(subcuenta).modulos].sort((a, b) => a.orden - b.orden);
}

export function getModulo(subcuenta: Subcuenta, moduloKey: string): ModuloTrabajo | undefined {
    return getCatalogo(subcuenta).modulos.find((m) => m.key === moduloKey);
}

/** Un nodo es partida (hoja presupuestable) cuando no tiene hijos. */
export function esPartida(nodo: NodoCatalogo): boolean {
    return !nodo.hijos || nodo.hijos.length === 0;
}

/**
 * Ruta estable de un nodo dentro de un módulo, p. ej.
 * "bajantes.interior.retirada.fibrocemento.con_documentacion".
 * Es el identificador que se guarda en el JSON de la visita: legible, estable y
 * suficiente para reconstruir el árbol sin duplicar estructura.
 */
export function construirRuta(moduloKey: string, keysAncestros: string[]): string {
    return [moduloKey, ...keysAncestros].join(".");
}

/** Recorre en profundidad el árbol de un módulo entregando cada nodo con su ruta. */
export function recorrerArbol(
    modulo: ModuloTrabajo,
    visitar: (nodo: NodoCatalogo, ruta: string, profundidad: number) => void
): void {
    function bajar(nodos: NodoCatalogo[], ancestros: string[], profundidad: number) {
        for (const nodo of nodos) {
            const camino = [...ancestros, nodo.key];
            visitar(nodo, construirRuta(modulo.key, camino), profundidad);
            if (nodo.hijos?.length) bajar(nodo.hijos, camino, profundidad + 1);
        }
    }
    bajar(modulo.estructura, [], 0);
}

/** Busca un nodo por su ruta completa. Devuelve undefined si la ruta no existe. */
export function buscarNodoPorRuta(
    subcuenta: Subcuenta,
    ruta: string
): { modulo: ModuloTrabajo; nodo: NodoCatalogo } | undefined {
    const [moduloKey, ...resto] = ruta.split(".");
    const modulo = getModulo(subcuenta, moduloKey);
    if (!modulo) return undefined;

    let nivel: NodoCatalogo[] = modulo.estructura;
    let encontrado: NodoCatalogo | undefined;

    for (const key of resto) {
        encontrado = nivel.find((n) => n.key === key);
        if (!encontrado) return undefined;
        nivel = encontrado.hijos ?? [];
    }

    return encontrado ? { modulo, nodo: encontrado } : undefined;
}