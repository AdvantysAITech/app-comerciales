import { ETIQUETA_UNIDAD, esPartida, getModulos, recorrerArbol } from "@/lib/catalogo";
import { formatearCantidad, type PayloadVisita } from "@/lib/visita/payload";

/**
 * Proyeccion PLANA del payload, para la app externa de documentos.
 *
 * Su motor de plantillas hace sustitucion plana: un markerkey apunta a una
 * clave y recibe su valor. No itera. Como una visita tiene un numero variable
 * de partidas (de 1 a 139), todo lo que sea variable en cantidad hay que
 * resolverlo AQUI, en texto ya montado, porque la plantilla no puede recorrer
 * nada.
 *
 * Tres familias de claves:
 *
 *   - Generales:   comunidad, contacto, fecha_visita...
 *   - Por modulo:  modulo.cubiertas.texto, modulo.cubiertas.fotos...
 *   - Por partida: partida.cubiertas.impermeabilizacion.epdm.medicion...
 *
 * Los markerkeys apuntan a datos concretos (`partida.*` y generales). Los prompt
 * templates apuntan a bloques ya redactados (`modulo.*.texto`, `texto_completo`),
 * que es lo que necesita un prompt para escribir la memoria de una partida.
 *
 * TODOS los valores son cadenas. Un motor de sustitucion plana escribe lo que
 * recibe: un `undefined` o un `null` acabarian impresos en el presupuesto.
 *
 * Este modulo NO depende del modelo de seleccion: trabaja solo sobre el payload
 * ya construido y sobre el catalogo. Es una capa de salida y no debe saber como
 * se capturo la visita.
 */

/** Subcuentas del sistema. Local a proposito, para no acoplar este modulo a la capa de captura. */
type SubcuentaCatalogo = "scala-valencia" | "vertical-projects";

/**
 * Separador entre los tramos de una clave.
 *
 * Si la app externa no admite el punto dentro del nombre de un markerkey, se
 * cambia AQUI. Es lo unico que hay que tocar: nada mas en el codigo escribe
 * claves a mano.
 */
export const SEPARADOR_MARKERKEY = ".";

/**
 * Si emitir tambien las partidas NO marcadas, con valor vacio.
 *
 * Depende de que hace la app externa con un markerkey cuyo dato no existe:
 *   - Si lo deja impreso en el documento ("{{partida...}}"), hay que ponerlo en
 *     true: se emiten las 139 partidas siempre y las no marcadas van vacias.
 *   - Si lo sustituye por vacio, dejalo en false: el JSON pasa de decenas de KB
 *     a unos pocos y solo viaja lo que el comercial marco.
 *
 * Medido sobre una visita real de 3 partidas: false -> 106 claves y 5,1 KB;
 * true -> 922 claves y 58,7 KB.
 */
export const EMITIR_PARTIDAS_VACIAS = false;

const PREFIJO_MODULO = "modulo";
const PREFIJO_PARTIDA = "partida";

/** Valor de los campos booleanos. La plantilla no entiende de tipos, solo de texto. */
const SI = "si";
const NO = "no";

export type JsonPlano = Record<string, string>;

function clave(...tramos: string[]): string {
    return tramos.join(SEPARADOR_MARKERKEY);
}

/** Ruta legible completa de una partida: "Impermeabilizacion > EPDM". */
function descripcionPartida(camino: string[]): string {
    return camino.join(" > ");
}

/** Medicion ya formateada: "45 m2", "18,5 ml", o vacio si no se midio. */
function medicionPartida(cantidad?: number, unidad?: string): string {
    if (cantidad === undefined) return "";
    return `${formatearCantidad(cantidad)} ${unidad ?? ""}`.trim();
}

/**
 * Aplana el payload canonico.
 *
 * No muta ni sustituye al payload: es una proyeccion de salida. El canonico se
 * sigue guardando entero en GHL.
 */
export function aplanarPayload(payload: PayloadVisita): JsonPlano {
    const plano: JsonPlano = {};

    // --- Generales -------------------------------------------------------
    plano["version_payload"] = String(payload.version);
    plano["version_catalogo"] = String(payload.versionCatalogo);
    plano["empresa"] = payload.empresa;
    plano["comercial"] = payload.comercial;
    plano["comunidad"] = payload.comunidad.nombre;
    plano["administrador"] = payload.administrador.nombre ?? "";
    plano["contacto"] = payload.contacto.nombre;
    plano["telefono"] = payload.contacto.telefono;
    plano["fecha_visita"] = payload.fechaVisita;
    plano["observaciones"] = payload.observaciones;

    const conPartidas = payload.modulos.filter((m) => m.partidas.length > 0);

    plano["modulos_presentes"] = conPartidas.map((m) => m.label).join(", ");
    plano["total_partidas"] = String(conPartidas.reduce((n, m) => n + m.partidas.length, 0));

    const todasLasFotos = payload.modulos.flatMap((m) => m.fotos);
    plano["fotos"] = todasLasFotos.join("\n");
    plano["total_fotos"] = String(todasLasFotos.length);

    const alertas = payload.modulos.flatMap((m) => m.alertas);
    plano["alertas"] = alertas.join("\n");

    // --- Por modulo ------------------------------------------------------
    // Se emiten TODOS los modulos del catalogo, no solo los visitados: asi una
    // plantilla puede tener un apartado fijo por modulo y los no visitados
    // salen vacios en lugar de dejar el marcador impreso.
    const modulosCatalogo = getModulos(payload.subcuenta as SubcuentaCatalogo);

    for (const moduloCatalogo of modulosCatalogo) {
        const base = clave(PREFIJO_MODULO, moduloCatalogo.key);
        const modulo = conPartidas.find((m) => m.key === moduloCatalogo.key);

        plano[clave(base, "label")] = moduloCatalogo.label;
        plano[clave(base, "presente")] = modulo ? SI : NO;

        if (!modulo) {
            plano[clave(base, "texto")] = "";
            plano[clave(base, "fotos")] = "";
            plano[clave(base, "total_partidas")] = "0";
            plano[clave(base, "alertas")] = "";
            continue;
        }

        const lineas = modulo.partidas.map((partida) => {
            const medicion = medicionPartida(partida.cantidad, partida.unidad);
            const nota = partida.nota ? ` (${partida.nota})` : "";
            return medicion
                ? `- ${descripcionPartida(partida.camino)}: ${medicion}${nota}`
                : `- ${descripcionPartida(partida.camino)}${nota}`;
        });

        plano[clave(base, "texto")] = lineas.join("\n");
        plano[clave(base, "fotos")] = modulo.fotos.join("\n");
        plano[clave(base, "total_partidas")] = String(modulo.partidas.length);
        plano[clave(base, "alertas")] = modulo.alertas.join("\n");
    }

    // --- Por partida -----------------------------------------------------
    const marcadas = new Map(
        payload.modulos.flatMap((m) => m.partidas.map((p) => [p.ruta, p] as const))
    );

    if (EMITIR_PARTIDAS_VACIAS) {
        for (const moduloCatalogo of modulosCatalogo) {
            recorrerArbol(moduloCatalogo, (nodo, ruta) => {
                if (!esPartida(nodo)) return;
                const partida = marcadas.get(ruta);
                escribirPartida(plano, ruta, {
                    marcada: Boolean(partida),
                    descripcion: partida ? descripcionPartida(partida.camino) : "",
                    medicion: partida ? medicionPartida(partida.cantidad, partida.unidad) : "",
                    cantidad: partida?.cantidad,
                    unidad: partida?.unidad ?? (nodo.medicion ? ETIQUETA_UNIDAD[nodo.medicion.unidad] : ""),
                    nota: partida?.nota ?? "",
                });
            });
        }
    } else {
        for (const [ruta, partida] of marcadas) {
            escribirPartida(plano, ruta, {
                marcada: true,
                descripcion: descripcionPartida(partida.camino),
                medicion: medicionPartida(partida.cantidad, partida.unidad),
                cantidad: partida.cantidad,
                unidad: partida.unidad ?? "",
                nota: partida.nota ?? "",
            });
        }
    }

    return plano;
}

function escribirPartida(
    plano: JsonPlano,
    ruta: string,
    datos: {
        marcada: boolean;
        descripcion: string;
        medicion: string;
        cantidad?: number;
        unidad: string;
        nota: string;
    }
): void {
    // La ruta ya viene en snake_case y sin acentos desde el catalogo, y ya usa
    // el punto como separador de niveles. Si el separador de markerkey no es el
    // punto, hay que traducirla tambien.
    const rutaClave =
        SEPARADOR_MARKERKEY === "." ? ruta : ruta.split(".").join(SEPARADOR_MARKERKEY);
    const base = clave(PREFIJO_PARTIDA, rutaClave);

    plano[clave(base, "marcada")] = datos.marcada ? SI : NO;
    plano[clave(base, "descripcion")] = datos.descripcion;
    plano[clave(base, "medicion")] = datos.medicion;
    plano[clave(base, "cantidad")] = datos.cantidad !== undefined ? formatearCantidad(datos.cantidad) : "";
    plano[clave(base, "unidad")] = datos.unidad;
    plano[clave(base, "nota")] = datos.nota;
}

/**
 * Texto corrido con toda la visita. Es el bloque que reciben los prompt
 * templates que trabajan sobre el conjunto y no sobre un modulo concreto.
 */
export function textoCompleto(payload: PayloadVisita): string {
    const bloques: string[] = [];

    for (const modulo of payload.modulos) {
        if (modulo.partidas.length === 0) continue;

        const lineas = modulo.partidas.map((partida) => {
            const medicion = medicionPartida(partida.cantidad, partida.unidad);
            const nota = partida.nota ? ` (${partida.nota})` : "";
            return medicion
                ? `- ${descripcionPartida(partida.camino)}: ${medicion}${nota}`
                : `- ${descripcionPartida(partida.camino)}${nota}`;
        });

        bloques.push(`${modulo.label.toUpperCase()}\n${lineas.join("\n")}`);
    }

    if (payload.observaciones) {
        bloques.push(`OBSERVACIONES\n${payload.observaciones}`);
    }

    return bloques.join("\n\n");
}

/** Payload plano completo, listo para enviar a la app de documentos. */
export function construirJsonPlano(payload: PayloadVisita): JsonPlano {
    const plano = aplanarPayload(payload);
    plano["texto_completo"] = textoCompleto(payload);
    return plano;
}