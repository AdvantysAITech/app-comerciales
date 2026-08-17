import {
    buscarNodoPorRuta,
    construirRuta,
    esPartida,
    getModulo,
    type ModuloTrabajo,
    type NodoCatalogo,
    type Unidad,
} from "@/lib/catalogo";

/**
 * Modelo de selección de una visita. Lógica pura, sin React: se puede probar
 * sin montar un componente y se reutiliza igual en el cliente y en el servidor.
 *
 * El estado NO copia el árbol del catálogo. Guarda solo las rutas marcadas y su
 * medición. El catálogo es la única fuente de la estructura: así, cuando se
 * amplíe el árbol, las visitas antiguas siguen siendo interpretables y no hay
 * dos versiones de la verdad.
 */

export type Subcuenta = "scala-valencia" | "vertical-projects";

/** Datos que el comercial añade a una ruta marcada. */
export type EntradaSeleccion = {
    /** Medición. Solo aplica a partidas (nodos sin hijos). */
    cantidad?: number;
    /** Texto libre. Usado en los nodos con `permiteTextoLibre` (caso "Varios"). */
    nota?: string;
};

/** Estado completo: mapa de ruta -> datos. La presencia de la clave = marcado. */
export type SeleccionVisita = Record<string, EntradaSeleccion>;

/** Partida lista para presupuestar, ya resuelta contra el catálogo. */
export type PartidaResuelta = {
    ruta: string;
    moduloKey: string;
    moduloLabel: string;
    /** Camino legible, p. ej. "Interior > Retirada de bajante > Fibrocemento > Con documentación". */
    caminoLabels: string[];
    label: string;
    unidad?: Unidad;
    cantidad?: number;
    nota?: string;
    alerta?: string;
};

export type ErrorValidacion = {
    ruta: string;
    mensaje: string;
};

export const seleccionVacia: SeleccionVisita = {};

export function estaSeleccionada(seleccion: SeleccionVisita, ruta: string): boolean {
    return Object.prototype.hasOwnProperty.call(seleccion, ruta);
}

/** Rutas marcadas que cuelgan de `ruta` (sin incluirla). */
export function rutasDescendientes(seleccion: SeleccionVisita, ruta: string): string[] {
    const prefijo = `${ruta}.`;
    return Object.keys(seleccion).filter((r) => r.startsWith(prefijo));
}

/**
 * Cadena de descendientes cuando cada nivel tiene un único hijo.
 * Evita el toque estéril de "Colocación de la nueva > PVC": si no hay elección
 * posible, marcar el padre marca la cadena entera.
 */
function cadenaHijoUnico(nodo: NodoCatalogo, rutaBase: string): string[] {
    const rutas: string[] = [];
    let actual = nodo;
    let ruta = rutaBase;

    while (actual.hijos?.length === 1) {
        const unico = actual.hijos[0];
        ruta = `${ruta}.${unico.key}`;
        rutas.push(ruta);
        actual = unico;
    }

    return rutas;
}

/**
 * Marca o desmarca una ruta. Devuelve un objeto nuevo (nunca muta el anterior:
 * React necesita identidad nueva para repintar).
 *
 * Reglas:
 *  - Marcar un grupo lo despliega, pero no selecciona sus hijos (opción A).
 *    Excepción: cadenas de hijo único, que se marcan enteras.
 *  - Desmarcar un grupo arrastra a todos sus descendientes: si el comercial
 *    descarta "Picado", no puede quedar viva una partida de picado suelta.
 */
export function alternarNodo(
    seleccion: SeleccionVisita,
    subcuenta: Subcuenta,
    ruta: string
): SeleccionVisita {
    const encontrado = buscarNodoPorRuta(subcuenta, ruta);
    if (!encontrado) return seleccion;

    const siguiente = { ...seleccion };

    if (estaSeleccionada(seleccion, ruta)) {
        delete siguiente[ruta];
        for (const descendiente of rutasDescendientes(seleccion, ruta)) {
            delete siguiente[descendiente];
        }
        return siguiente;
    }

    siguiente[ruta] = {};
    for (const rutaHijo of cadenaHijoUnico(encontrado.nodo, ruta)) {
        siguiente[rutaHijo] = {};
    }
    return siguiente;
}

/** Fija la medición de una partida ya marcada. `undefined` limpia el valor. */
export function fijarCantidad(
    seleccion: SeleccionVisita,
    ruta: string,
    cantidad: number | undefined
): SeleccionVisita {
    if (!estaSeleccionada(seleccion, ruta)) return seleccion;
    return { ...seleccion, [ruta]: { ...seleccion[ruta], cantidad } };
}

/** Fija la nota de texto libre de un nodo ya marcado. */
export function fijarNota(
    seleccion: SeleccionVisita,
    ruta: string,
    nota: string
): SeleccionVisita {
    if (!estaSeleccionada(seleccion, ruta)) return seleccion;
    return { ...seleccion, [ruta]: { ...seleccion[ruta], nota } };
}

/** Elimina del estado todo lo que cuelgue de un módulo (al deseleccionarlo). */
export function limpiarModulo(seleccion: SeleccionVisita, moduloKey: string): SeleccionVisita {
    const siguiente: SeleccionVisita = {};
    for (const [ruta, entrada] of Object.entries(seleccion)) {
        if (ruta !== moduloKey && !ruta.startsWith(`${moduloKey}.`)) {
            siguiente[ruta] = entrada;
        }
    }
    return siguiente;
}

/** Recorre el módulo resolviendo cada ruta marcada contra el catálogo. */
function resolverModulo(
    modulo: ModuloTrabajo,
    seleccion: SeleccionVisita,
    soloPartidas: boolean
): PartidaResuelta[] {
    const resultado: PartidaResuelta[] = [];

    function bajar(nodos: NodoCatalogo[], ancestrosKeys: string[], ancestrosLabels: string[]) {
        for (const nodo of nodos) {
            const keys = [...ancestrosKeys, nodo.key];
            const labels = [...ancestrosLabels, nodo.label];
            const ruta = construirRuta(modulo.key, keys);

            if (estaSeleccionada(seleccion, ruta) && (!soloPartidas || esPartida(nodo))) {
                resultado.push({
                    ruta,
                    moduloKey: modulo.key,
                    moduloLabel: modulo.label,
                    caminoLabels: labels,
                    label: nodo.label,
                    unidad: nodo.medicion?.unidad,
                    cantidad: seleccion[ruta].cantidad,
                    nota: seleccion[ruta].nota,
                    alerta: nodo.alerta,
                });
            }

            if (nodo.hijos?.length) bajar(nodo.hijos, keys, labels);
        }
    }

    bajar(modulo.estructura, [], []);
    return resultado;
}

/** Partidas presupuestables (hojas marcadas) de un módulo, en orden de catálogo. */
export function partidasDeModulo(
    subcuenta: Subcuenta,
    moduloKey: string,
    seleccion: SeleccionVisita
): PartidaResuelta[] {
    const modulo = getModulo(subcuenta, moduloKey);
    if (!modulo) return [];
    return resolverModulo(modulo, seleccion, true);
}

/** Todas las partidas presupuestables de los módulos indicados. */
export function partidasSeleccionadas(
    subcuenta: Subcuenta,
    modulosKeys: string[],
    seleccion: SeleccionVisita
): PartidaResuelta[] {
    return modulosKeys.flatMap((key) => partidasDeModulo(subcuenta, key, seleccion));
}

/**
 * Nodos marcados que llevan aviso (hoy: fibrocemento con documentación = amianto).
 * La UI los usa para avisar al comercial en el momento de marcarlos.
 */
export function alertasActivas(
    subcuenta: Subcuenta,
    modulosKeys: string[],
    seleccion: SeleccionVisita
): PartidaResuelta[] {
    return modulosKeys
        .map((key) => getModulo(subcuenta, key))
        .filter((m): m is ModuloTrabajo => Boolean(m))
        .flatMap((m) => resolverModulo(m, seleccion, false))
        .filter((p) => Boolean(p.alerta));
}

/**
 * Valida la selección antes de permitir el envío.
 *
 * Dos clases de error:
 *  - Partida con medición obligatoria y sin cantidad (o cantidad <= 0).
 *  - Grupo marcado sin ninguna partida debajo: consecuencia directa de la
 *    opción A. El comercial abrió "Picado" y no eligió nada; sin este control
 *    el grupo viajaría vacío al presupuesto y la IA no sabría qué hacer con él.
 */
export function validarSeleccion(
    subcuenta: Subcuenta,
    modulosKeys: string[],
    seleccion: SeleccionVisita
): ErrorValidacion[] {
    const errores: ErrorValidacion[] = [];

    for (const moduloKey of modulosKeys) {
        const modulo = getModulo(subcuenta, moduloKey);
        if (!modulo || modulo.captura !== "arbol") continue;

        for (const marcado of resolverModulo(modulo, seleccion, false)) {
            const encontrado = buscarNodoPorRuta(subcuenta, marcado.ruta);
            if (!encontrado) continue;
            const { nodo } = encontrado;

            if (esPartida(nodo)) {
                const obligatoria = nodo.medicion?.obligatoria;
                const cantidad = marcado.cantidad;
                if (obligatoria && (cantidad === undefined || cantidad <= 0)) {
                    errores.push({
                        ruta: marcado.ruta,
                        mensaje: `Falta la medición de "${marcado.caminoLabels.join(" > ")}"`,
                    });
                }
                continue;
            }

            const tieneHijoMarcado = rutasDescendientes(seleccion, marcado.ruta).length > 0;
            if (!tieneHijoMarcado && !nodo.permiteTextoLibre) {
                errores.push({
                    ruta: marcado.ruta,
                    mensaje: `"${marcado.caminoLabels.join(" > ")}" está marcado pero no tiene ninguna opción seleccionada`,
                });
            }
        }
    }

    return errores;
}

/** Nº de partidas marcadas por módulo. Para el contador del selector de módulos. */
export function contarPorModulo(
    subcuenta: Subcuenta,
    modulosKeys: string[],
    seleccion: SeleccionVisita
): Record<string, number> {
    const conteo: Record<string, number> = {};
    for (const key of modulosKeys) {
        conteo[key] = partidasDeModulo(subcuenta, key, seleccion).length;
    }
    return conteo;
}