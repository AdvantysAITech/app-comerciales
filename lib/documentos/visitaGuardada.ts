import { saFetch, type Subcuenta } from "@/lib/ghl/client";
import { idsGhl } from "@/lib/ghl/ids";
import type { PayloadVisita } from "@/lib/visita/payload";

/**
 * lib/documentos/visitaGuardada.ts
 *
 * Lectura del JSON canónico de la visita guardado en la oportunidad.
 *
 * Estaba duplicado en `/api/documentos/generar`, y al escribir la ruta de
 * estado y el script de extremo a extremo habría hecho tres copias del mismo
 * id de campo y del mismo parseo. El id de un custom field es de las cosas que
 * cambian al replicar la subcuenta de Vertical: tres sitios donde tocarlo son
 * dos sitios donde olvidarlo.
 */

/*
 * El id del campo LARGE_TEXT con el JSON canónico de la visita vive en
 * lib/ghl/ids.ts (`campos.DATOS_VISITA`), por subcuenta. Lo anunciado arriba
 * pasó: en Vertical el campo tiene otro id (16/09/2026).
 */

/**
 * Devuelve el payload de la visita, o `null` si la oportunidad no lo tiene.
 *
 * `null` significa "no hay datos de visita". Un fallo de red LANZA: confundir
 * las dos cosas es lo que ya nos costó una tarde en `estado.ts`.
 *
 * El endpoint de detalle usa `fieldValue`; el de búsqueda, `fieldValueString`.
 * Aquí se contemplan las dos formas porque la respuesta ha llegado con ambas
 * según el camino por el que se pida.
 */
export async function leerPayloadVisita(
    subcuenta: Subcuenta,
    oportunidadId: string
): Promise<PayloadVisita | null> {
    const datos = await saFetch(subcuenta, `/opportunities/${oportunidadId}`);
    const oportunidad = datos.opportunity ?? datos;
    const campos: Array<{ id: string; fieldValue?: unknown; field_value?: unknown }> =
        oportunidad?.customFields ?? [];

    const idCampo = idsGhl(subcuenta).campos.DATOS_VISITA;
    const campo = campos.find((c) => c.id === idCampo);
    const valor = campo?.fieldValue ?? campo?.field_value;
    if (typeof valor !== "string" || valor.trim() === "") return null;

    try {
        return JSON.parse(valor) as PayloadVisita;
    } catch {
        return null;
    }
}