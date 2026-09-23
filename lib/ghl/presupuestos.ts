import { saFetch, getLocationId, type Subcuenta } from "./client";
import { obtenerOCrearComunidad, asociarComunidadConOportunidad } from "./comunidades";
import { listarAdministradores } from "./administradores";
import { upsertContact } from "./contactos";
import { idsGhl } from "./ids";
import {
    agruparEnOportunidades,
    construirPayload,
    modeloNegocioComun,
    nombreOportunidad,
    resumenLegible,
    totalPartidas,
    type DatosCaptura,
    type PayloadVisita,
} from "@/lib/visita/payload";

/**
 * Alta en GHL del flujo de presupuestos v2.
 *
 * Dos entradas (23/09/2026):
 *
 *  - DESDE UNA OPORTUNIDAD EN "VISITA CONCERTADA" (`oportunidadExistente`): es
 *    el camino del DERCAS 4.2. El comercial abre la oportunidad desde el panel,
 *    toma los datos y al guardar se ACTUALIZA esa misma oportunidad y pasa a
 *    "Datos recogidos". No se crea otra.
 *
 *  - SIN OPORTUNIDAD PREVIA ("Nuevo presupuesto"): se crea directamente en
 *    "Datos recogidos", como hasta ahora. Sigue haciendo falta para las visitas
 *    que no entraron como aviso. Desviacion del DERCAS 4.2 ya registrada.
 */

// Pipeline, etapas y custom fields: lib/ghl/ids.ts, por subcuenta (16/09/2026).

/**
 * Etiquetas EXACTAS del picklist "Modelo de negocio".
 * GHL acepta valores fuera de la lista sin dar error, y esa oportunidad deja de
 * aparecer al filtrar. Una mayuscula mal aqui falsea el reporting en silencio.
 */
const ETIQUETA_MODELO_NEGOCIO: Record<string, string> = {
    rehabilitacion_impermeabilizacion: "Rehabilitación e Impermeabilización",
    descuelgues_verticales: "Descuelgues Verticales",
    retirada_amianto: "Retirada de Amianto",
    reformas_zonas_comunes: "Reformas y Zonas Comunes",
};

export type OportunidadCreada = {
    id: string;
    nombre: string;
    modeloNegocio: string | null;
    /** Tamano del JSON escrito en el custom field. Sirve para detectar truncado. */
    bytesJson: number;
};

/** Oportunidad en "Visita concertada" sobre la que se toman los datos. */
export type OportunidadExistente = {
    id: string;
    /** Contacto principal actual. Se compara con el del formulario. */
    contactId: string | null;
};

export type ResultadoPresupuesto = {
    comunidad: { id: string; nombre: string; creada: boolean };
    contactId: string;
    oportunidades: OportunidadCreada[];
    /** Mensajes para mostrar al comercial. No son errores: el alta si se hizo. */
    avisos: string[];
    payload: PayloadVisita;
};

/** Datos que llegan del formulario. La subcuenta y la identidad salen de la sesion. */
export type EntradaPresupuesto = Omit<
    DatosCaptura,
    "subcuenta" | "empresa" | "comercial" | "comunidadId" | "comunidadCreada" | "administradorNombre"
>;

/**
 * Payload recortado a los modulos de un grupo.
 *
 * Cada oportunidad guarda solo lo suyo: si se agrupa por modulo, la oportunidad
 * de Cubiertas no debe llevar en su JSON las partidas de Bajantes.
 */
function payloadDelGrupo(payload: PayloadVisita, keysModulos: string[]): PayloadVisita {
    return { ...payload, modulos: payload.modulos.filter((m) => keysModulos.includes(m.key)) };
}

async function crearOportunidadPresupuesto(
    subcuenta: Subcuenta,
    datos: {
        contactId: string;
        nombre: string;
        comunidadNombre: string;
        fechaVisita: string;
        modeloNegocio: string | null;
        descripcion: string;
        json: string;
        /** Id del comercial en GHL. Sin el, la oportunidad nace sin propietario. */
        asignadoA?: string | null;
    }
): Promise<string> {
    const { pipelineId, etapas, campos } = idsGhl(subcuenta);
    const customFields: Array<{ id: string; field_value: string }> = [
        { id: campos.DESCRIPCION, field_value: datos.descripcion },
        { id: campos.FECHA_VISITA, field_value: datos.fechaVisita },
        { id: campos.COMUNIDAD, field_value: datos.comunidadNombre },
        { id: campos.DATOS_VISITA, field_value: datos.json },
    ];

    // Si los modulos de la oportunidad no comparten modelo de negocio, el campo
    // se deja SIN ESCRIBIR. Es SINGLE_OPTIONS: no hay valor correcto y GHL
    // aceptaria cualquier cosa. Mejor un hueco auditable que un dato inventado.
    if (datos.modeloNegocio) {
        customFields.push({
            id: campos.MODELO_NEGOCIO,
            field_value: ETIQUETA_MODELO_NEGOCIO[datos.modeloNegocio],
        });
    }

    // Propietario de la oportunidad.
    //
    // No es cosmetico: los workflows del CRM avisan al "Assigned To", y el aviso
    // de presupuesto validado va dirigido al comercial que llevo la visita. Sin
    // propietario, ese workflow se ejecuta y no notifica a nadie.
    if (!datos.asignadoA) {
        console.warn(
            `[presupuestos] Oportunidad "${datos.nombre}" creada SIN propietario: ` +
                `el usuario de la sesion no tiene id de GHL configurado. ` +
                `Revisa las variables *_GHL_USER_ID.`
        );
    }

    let data;
    try {
        data = await saFetch(subcuenta, "/opportunities/", {
            method: "POST",
            body: JSON.stringify({
                locationId: getLocationId(subcuenta),
                pipelineId,
                pipelineStageId: etapas.DATOS_RECOGIDOS,
                contactId: datos.contactId,
                name: datos.nombre,
                status: "open",
                ...(datos.asignadoA ? { assignedTo: datos.asignadoA } : {}),
                customFields,
            }),
        });
    } catch (error) {
        // GHL: 400 "Invalid assigned to user" = ese id de usuario no existe en
        // ESTA location. No se reintenta sin propietario: la oportunidad
        // quedaria invisible para el comercial (solo ve las suyas). Se para con
        // un mensaje que diga que variable revisar.
        const mensaje = error instanceof Error ? error.message : "";
        if (/invalid assigned to user/i.test(mensaje)) {
            throw new Error(
                `Tu usuario no esta dado de alta en el CRM de esta empresa (${subcuenta}), ` +
                    `o su id no es el correcto (${datos.asignadoA}). Avisa a Advantys: hay que ` +
                    `revisar la variable *_GHL_USER_ID_${subcuenta === "scala-valencia" ? "SCALA" : "VERTICAL"}. ` +
                    `La visita sigue guardada en el borrador.`
            );
        }
        throw error;
    }

    const oportunidad = data.opportunity ?? data;
    if (!oportunidad?.id) {
        throw new Error(
            `El Sistema Advantys no devolvio id al crear la oportunidad. Respuesta: ${JSON.stringify(data)}`
        );
    }

    return oportunidad.id;
}

/**
 * Vuelca los datos de la visita sobre una oportunidad que ya existe y la pasa
 * a "Datos recogidos".
 *
 * PUT parcial (verificado): `customFields` se fusiona y lo que no se envía se
 * queda como estaba. `assignedTo` NO se toca: la oportunidad ya es del
 * comercial, si no, no la habría podido abrir. `locationId` se omite: GHL lo
 * exige en POST y lo rechaza en PUT.
 */
async function actualizarOportunidadPresupuesto(
    subcuenta: Subcuenta,
    oportunidadId: string,
    datos: {
        nombre: string;
        comunidadNombre: string;
        fechaVisita: string;
        modeloNegocio: string | null;
        descripcion: string;
        json: string;
    }
): Promise<void> {
    const { etapas, campos } = idsGhl(subcuenta);
    const customFields: Array<{ id: string; field_value: string }> = [
        { id: campos.DESCRIPCION, field_value: datos.descripcion },
        { id: campos.FECHA_VISITA, field_value: datos.fechaVisita },
        { id: campos.COMUNIDAD, field_value: datos.comunidadNombre },
        { id: campos.DATOS_VISITA, field_value: datos.json },
    ];
    if (datos.modeloNegocio) {
        customFields.push({
            id: campos.MODELO_NEGOCIO,
            field_value: ETIQUETA_MODELO_NEGOCIO[datos.modeloNegocio],
        });
    }

    await saFetch(subcuenta, `/opportunities/${oportunidadId}`, {
        method: "PUT",
        body: JSON.stringify({
            name: datos.nombre,
            pipelineStageId: etapas.DATOS_RECOGIDOS,
            customFields,
        }),
    });
}

/**
 * Registra un presupuesto completo: comunidad, contacto, oportunidades y
 * asociaciones.
 *
 * El orden importa. Primero se deja todo registrado en GHL y solo despues se
 * llamara a la app de documentos (bloque siguiente): si esa llamada falla, la
 * visita ya esta guardada y se puede reintentar. Al reves, un fallo dejaria el
 * documento generado y la visita perdida, que es lo que el comercial no se
 * puede permitir estando en obra.
 */
export async function registrarPresupuesto(
    subcuenta: Subcuenta,
    empresa: string,
    comercial: string,
    entrada: EntradaPresupuesto,
    /** Id en GHL del comercial que ha iniciado sesion. Sale de la sesion. */
    asignadoA: string | null = null,
    /**
     * Oportunidad en "Visita concertada" de la que viene el formulario. La ruta
     * ya ha comprobado que es del comercial y que esta en esa etapa.
     */
    oportunidadExistente: OportunidadExistente | null = null
): Promise<ResultadoPresupuesto> {
    const avisos: string[] = [];

    // 1. Comunidad: existente o alta al vuelo, con su administrador enlazado.
    const { comunidad, creada } = await obtenerOCrearComunidad(subcuenta, {
        nombreDireccion: entrada.comunidadNombre,
        administradorId: entrada.administradorId ?? undefined,
    });

    if (creada) avisos.push(`Se ha creado la comunidad "${comunidad.nombreDireccion}" en la base de datos.`);

    // 2. Administrador: hace falta su nombre para el presupuesto. Ya NO es el
    //    contacto de la oportunidad (ver paso 3); queda enlazado a la comunidad
    //    y guardado en el JSON de la visita.
    const administradores = entrada.administradorId ? await listarAdministradores(subcuenta) : [];
    const administrador = administradores.find((a) => a.id === entrada.administradorId);

    // 3. Contacto PRINCIPAL de la oportunidad: la persona de la visita.
    //
    //    Decision de Jacob (23/09/2026): el contacto principal es el vecino o
    //    propietario de la finca que avisa a la empresa para que vaya a verla,
    //    haya administrador o no. El administrador es a quien se le pasa el
    //    contrato (DERCAS 5.3), no el contacto de la oportunidad.
    //
    //    Hasta hoy, con administrador elegido, el contacto era el administrador
    //    y el vecino solo quedaba escrito en la descripcion. Desviacion del
    //    DERCAS 5.2 (la cadena de seguimiento escribe al contacto principal, que
    //    ahora es el vecino): pendiente de reflejar en el documento.
    //
    //    `upsert`: si el telefono ya existe en la subcuenta, GHL reutiliza ese
    //    contacto en vez de duplicarlo.
    const contactId = await upsertContact(subcuenta, {
        nombre: entrada.contacto.trim(),
        telefono: entrada.telefono.trim(),
    });

    // 4. Payload canonico, resuelto en servidor contra el catalogo.
    const payload = construirPayload({
        ...entrada,
        subcuenta,
        empresa,
        comercial,
        comunidadId: comunidad.id,
        comunidadCreada: creada,
        administradorNombre: administrador?.nombreDespacho ?? null,
    });

    if (totalPartidas(payload) === 0) {
        throw new Error("No hay ninguna partida seleccionada: no se registra nada.");
    }

    // 5. Una oportunidad por grupo (hoy, un unico grupo con todo).
    //
    //    Si se viene de una oportunidad en "Visita concertada", el PRIMER grupo
    //    se vuelca sobre ella; si algun dia hay mas de un grupo, el resto se
    //    crea nuevo como hasta ahora.
    const grupos = agruparEnOportunidades(payload);
    const oportunidades: OportunidadCreada[] = [];

    for (const [indice, grupo] of grupos.entries()) {
        const keys = grupo.modulos.map((m) => m.key);
        const payloadGrupo = payloadDelGrupo(payload, keys);
        const modeloNegocio = modeloNegocioComun(grupo.modulos);

        const json = JSON.stringify(payloadGrupo);
        const nombre = nombreOportunidad(comunidad.nombreDireccion, grupo.etiqueta);
        const datosGrupo = {
            nombre,
            comunidadNombre: comunidad.nombreDireccion,
            fechaVisita: payload.fechaVisita,
            modeloNegocio,
            descripcion: resumenLegible(payloadGrupo),
            json,
        };

        const usaExistente = oportunidadExistente !== null && indice === 0;
        let id: string;

        if (usaExistente) {
            id = oportunidadExistente.id;
            await actualizarOportunidadPresupuesto(subcuenta, id, datosGrupo);

            // Contacto principal = el del formulario (decision 23/09/2026). Si
            // el comercial lo ha cambiado respecto al que traia la oportunidad,
            // se reasigna. Va aparte y no bloquea: los datos de la visita ya
            // estan guardados y eso es lo que no se puede perder.
            if (contactId !== oportunidadExistente.contactId) {
                try {
                    await saFetch(subcuenta, `/opportunities/${id}`, {
                        method: "PUT",
                        body: JSON.stringify({ contactId }),
                    });
                } catch (error) {
                    const motivo = error instanceof Error ? error.message : "error desconocido";
                    avisos.push(
                        `Datos guardados, pero no se ha podido cambiar el contacto principal de la oportunidad: ${motivo}`
                    );
                }
            }

            // La oportunidad puede venir ya vinculada a su comunidad (si se
            // creo desde el CRM con ella). Un fallo aqui no invalida el alta.
            try {
                await asociarComunidadConOportunidad(subcuenta, comunidad.id, id);
            } catch (error) {
                const motivo = error instanceof Error ? error.message : "error desconocido";
                console.warn(`[presupuestos] Asociacion comunidad-oportunidad ${id}: ${motivo}`);
            }
        } else {
            id = await crearOportunidadPresupuesto(subcuenta, { ...datosGrupo, contactId, asignadoA });
            await asociarComunidadConOportunidad(subcuenta, comunidad.id, id);
        }

        oportunidades.push({
            id,
            nombre,
            modeloNegocio,
            bytesJson: json.length,
        });
    }

    // 6. Alertas del catalogo (hoy: amianto) al comercial.
    for (const modulo of payload.modulos) {
        for (const alerta of modulo.alertas) avisos.push(`${modulo.label}: ${alerta}`);
    }

    return {
        comunidad: { id: comunidad.id, nombre: comunidad.nombreDireccion, creada },
        contactId,
        oportunidades,
        avisos,
        payload,
    };
}