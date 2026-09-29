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

/**
 * Por qué esta sesión NO puede (re)generar el presupuesto de esta oportunidad,
 * o `null` si puede.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ EXISTE (24/09/2026)
 * ---------------------------------------------------------------------------
 * Regenerar desmarca la validación de dirección y SUSTITUYE el documento
 * adjunto en GHL. Sobre un presupuesto ya validado o ya enviado, eso deja al
 * administrador con un PDF que ya no es el que hay en el CRM, y a Miguel sin
 * saber que su validación se ha perdido. Nada lo impedía.
 *
 * ---------------------------------------------------------------------------
 * REGLAS
 * ---------------------------------------------------------------------------
 *  - Nadie en "Visita concertada" (no hay datos) ni en Ganada / Pérdida
 *    (oportunidad cerrada).
 *  - Comercial: solo en "Datos recogidos" o "Presupuesto en revisión", y solo
 *    mientras dirección NO lo haya validado.
 *  - Dirección: además en "Presupuesto enviado" y "En negociación". Rehacer un
 *    presupuesto enviado es una decisión suya (una contraoferta, por ejemplo).
 *
 * La usan la ruta de generación (409) y la ficha (oculta el botón y dice por
 * qué). Ocultar el botón no es control de acceso: la ruta lo vuelve a mirar.
 */
export function motivoNoRegenerar(
    sesion: Pick<SesionApp, "rol">,
    oportunidad: Pick<OportunidadListado, "etapa" | "presupuestoValidado">
): string | null {
    const etapa = oportunidad.etapa;

    if (etapa === null || etapa === "AVISO_RECIBIDO" || etapa === "VISITA_CONCERTADA") {
        return "Todavía no hay datos de la visita para generar el presupuesto.";
    }
    if (etapa === "GANADA" || etapa === "PERDIDA") {
        return "La oportunidad está cerrada: su presupuesto ya no se puede rehacer.";
    }

    if (sesion.rol === "direccion") return null;

    if (etapa === "PRESUPUESTO_ENVIADO" || etapa === "EN_NEGOCIACION") {
        return "El presupuesto ya se ha enviado. Si hay que rehacerlo, pídeselo a dirección.";
    }
    if (oportunidad.presupuestoValidado) {
        return "Dirección ya ha validado este presupuesto. Si hay que rehacerlo, pídeselo a dirección.";
    }

    return null;
}
