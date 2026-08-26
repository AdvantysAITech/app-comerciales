import type { PayloadVisita } from "@/lib/visita/payload";
import {
    formatearCantidadMedicion,
    formatearImporte,
    formatearPorcentajeIva,
    renderResumenCapitulos,
    renderResumenPresupuesto,
    type Economia,
} from "../documentos/economia";
import { validarPreVuelo } from "../documentos/contrato";

/**
 * Proyección del payload canónico al JSON que consume la app de documentos.
 *
 * Sustituye a `lib/documentos/plano.ts`, que nació de una premisa equivocada: se
 * creía que el motor hacía sustitución plana clave->valor y por eso aplanaba
 * todo a claves de hasta 6 tramos. Verificado en TEST-001: la app navega rutas
 * ANIDADAS (`comunidad.nombre`) definidas en cada prompt template, y resuelve
 * arrays sin problema. Aplanar no solo sobraba: producía claves que ninguna ruta
 * configurada podía encontrar.
 *
 * El canónico se sigue guardando entero en GHL. Esto es una capa de salida.
 */

/** Días de validez del presupuesto. La plantilla ya lo dice impreso: 30 días. */
export const DIAS_VALIDEZ = 30;

/** Prefijo de la referencia por empresa. DERCAS §12.3. */
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
    modulos: ModuloDocumento[];
};

/**
 * Forma de `modulos` para los prompts de IA.
 *
 * Es lo que reciben `TituloPresupuesto`, `ObjetoYAlcance` y `DesgloseCapitulos`.
 * `DesgloseCapitulos` espera además `codigo`, `precioFormateado` e
 * `importeFormateado`; cuando no hay precios reales llegan vacíos y el modelo
 * deja esas columnas en blanco en lugar de inventarlas (verificado en TEST-003).
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
    /** Referencia correlativa ya resuelta. Ver `siguienteReferencia()`. */
    numeroReferencia: string;
    /** Localidad y provincia de la comunidad. Pendiente de capturar en GHL. */
    comunidadLocalidad: string;
    comunidadProvincia: string;
    administradorLocalidad: string;
    economia: Economia;
};

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

/**
 * Módulos con sus partidas valoradas, para los prompts de IA.
 *
 * Cruza el payload de la visita con los importes ya calculados: busca cada
 * partida por su `ruta`, que es el identificador estable del catálogo.
 */
function construirModulos(payload: PayloadVisita, economia: Economia): ModuloDocumento[] {
    const valoradas = new Map(
        economia.capitulos.flatMap((c) => c.partidas.map((p) => [p.ruta, p] as const))
    );

    return payload.modulos
        .filter((modulo) => modulo.partidas.length > 0)
        .map((modulo) => ({
            label: modulo.label,
            partidas: modulo.partidas.map((partida) => {
                const valorada = valoradas.get(partida.ruta);
                return {
                    codigo: valorada?.codigo ?? "",
                    descripcion: partida.camino.join(" > "),
                    unidad: partida.unidad ?? "",
                    cantidadFormateada:
                        partida.cantidad !== undefined ? formatearCantidadMedicion(partida.cantidad) : "",
                    precioFormateado: valorada ? formatearImporte(valorada.precioUnitario) : "",
                    importeFormateado: valorada ? formatearImporte(valorada.importe) : "",
                };
            }),
        }));
}

/**
 * Construye el JSON del documento. No valida: eso lo hace `prepararDocumento()`.
 */
export function construirJsonDocumento(payload: PayloadVisita, datos: DatosDocumento): JsonDocumento {
    const { economia } = datos;

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
        total_PEM: formatearImporte(economia.pem),
        porcentaje_IVA: formatearPorcentajeIva(economia.porcentajeIva),
        importe_IVA: formatearImporte(economia.importeIva),
        total_con_IVA: formatearImporte(economia.total),

        resumen_capitulos: renderResumenCapitulos(economia),
        resumen_presupuesto: renderResumenPresupuesto(economia),

        modulos: construirModulos(payload, economia),
    };
}

export type DocumentoPreparado =
    | { ok: true; json: JsonDocumento }
    | { ok: false; errores: string[] };

/**
 * Construye y valida en un solo paso. Es la única función que deberían usar las
 * rutas de API: garantiza que nada sale hacia la app sin pasar el pre-vuelo.
 */
export function prepararDocumento(payload: PayloadVisita, datos: DatosDocumento): DocumentoPreparado {
    const json = construirJsonDocumento(payload, datos);
    const errores = validarPreVuelo(json);
    return errores.length > 0 ? { ok: false, errores } : { ok: true, json };
}