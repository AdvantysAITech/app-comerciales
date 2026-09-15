import type { NodoCatalogo, Unidad } from "./tipos";
import { CAPITULOS_INDICE, PARTIDAS_INDICE } from "./indiceTarifa.generado";
import { normalizarNombre } from "@/lib/texto";

/**
 * lib/catalogo/buscador.ts
 *
 * Estructura del módulo Varios: la tarifa entera, buscable.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ (15/09/2026)
 * ---------------------------------------------------------------------------
 * El esquema manuscrito de fachadas pide para Varios "un buscador para añadir
 * alguna cosa especial". Hasta ahora era un texto libre: lo que escribía el
 * comercial no se valoraba y dirección tenía que añadirlo a mano.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ ES UN ÁRBOL Y NO UN MECANISMO NUEVO
 * ---------------------------------------------------------------------------
 * Todo el pipeline -- selección, borrador, payload, auditoría, motor -- trabaja
 * con rutas resolubles contra el catálogo. Si el buscador inventara su propio
 * formato habría que tocar cada una de esas piezas. Así, Varios es un árbol
 * capítulo -> partida como cualquier otro módulo:
 *
 *     varios.c10.rcd001      Contenedor RCD 7 m³
 *
 * y solo cambia cómo se pinta (`captura: "buscador"`). La hoja lleva el código
 * de tarifa en la clave, así que el mapeo es directo y no necesita una entrada
 * por partida en `MAPA_SUBRUTAS` (ver `codigoDeRutaBuscador`).
 *
 * Las claves derivan del código de tarifa. Son contrato igual que las demás: si
 * una revisión de tarifa renumera códigos, las visitas antiguas con esa partida
 * dejan de resolverse y la auditoría lo detecta.
 */

/** Clave del módulo que se pinta como buscador. */
export const MODULO_BUSCADOR = "varios";

/** Nodo de texto libre para lo que no está en la tarifa. */
export const KEY_TEXTO_LIBRE_BUSCADOR = "otros";

const PREFIJO_CAPITULO = "c";

/** Unidad de tarifa -> unidad del formulario. */
const UNIDAD_FORMULARIO: Record<string, Unidad> = {
    ud: "ud",
    m: "ml",
    "m²": "m2",
    "m³": "m3",
    h: "h",
    kg: "kg",
    día: "dia",
    mes: "mes",
};

export function unidadFormularioDeTarifa(unidad: string): Unidad {
    const u = UNIDAD_FORMULARIO[unidad];
    if (!u) {
        throw new Error(
            `Unidad de tarifa "${unidad}" sin equivalencia en el formulario. ` +
                `Añádela a UNIDAD_FORMULARIO (lib/catalogo/buscador.ts) y a Unidad (tipos.ts).`
        );
    }
    return u;
}

/** "10" -> "c10" */
export function keyCapitulo(codigoCapitulo: string): string {
    return `${PREFIJO_CAPITULO}${codigoCapitulo}`;
}

/** "RCD001" -> "rcd001" */
export function keyPartida(codigo: string): string {
    return codigo.toLowerCase();
}

/**
 * Árbol del buscador.
 *
 * `excluirCapitulos` existe para las subcuentas que no pueden ofrecer ciertos
 * trabajos (Vertical Projects y el amianto, DERCAS §4.1). Hoy no se usa: ver la
 * nota de `CATALOGOS` en index.ts.
 */
export function estructuraBuscador(excluirCapitulos: readonly string[] = []): NodoCatalogo[] {
    const capitulos: NodoCatalogo[] = CAPITULOS_INDICE.filter((c) => !excluirCapitulos.includes(c.codigo)).map(
        (capitulo) => ({
            key: keyCapitulo(capitulo.codigo),
            label: `${capitulo.codigoJerarquico} ${capitulo.nombre}`,
            hijos: PARTIDAS_INDICE.filter((p) => p.capitulo === capitulo.codigo).map((p) => ({
                key: keyPartida(p.codigo),
                label: p.descripcion,
                // Obligatoria: una partida buscada y sin cantidad no aporta nada al
                // presupuesto y el motor la descartaría en silencio.
                medicion: { unidad: unidadFormularioDeTarifa(p.unidad), obligatoria: true },
            })),
        })
    );

    return [
        ...capitulos,
        {
            key: KEY_TEXTO_LIBRE_BUSCADOR,
            label: "Trabajo que no está en la tarifa",
            permiteTextoLibre: true,
        },
    ];
}

/**
 * Código de tarifa de una ruta del buscador, o `undefined` si la ruta no es
 * del buscador o no apunta a una partida.
 *
 *   "varios.c10.rcd001" -> "RCD001"
 *   "varios.otros"      -> undefined
 *   "medianeras.picado" -> undefined
 */
export function codigoDeRutaBuscador(ruta: string): string | undefined {
    const [modulo, capitulo, partida, ...resto] = ruta.split(".");
    if (modulo !== MODULO_BUSCADOR || !capitulo || !partida || resto.length > 0) return undefined;
    if (!capitulo.startsWith(PREFIJO_CAPITULO)) return undefined;
    return partida.toUpperCase();
}

// ---------------------------------------------------------------------------
// Búsqueda
// ---------------------------------------------------------------------------

export type ResultadoBusqueda = {
    ruta: string;
    codigo: string;
    descripcion: string;
    capitulo: string;
    unidad?: Unidad;
};

/** Mínimo de caracteres para buscar. Con una letra, todo coincide y la lista no ayuda. */
export const MINIMO_CARACTERES_BUSQUEDA = 2;

/**
 * Busca partidas en la estructura de un módulo buscador.
 *
 * Recibe la estructura, no la tarifa: así respeta lo que la subcuenta tenga
 * excluido. Cada palabra de la consulta tiene que aparecer (en cualquier orden)
 * en la descripción, el código o el nombre del capítulo, sin distinguir acentos
 * ni mayúsculas: "demolicion ceramico" encuentra "Demolición ... cerámico".
 *
 * Orden: primero las que empiezan por la consulta o coinciden con el código,
 * después el resto en orden de tarifa. Lógica pura: se prueba sin montar React.
 */
export function buscarPartidas(
    moduloKey: string,
    estructura: readonly NodoCatalogo[],
    consulta: string,
    limite = 15
): ResultadoBusqueda[] {
    const normalizada = normalizarNombre(consulta);
    if (normalizada.length < MINIMO_CARACTERES_BUSQUEDA) return [];

    const palabras = normalizada.split(" ").filter(Boolean);
    const destacados: ResultadoBusqueda[] = [];
    const resto: ResultadoBusqueda[] = [];

    for (const capitulo of estructura) {
        if (!capitulo.hijos?.length) continue;
        const nombreCapitulo = normalizarNombre(capitulo.label);

        for (const hoja of capitulo.hijos) {
            const codigo = hoja.key.toUpperCase();
            const descripcion = normalizarNombre(hoja.label);
            const texto = `${descripcion} ${hoja.key} ${nombreCapitulo}`;

            if (!palabras.every((p) => texto.includes(p))) continue;

            const resultado: ResultadoBusqueda = {
                ruta: `${moduloKey}.${capitulo.key}.${hoja.key}`,
                codigo,
                descripcion: hoja.label,
                capitulo: capitulo.label,
                unidad: hoja.medicion?.unidad,
            };

            if (descripcion.startsWith(normalizada) || hoja.key === normalizada) destacados.push(resultado);
            else resto.push(resultado);
        }
    }

    return [...destacados, ...resto].slice(0, limite);
}