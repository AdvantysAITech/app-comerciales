import { saFetch, type Subcuenta } from "./client";
import { casillaGhl, type CasillaOportunidad } from "./ids";

/**
 * lib/ghl/casillas.ts
 *
 * Las dos casillas (CHECKBOX) que gobiernan el circuito de validación de
 * presupuestos, y que son la ÚNICA señal que la app le da al CRM.
 *
 * ---------------------------------------------------------------------------
 * EL CIRCUITO, EN UNA PANTALLA
 * ---------------------------------------------------------------------------
 *  1. `/api/documentos/generar` LIMPIA las dos casillas al encolar.
 *  2. Al publicar, el cierre marca `PRESUPUESTO_GENERADO` EN EL MISMO PUT que
 *     adjunta el fichero (ver `adjuntarPresupuesto`).
 *  3. GHL dispara el workflow de aviso a dirección si `PRESUPUESTO_VALIDADO`
 *     está vacío.
 *  4. Dirección marca `PRESUPUESTO_VALIDADO` -- a mano en el CRM, o desde la
 *     pantalla de revisión de la app (bloque B2) -- y GHL envía el presupuesto
 *     al administrador y mueve la oportunidad a "Presupuesto enviado".
 *
 * El paso 1 no es cosmético: el trigger del workflow es "Added", que solo salta
 * en la transición vacío -> marcado. Sin la limpieza previa, la segunda
 * generación de una misma oportunidad no volvería a avisar a dirección.
 * Verificado el 21/09/2026 con un ciclo marcar / desmarcar / marcar: dos
 * ejecuciones, la del medio ninguna.
 *
 * ---------------------------------------------------------------------------
 * REGLAS DE ESCRITURA (verificadas por API, no supuestas)
 * ---------------------------------------------------------------------------
 *  - El valor es un ARRAY de etiquetas. Marcar = `[opcion]`, desmarcar = `[]`.
 *  - La etiqueta tiene que ser EXACTA. GHL acepta cualquier otra cadena, responde
 *    200 y deja la casilla sin marcar: un fallo silencioso. Por eso la opción
 *    vive junto al id en `ids.ts` y no se escribe a mano en ningún otro sitio.
 *  - Desmarcada, la casilla desaparece de `customFields`. Ausencia = no marcada.
 *  - `customFields` se FUSIONA en el PUT: enviar solo estas casillas deja
 *    intactos el registro de estado, el JSON de la visita y el fichero adjunto.
 *  - `locationId` se omite: GHL lo exige en POST y lo rechaza en PUT.
 */

/** Entrada de `customFields` lista para un PUT. `null` si la subcuenta no tiene la casilla. */
export type EntradaCasilla = { id: string; field_value: string[] };

/**
 * Construye la entrada de `customFields` de una casilla.
 *
 * Se expone aparte de `escribirCasillas` para poder MEZCLARLA en un PUT que ya
 * se está haciendo. Es lo que hace `adjuntarPresupuesto`: el fichero y la
 * casilla `PRESUPUESTO_GENERADO` viajan juntos. Si fueran dos llamadas, el
 * workflow podría dispararse entre una y otra y avisar de un presupuesto cuyo
 * documento todavía no está en el campo.
 */
export function entradaCasilla(
    subcuenta: Subcuenta,
    casilla: CasillaOportunidad,
    marcada: boolean
): EntradaCasilla | null {
    const campo = casillaGhl(subcuenta, casilla);
    if (!campo) return null;

    return { id: campo.id, field_value: marcada ? [campo.opcion] : [] };
}

/**
 * Escribe una o varias casillas en un único PUT.
 *
 * Las casillas que la subcuenta no tenga configuradas se omiten en silencio: en
 * Vertical Projects todavía no existen y el circuito de validación no está
 * activo allí. Si no hay ninguna que escribir, no se llama a la API.
 */
export async function escribirCasillas(
    subcuenta: Subcuenta,
    oportunidadId: string,
    valores: Partial<Record<CasillaOportunidad, boolean>>
): Promise<void> {
    const customFields = (Object.entries(valores) as Array<[CasillaOportunidad, boolean]>)
        .map(([casilla, marcada]) => entradaCasilla(subcuenta, casilla, marcada))
        .filter((entrada): entrada is EntradaCasilla => entrada !== null);

    if (customFields.length === 0) return;

    await saFetch(subcuenta, `/opportunities/${oportunidadId}`, {
        method: "PUT",
        body: JSON.stringify({ customFields }),
    });
}

/**
 * Deja el circuito en su estado inicial: sin generar y sin validar.
 *
 * Se llama al ENCOLAR una generación, no al terminarla. Mientras el documento
 * se está rehaciendo, el anterior ya no vale: una oportunidad marcada como
 * validada apuntando a un documento que está siendo sustituido es justo el
 * estado que haría que se enviara al administrador el presupuesto equivocado.
 */
export async function limpiarCasillasPresupuesto(
    subcuenta: Subcuenta,
    oportunidadId: string
): Promise<void> {
    await escribirCasillas(subcuenta, oportunidadId, {
        PRESUPUESTO_GENERADO: false,
        PRESUPUESTO_VALIDADO: false,
    });
}

/**
 * ¿Está marcada esta casilla en los `customFields` de una oportunidad?
 *
 * Trabaja sobre los campos ya leídos, para poder usarse tanto con el endpoint
 * de detalle como con el de búsqueda sin repetir la consulta. GHL no es
 * consistente entre los dos: el valor puede venir en `fieldValue`,
 * `fieldValueString` o `fieldValueArray`, y como array o como cadena. Se
 * prueban todas las formas y se compara SIEMPRE contra la opción del picklist:
 * un valor cualquiera guardado en el campo no es una casilla marcada.
 */
export function casillaMarcadaEn(
    subcuenta: Subcuenta,
    casilla: CasillaOportunidad,
    customFields: ReadonlyArray<Record<string, unknown>> | null | undefined
): boolean {
    const campo = casillaGhl(subcuenta, casilla);
    if (!campo) return false;

    const encontrado = (customFields ?? []).find((c) => c?.id === campo.id);
    if (!encontrado) return false;

    const bruto =
        encontrado.fieldValue ??
        encontrado.fieldValueArray ??
        encontrado.fieldValueString ??
        encontrado.value;

    const etiquetas = Array.isArray(bruto) ? bruto : bruto === undefined || bruto === null ? [] : [bruto];

    return etiquetas.some((e) => String(e).trim() === campo.opcion);
}

/**
 * Lee el estado de las dos casillas.
 *
 * Una casilla que no aparece en `customFields` está desmarcada, no ausente: GHL
 * omite las propiedades vacías. Una casilla que la subcuenta no tiene creada
 * también sale `false`, que es el comportamiento correcto para la UI (el
 * circuito no está activo ahí).
 *
 * Lanza si la consulta falla. No se devuelve `false` ante un error de red: "no
 * está validado" y "no he podido saber si está validado" llevan a decisiones
 * opuestas, y confundirlas ya nos costó una tarde en `estado.ts`.
 */
export async function leerCasillas(
    subcuenta: Subcuenta,
    oportunidadId: string
): Promise<Record<CasillaOportunidad, boolean>> {
    const datos = await saFetch(subcuenta, `/opportunities/${oportunidadId}`);
    const oportunidad = datos.opportunity ?? datos;
    const campos: Array<Record<string, unknown>> = oportunidad?.customFields ?? [];

    return {
        PRESUPUESTO_GENERADO: casillaMarcadaEn(subcuenta, "PRESUPUESTO_GENERADO", campos),
        PRESUPUESTO_VALIDADO: casillaMarcadaEn(subcuenta, "PRESUPUESTO_VALIDADO", campos),
    };
}
