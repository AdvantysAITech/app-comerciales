import { saFetch, type Subcuenta } from "@/lib/ghl/client";
import { idCampo } from "@/lib/ghl/ids";
import type { EntradaPresupuesto, LineaSolicitada } from "./motor";
import type { UnidadSeleccionable } from "./tarifa";

/**
 * lib/documentos/ajustes.ts
 *
 * Ajustes de dirección sobre el presupuesto calculado.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ ESTE FICHERO EXISTE
 * ---------------------------------------------------------------------------
 * El presupuesto NO se persiste en ninguna parte: se recalcula desde el JSON de
 * la visita dos veces, al encolar la generación y otra vez al cerrarla
 * (`reconstruirContexto`). Es determinista a propósito, y hasta ahora eso
 * bastaba porque nadie podía tocarlo.
 *
 * En cuanto Miguel puede modificar un importe, ese recálculo se convierte en el
 * enemigo: sin persistir el ajuste, el cierre volvería a calcular desde la
 * visita y publicaría el documento con los precios originales, en silencio. Y
 * algo peor: `verificarResultado` compara las cifras impresas contra
 * `cifrasDelCalculo`, así que un documento generado con precios ajustados y
 * verificado contra el cálculo sin ajustar se cerraría como fallido.
 *
 * Los ajustes se guardan en su propio custom field (`AJUSTES_PRESUPUESTO`) y NO
 * dentro del registro de estado: ese registro es la máquina de estados de UNA
 * generación y es terminal en `publicado`/`fallido`, mientras que los ajustes
 * tienen que sobrevivir a todas las versiones del documento.
 *
 * ---------------------------------------------------------------------------
 * LA CLAVE ES EL CÓDIGO DE TARIFA, NO LA RUTA
 * ---------------------------------------------------------------------------
 * Miguel edita sobre lo que ve en el PDF, y en el PDF hay una línea por CÓDIGO:
 * el motor agrega las mediciones de varias zonas que caen en la misma partida
 * (medianeras + fachada trasera -> una sola fila). Indexar los ajustes por ruta
 * de captura obligaría a repartir una corrección entre zonas, que es una
 * decisión que nadie ha tomado.
 *
 * Consecuencia: cuando hay ajustes, las líneas se agregan AQUÍ, antes de entrar
 * al motor, para que un override de cantidad signifique "la medición total de
 * esta partida es X" y no se sume dos veces. Sin ajustes, la entrada pasa
 * intacta y el comportamiento es exactamente el de siempre.
 */

/** Ajuste sobre una línea ya calculada, identificada por su código de tarifa. */
export type AjusteLinea = {
    /** Medición TOTAL de la partida, no la de una zona. */
    cantidad?: number;
    /** Precio unitario en euros. Sustituye a la tarifa. */
    precioUnitario?: number;
    /** Etiqueta de unidad impresa. No afecta al cálculo. */
    unidad?: UnidadSeleccionable | null;
    /** Texto largo de la partida en el desglose. */
    descripcionLarga?: string | null;
    /** La partida no se presupuesta: desaparece del documento. */
    excluida?: boolean;
};

/**
 * Partida que dirección añade y que no venía de la visita.
 *
 * Reservado: hoy la pantalla de revisión no lo ofrece (decisión D1, pendiente
 * con Miguel). El motor ya lo soporta porque una línea añadida no se distingue
 * de una capturada, así que activarlo es trabajo de UI, no de cálculo.
 */
export type LineaAnadida = {
    codigo: string;
    cantidad: number;
    precioUnitario?: number;
    unidad?: UnidadSeleccionable | null;
    descripcionLarga?: string | null;
};

export type AjustesPresupuesto = {
    /** Versión del formato. Sube si cambia la forma, para poder migrar. */
    version: 1;
    /** Overrides indexados por código de tarifa ("CER001"). */
    lineas: Record<string, AjusteLinea>;
    anadidas?: LineaAnadida[];
    /** Tipo de IVA en tanto por uno. Solo si dirección lo cambia. */
    ivaTipo?: number;
    /** Quién ajustó. Sale de la sesión, no del cliente. */
    autor: string;
    /** Motivo del ajuste, para la trazabilidad interna. No se imprime. */
    motivo?: string;
    actualizadoEn: string;
};

/** Ajustes vacíos. Equivalente a "no hay ajustes". */
export function ajustesVacios(autor: string): AjustesPresupuesto {
    return { version: 1, lineas: {}, autor, actualizadoEn: new Date().toISOString() };
}

/** `true` si los ajustes cambian algo del cálculo. */
export function hayAjustes(ajustes: AjustesPresupuesto | null | undefined): boolean {
    if (!ajustes) return false;
    return (
        Object.keys(ajustes.lineas ?? {}).length > 0 ||
        (ajustes.anadidas?.length ?? 0) > 0 ||
        typeof ajustes.ivaTipo === "number"
    );
}

// ---------------------------------------------------------------------------
// Aplicación sobre la entrada del motor
// ---------------------------------------------------------------------------

/**
 * Proyecta los ajustes sobre la entrada del motor.
 *
 * Sin ajustes devuelve la entrada TAL CUAL: mismo objeto, mismo comportamiento,
 * mismos avisos de agregación que emite el motor. Es deliberado: un presupuesto
 * sin tocar por dirección tiene que seguir saliendo byte a byte igual que antes
 * de existir este fichero.
 *
 * Con ajustes, las líneas se agregan antes (ver cabecera) y el aviso informativo
 * de agregación del motor ya no aparece: la agregación ha ocurrido aquí.
 */
export function aplicarAjustes(
    entrada: EntradaPresupuesto,
    ajustes: AjustesPresupuesto | null | undefined
): EntradaPresupuesto {
    if (!hayAjustes(ajustes)) return entrada;

    const a = ajustes!;
    const porCodigo = new Map<string, LineaSolicitada>();

    for (const linea of entrada.lineas) {
        const codigo = String(linea.codigo ?? "").trim().toUpperCase();
        const existente = porCodigo.get(codigo);

        if (!existente) {
            porCodigo.set(codigo, { ...linea, codigo });
            continue;
        }

        // Misma regla que el motor: las mediciones se suman.
        existente.cantidad += linea.cantidad;
        existente.unidadSeleccionada ??= linea.unidadSeleccionada ?? null;
        existente.descripcionLarga ??= linea.descripcionLarga ?? null;
    }

    for (const [codigo, ajuste] of Object.entries(a.lineas ?? {})) {
        const clave = codigo.trim().toUpperCase();
        const linea = porCodigo.get(clave);

        // Un ajuste sobre una partida que ya no está en la visita no es un error:
        // el comercial pudo recapturar y quitarla. Se ignora en silencio, y el
        // ajuste se queda guardado por si vuelve a aparecer.
        if (!linea) continue;

        if (ajuste.excluida) {
            porCodigo.delete(clave);
            continue;
        }

        if (typeof ajuste.cantidad === "number") linea.cantidad = ajuste.cantidad;
        if (typeof ajuste.precioUnitario === "number") linea.precioUnitario = ajuste.precioUnitario;
        if (ajuste.unidad !== undefined) linea.unidadSeleccionada = ajuste.unidad;
        if (ajuste.descripcionLarga !== undefined) linea.descripcionLarga = ajuste.descripcionLarga;
    }

    for (const anadida of a.anadidas ?? []) {
        const clave = String(anadida.codigo ?? "").trim().toUpperCase();
        if (!clave) continue;

        // Si dirección añade una partida que el comercial también capturó, gana
        // la de dirección: es una corrección, no una segunda medición.
        porCodigo.set(clave, {
            codigo: clave,
            cantidad: anadida.cantidad,
            precioUnitario: anadida.precioUnitario ?? null,
            unidadSeleccionada: anadida.unidad ?? null,
            descripcionLarga: anadida.descripcionLarga ?? null,
        });
    }

    const lineas = [...porCodigo.values()];

    if (lineas.length === 0) {
        throw new Error(
            "Los ajustes de dirección dejan el presupuesto sin ninguna partida. " +
                "Si el trabajo no se presupuesta, la oportunidad se marca como perdida."
        );
    }

    return { lineas, ivaTipo: a.ivaTipo ?? entrada.ivaTipo };
}

// ---------------------------------------------------------------------------
// Persistencia en la oportunidad
// ---------------------------------------------------------------------------

/**
 * Lee los ajustes de la oportunidad.
 *
 * Devuelve `null` cuando no hay ajustes: campo vacío, ausente, o con un JSON
 * ilegible. Un fallo de consulta LANZA — la misma distinción que en `estado.ts`,
 * y por el mismo motivo: "no hay ajustes" y "no he podido saber si hay ajustes"
 * llevan a publicar documentos distintos.
 */
export async function leerAjustes(
    subcuenta: Subcuenta,
    oportunidadId: string
): Promise<AjustesPresupuesto | null> {
    const campo = idCampo(subcuenta, "AJUSTES_PRESUPUESTO");

    // Subcuenta sin el campo creado (Vertical Projects a 21/09/2026): no hay
    // circuito de validación ahí, así que no hay ajustes. No es un error.
    if (!campo) return null;

    const datos = await saFetch(subcuenta, `/opportunities/${oportunidadId}`);
    const oportunidad = datos.opportunity ?? datos;
    const campos: Array<{ id: string; fieldValue?: unknown; field_value?: unknown }> =
        oportunidad?.customFields ?? [];

    const encontrado = campos.find((c) => c.id === campo);
    const valor = encontrado?.fieldValue ?? encontrado?.field_value;
    if (typeof valor !== "string" || valor.trim() === "") return null;

    try {
        const ajustes = JSON.parse(valor) as AjustesPresupuesto;
        if (ajustes?.version !== 1) {
            console.error(
                `[ajustes] Versión de formato desconocida (${ajustes?.version}) en la ` +
                    `oportunidad ${oportunidadId}. Se ignoran los ajustes.`
            );
            return null;
        }
        return ajustes;
    } catch {
        console.error(
            `[ajustes] JSON ilegible en la oportunidad ${oportunidadId} (subcuenta ` +
                `${subcuenta}). Se presupuesta SIN ajustes. Valor: ${valor.slice(0, 200)}`
        );
        return null;
    }
}

/**
 * Guarda los ajustes en la oportunidad.
 *
 * `customFields` se fusiona en el PUT, así que esto no toca el registro de
 * estado, el JSON de la visita ni el documento adjunto.
 */
export async function escribirAjustes(
    subcuenta: Subcuenta,
    oportunidadId: string,
    ajustes: AjustesPresupuesto
): Promise<AjustesPresupuesto> {
    const campo = idCampo(subcuenta, "AJUSTES_PRESUPUESTO");
    if (!campo) {
        throw new Error(
            `La subcuenta "${subcuenta}" no tiene creado el campo "Ajustes presupuesto". ` +
                `Créalo en GHL (LARGE_TEXT, model=opportunity) y pega su id en lib/ghl/ids.ts.`
        );
    }

    const conFecha: AjustesPresupuesto = { ...ajustes, actualizadoEn: new Date().toISOString() };

    await saFetch(subcuenta, `/opportunities/${oportunidadId}`, {
        method: "PUT",
        body: JSON.stringify({
            customFields: [{ id: campo, field_value: JSON.stringify(conFecha) }],
        }),
    });

    return conFecha;
}

/** Borra los ajustes. Para cuando dirección descarta sus cambios. */
export async function borrarAjustes(subcuenta: Subcuenta, oportunidadId: string): Promise<void> {
    const campo = idCampo(subcuenta, "AJUSTES_PRESUPUESTO");
    if (!campo) return;

    await saFetch(subcuenta, `/opportunities/${oportunidadId}`, {
        method: "PUT",
        body: JSON.stringify({ customFields: [{ id: campo, field_value: "" }] }),
    });
}