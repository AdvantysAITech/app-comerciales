import type { PayloadVisita } from "@/lib/visita/payload";
import {
    aCentimos,
    aEuros,
    formatearCantidad,
    formatearImporte,
    formatearTipoIva,
    type PresupuestoCalculado,
} from "./motor";
import { partidaDeRuta } from "./mapeo-capitulos";
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
 * Se añade `desglose_capitulos`: la tabla de partidas por capítulo renderizada
 * de forma DETERMINISTA en TypeScript. Hasta ahora la generaba la IA
 * (`presup.DesgloseCapitulos`), lo que era una desviación registrada: un LLM no
 * debe producir importes de un documento precontractual.
 *
 * !! REQUIERE UN CAMBIO EN SOLUCIONA !!
 * El markerkey `presup.DesgloseCapitulos` está configurado allí como sección de
 * IA con su prompt template. Hay que reconfigurarlo para que lea el campo plano
 * `desglose_capitulos` del JSON, igual que `resumen_capitulos`. Mientras no se
 * haga, este campo viaja en el JSON pero la plantilla lo ignora.
 */

/** Días de validez del presupuesto. La plantilla ya lo dice impreso: 30 días. */
export const DIAS_VALIDEZ = 30;

/**
 * Prefijo de la referencia por empresa. DERCAS §12.3.
 *
 * DESVIACIÓN ABIERTA: el presupuesto real del cliente usa "SV-2026-001", no
 * "ESC-". Pendiente de decisión de Miguel. Cuando se cierre, se cambia aquí y
 * en ningún otro sitio.
 */
export const PREFIJO_REFERENCIA: Record<string, string> = {
    "scala-valencia": "ESC",
    "vertical-projects": "VRT",
};

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
    /** Tabla de partidas por capítulo. Determinista, no generada por IA. */
    desglose_capitulos: string;
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

/**
 * Referencia correlativa: ESC-2026-0001 / VRT-2026-0001 (DERCAS §12.3).
 *
 * El contador NO vive aquí: se lleva en GHL a nivel de subcuenta. Esta función
 * solo da formato, para que el formato esté en un único sitio.
 */
export function formatearReferencia(subcuenta: string, anio: number, correlativo: number): string {
    const prefijo = PREFIJO_REFERENCIA[subcuenta] ?? "REF";
    return `${prefijo}-${anio}-${String(correlativo).padStart(4, "0")}`;
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

/**
 * Desglose de partidas por capítulo. DETERMINISTA.
 *
 * Replica la estructura del presupuesto de referencia del cliente: una tabla
 * por capítulo, con fila de total al pie.
 */
export function renderDesgloseCapitulos(p: PresupuestoCalculado | null): string {
    if (!p) return "";

    const bloques: string[] = [];

    for (const cap of p.capitulos) {
        const lineas: string[] = [
            `#### ${cap.codigoJerarquico}  ${cap.nombre}`,
            "",
            fila(["CÓDIGO", "RESUMEN", "UD", "CANT.", "PRECIO", "IMPORTE"]),
            separador(6),
        ];

        for (const l of cap.lineas) {
            const resumen = l.descripcionLarga
                ? `${celda(l.resumen)}. ${celda(l.descripcionLarga)}`
                : celda(l.resumen);

            lineas.push(
                fila([
                    l.codigoJerarquico,
                    resumen,
                    l.unidad,
                    formatearCantidad(l.cantidad),
                    formatearImporte(l.precioUnitario),
                    formatearImporte(l.importe),
                ])
            );
        }

        lineas.push(
            fila(["", `TOTAL ${cap.codigoJerarquico}`, "", "", "", formatearImporte(cap.total)])
        );
        bloques.push(lineas.join("\n"));
    }

    return bloques.join("\n\n");
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
    return payload.modulos
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
        desglose_capitulos: renderDesgloseCapitulos(presupuesto),

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