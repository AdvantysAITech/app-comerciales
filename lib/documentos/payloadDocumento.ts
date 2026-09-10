import type { PayloadVisita } from "@/lib/visita/payload";
import {
    aCentimos,
    aEuros,
    formatearCantidad,
    formatearImporte,
    formatearTipoIva,
    type PresupuestoCalculado,
} from "./motor";
import { auditarPayload, partidaDeRuta } from "./mapeo-capitulos";
import { validarPreVuelo } from "./contrato";

/**
 * Proyección del payload canónico al JSON que consume la app de documentos.
 *
 * Sustituye a `lib/documentos/plano.ts`, que nació de una premisa equivocada: se
 * creía que el motor hacía sustitución plana clave->valor y por eso aplanaba
 * todo a claves de hasta 6 tramos. Verificado en TEST-001: la app navega rutas
 * ANIDADAS (`comunidad.nombre`) definidas en cada prompt template, y resuelve
 * arrays sin problema.
 *
 * El canónico se sigue guardando entero en GHL. Esto es una capa de salida.
 *
 * ---------------------------------------------------------------------------
 * MIGRACIÓN 31/08/2026: `economia.ts` -> `motor.ts`
 * ---------------------------------------------------------------------------
 * `Economia` y `calcularEconomia()` quedan obsoletos. Todo el cálculo vive en
 * `motor.ts`, que trabaja en céntimos enteros, agrupa por CAPÍTULO de tarifa
 * (no por módulo) y verifica el cuadre línea -> capítulo -> PEM -> IVA -> total.
 *
 * Cambio de contrato: `DatosDocumento.economia` pasa a `DatosDocumento.presupuesto`,
 * de tipo `PresupuestoCalculado | null`. `null` significa borrador.
 *
 * ---------------------------------------------------------------------------
 * EL DESGLOSE YA NO VIAJA AQUÍ (10/09/2026)
 * ---------------------------------------------------------------------------
 * Pasó por tres manos: primero lo generaba la IA, luego se envió como campo
 * plano `desglose_capitulos`, y ahora sale del JSON por completo. La app tiene
 * un tope de 4000 caracteres por campo y el desglose lo supera a partir de 36
 * partidas. Se construye como tablas ODF en `desgloseOdf.ts` y lo inyecta
 * `odf.ts` sobre el marcador [[DESGLOSE]].
 */

/** Días de validez del presupuesto. La plantilla ya lo dice impreso: 30 días. */
export const DIAS_VALIDEZ = 30;

/**
 * El prefijo y el formato de la referencia viven en `contador.ts`, junto al
 * contador que los produce. Se reexportan para no romper los imports
 * existentes.
 */
export { PREFIJO_REFERENCIA, formatearReferencia } from "./contador";

export type JsonDocumento = {
    num_ref: string;
    fechaVisita: string;
    fecha_validez: string;
    localidad_visita: string;
    comunidad: { nombre: string; localidad: string; provincia: string };
    administrador: { nombre: string; localidad: string };
    total_PEM: string;
    porcentaje_IVA: string;
    importe_IVA: string;
    total_con_IVA: string;
    resumen_capitulos: string;
    resumen_presupuesto: string;
    modulos: ModuloDocumento[];
};

/**
 * Forma de `modulos` para los prompts de IA.
 *
 * Es lo que reciben `TituloPresupuesto` y `ObjetoYAlcance`, que sí siguen
 * siendo generados: describen la intervención, no calculan nada.
 *
 * `DesgloseCapitulos` YA NO debe usar esto: consume `desglose_capitulos`.
 * Se mantienen los campos económicos porque el prompt de `ObjetoYAlcance` se
 * apoya en ellos para dimensionar el texto.
 */
export type ModuloDocumento = {
    label: string;
    partidas: Array<{
        codigo: string;
        descripcion: string;
        unidad: string;
        cantidadFormateada: string;
        precioFormateado: string;
        importeFormateado: string;
    }>;
};

export type DatosDocumento = {
    /** Referencia correlativa ya resuelta. */
    numeroReferencia: string;
    /** Localidad y provincia de la comunidad. Pendiente de capturar en GHL. */
    comunidadLocalidad: string;
    comunidadProvincia: string;
    administradorLocalidad: string;
    /**
     * Presupuesto calculado. `null` = borrador: misma estructura, importes en
     * blanco. No son precios estimados, están vacíos y se ven vacíos. Un importe
     * plausible pero inventado es peor que ninguno, porque nadie lo detecta
     * hasta que el administrador lo firma.
     */
    presupuesto: PresupuestoCalculado | null;
};

// ---------------------------------------------------------------------------
// Fechas y referencia
// ---------------------------------------------------------------------------

/** "2026-08-26" -> "26/08/2026". La plantilla espera formato español. */
export function formatearFechaEs(iso: string): string {
    const [anio, mes, dia] = iso.split("-");
    if (!anio || !mes || !dia) return iso;
    return `${dia}/${mes}/${anio}`;
}

/** Fecha de validez: fecha de visita + DIAS_VALIDEZ, en formato español. */
export function calcularFechaValidez(fechaVisitaIso: string, dias = DIAS_VALIDEZ): string {
    const fecha = new Date(`${fechaVisitaIso}T00:00:00Z`);
    if (Number.isNaN(fecha.getTime())) return "";
    fecha.setUTCDate(fecha.getUTCDate() + dias);
    return formatearFechaEs(fecha.toISOString().slice(0, 10));
}

// ---------------------------------------------------------------------------
// Render de tablas Markdown
// ---------------------------------------------------------------------------

/**
 * Soluciona renderiza Markdown a ODF. Dos reglas verificadas empíricamente:
 *  - toda fila necesita la barra vertical de cierre;
 *  - `**negrita**` dentro de una celda hace que la celda salga VACÍA.
 * Por eso aquí no hay ni un asterisco.
 */
function fila(celdas: string[]): string {
    return `| ${celdas.join(" | ")} |`;
}

function separador(n: number): string {
    return `| ${Array(n).fill("---").join(" | ")} |`;
}

/** Escapa la barra vertical: partiría la celda en dos. */
function celda(texto: string): string {
    return texto.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
}

/** Listado capítulo -> importe. Alimenta el bloque "RESUMEN PRESUPUESTO". */
export function renderResumenCapitulos(p: PresupuestoCalculado | null): string {
    if (!p) return "";

    return [
        fila(["CAPÍTULO", "IMPORTE"]),
        separador(2),
        ...p.capitulos.map((c) =>
            fila([`${c.codigoJerarquico}  ${celda(c.nombre)}`, `${formatearImporte(c.total)} Eur`])
        ),
    ].join("\n");
}

/** Cierre económico: PEM, IVA y total. */
export function renderResumenPresupuesto(p: PresupuestoCalculado | null): string {
    if (!p) return "";

    return [
        fila(["CONCEPTO", "IMPORTE"]),
        separador(2),
        fila(["TOTAL PEM", `${formatearImporte(p.pem)} Eur`]),
        fila([`IVA ${formatearTipoIva(p.ivaTipo)} %`, `${formatearImporte(p.ivaImporte)} Eur`]),
        fila(["TOTAL PRESUPUESTO (IVA INCLUIDO)", `${formatearImporte(p.total)} Eur`]),
    ].join("\n");
}

// ---------------------------------------------------------------------------
// Módulos para los prompts de IA
// ---------------------------------------------------------------------------

/**
 * Módulos con sus partidas valoradas, agrupados por ZONA del edificio.
 *
 * Los importes se recalculan aquí desde la tarifa con la MISMA aritmética en
 * céntimos que usa el motor. No se leen de `p.capitulos` porque allí las
 * mediciones de varias zonas ya están agregadas en una sola línea, y aquí hace
 * falta el desglose por zona para que `ObjetoYAlcance` describa cada una.
 */
function construirModulos(
    payload: PayloadVisita,
    presupuesto: PresupuestoCalculado | null
): ModuloDocumento[] {
    // Los nodos de texto libre ("Varios", "Otros") no tienen unidad ni precio
    // por diseño, así que salían aquí con los seis campos en cadena vacía. La
    // IA los pintaba como una fila hueca ("| | VARIOS. | | | | |") y son el
    // principal sospechoso de las secciones que volvían sin `aiModel`.
    //
    // Se excluyen del JSON, no de la vida del comercial: `/api/documentos/generar`
    // los sigue sacando como aviso con la nota que escribió, para que sepa qué
    // se ha quedado fuera del documento.
    const textoLibre = new Set(auditarPayload(payload).textoLibre.map((t) => t.ruta));

    return payload.modulos
        .map((modulo) => ({
            ...modulo,
            partidas: modulo.partidas.filter((partida) => !textoLibre.has(partida.ruta)),
        }))
        .filter((modulo) => modulo.partidas.length > 0)
        .map((modulo) => ({
            label: modulo.label,
            partidas: modulo.partidas.map((partida) => {
                const tarifa = presupuesto ? partidaDeRuta(partida.ruta) : undefined;
                const cantidad = partida.cantidad ?? 0;

                const importe =
                    tarifa && cantidad > 0
                        ? aEuros(Math.round(cantidad * aCentimos(tarifa.tarifaEmpresa)))
                        : null;

                return {
                    codigo: tarifa?.codigoJerarquico ?? "",
                    descripcion: tarifa?.descripcionCorta ?? partida.camino.join(" > "),
                    unidad: partida.unidad ?? tarifa?.unidad ?? "",
                    cantidadFormateada: cantidad > 0 ? formatearCantidad(cantidad) : "",
                    precioFormateado: tarifa ? formatearImporte(tarifa.tarifaEmpresa) : "",
                    importeFormateado: importe !== null ? formatearImporte(importe) : "",
                };
            }),
        }));
}

// ---------------------------------------------------------------------------
// Construcción y validación
// ---------------------------------------------------------------------------

/** Construye el JSON del documento. No valida: eso lo hace `prepararDocumento()`. */
export function construirJsonDocumento(
    payload: PayloadVisita,
    datos: DatosDocumento
): JsonDocumento {
    const { presupuesto } = datos;

    return {
        num_ref: datos.numeroReferencia,
        fechaVisita: formatearFechaEs(payload.fechaVisita),
        fecha_validez: calcularFechaValidez(payload.fechaVisita),
        localidad_visita: datos.comunidadLocalidad,

        comunidad: {
            nombre: payload.comunidad.nombre,
            localidad: datos.comunidadLocalidad,
            provincia: datos.comunidadProvincia,
        },
        administrador: {
            nombre: payload.administrador.nombre ?? "",
            localidad: datos.administradorLocalidad,
        },

        // Sin símbolos: la plantilla escribe " €" y " %" al lado del markerkey.
        total_PEM: presupuesto ? formatearImporte(presupuesto.pem) : "",
        porcentaje_IVA: presupuesto ? formatearTipoIva(presupuesto.ivaTipo) : "",
        importe_IVA: presupuesto ? formatearImporte(presupuesto.ivaImporte) : "",
        total_con_IVA: presupuesto ? formatearImporte(presupuesto.total) : "",

        resumen_capitulos: renderResumenCapitulos(presupuesto),
        resumen_presupuesto: renderResumenPresupuesto(presupuesto),

        modulos: construirModulos(payload, presupuesto),
    };
}

export type DocumentoPreparado =
    | { ok: true; json: JsonDocumento }
    | { ok: false; errores: string[] };

/**
 * Construye y valida en un solo paso. Es la única función que deberían usar las
 * rutas de API: garantiza que nada sale hacia la app sin pasar el pre-vuelo.
 */
export function prepararDocumento(
    payload: PayloadVisita,
    datos: DatosDocumento
): DocumentoPreparado {
    const json = construirJsonDocumento(payload, datos);
    const errores = validarPreVuelo(json);
    return errores.length > 0 ? { ok: false, errores } : { ok: true, json };
}