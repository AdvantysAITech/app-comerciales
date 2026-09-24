import type { SesionApp } from "@/lib/sesion";
import {
    filtroPropietario,
    leerOportunidad,
    puedeVerOportunidad,
    type OportunidadListado,
} from "@/lib/ghl/oportunidades";

/**
 * lib/permisos.ts
 *
 * Acceso a UNA oportunidad por su id, para todas las páginas y rutas que la
 * reciben desde fuera (URL o cuerpo de la petición).
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ EXISTE (24/09/2026)
 * ---------------------------------------------------------------------------
 * El listado ya filtraba por propietario (`filtroPropietario` +
 * `puedeVerOportunidad`, lib/ghl/oportunidades.ts), y la ficha y la toma de
 * datos también lo comprobaban. Pero las rutas de documentos no: con el id de
 * una oportunidad ajena, un comercial podía regenerar su presupuesto (lo que
 * desmarca la validación de dirección) o consultar su estado, que es la ruta
 * que CIERRA la generación y escribe en la oportunidad.
 *
 * La regla es la misma de siempre y vive en oportunidades.ts; aquí solo se
 * junta "leer" + "comprobar" en una llamada para que ninguna ruta se la salte.
 *
 * "No existe" y "no es tuya" devuelven lo mismo (`null`): un id ajeno no
 * confirma siquiera que la oportunidad exista.
 */

/**
 * La oportunidad, solo si existe en la subcuenta activa Y esta sesión puede
 * verla. `null` si no existe o no es suya: quien llama responde "no encontrada".
 *
 * Si GHL falla (red, 401, 429, 5xx) LANZA en vez de devolver `null`. No es lo
 * mismo "no es tuya" que "no he podido comprobarlo", y confundirlos hacía que
 * un corte de un segundo diera por fallida una generación en curso o dijera al
 * comercial que su oportunidad no existe.
 */
export async function oportunidadAutorizada(
    sesion: SesionApp,
    oportunidadId: string | null | undefined
): Promise<OportunidadListado | null> {
    const id = oportunidadId?.trim();
    if (!id) return null;

    const oportunidad = await leerOportunidad(sesion.subcuenta, id);
    if (!oportunidad) return null;

    if (!puedeVerOportunidad(filtroPropietario(sesion), oportunidad)) {
        console.warn(
            `[permisos] ${sesion.email ?? "usuario"} ha pedido la oportunidad ${id}, ` +
                `que no es suya (propietario: ${oportunidad.asignadoA ?? "ninguno"}).`
        );
        return null;
    }

    return oportunidad;
}
