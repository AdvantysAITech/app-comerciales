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
 * El flujo antiguo (lib/ghl/oportunidades.ts) busca una oportunidad ya creada
 * por la automatizacion T66 en Visita concertada y la avanza. Este no: crea la
 * oportunidad directamente en Datos recogidos, porque el modulo Avisos todavia
 * no existe y no hay nada previo que buscar. Es una desviacion consciente del
 * DERCAS 4.2, ya registrada, y hay que revisarla cuando Avisos se desarrolle.
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

    const data = await saFetch(subcuenta, "/opportunities/", {
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

    const oportunidad = data.opportunity ?? data;
    if (!oportunidad?.id) {
        throw new Error(
            `El Sistema Advantys no devolvio id al crear la oportunidad. Respuesta: ${JSON.stringify(data)}`
        );
    }

    return oportunidad.id;
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
    asignadoA: string | null = null
): Promise<ResultadoPresupuesto> {
    const avisos: string[] = [];

    // 1. Comunidad: existente o alta al vuelo, con su administrador enlazado.
    const { comunidad, creada } = await obtenerOCrearComunidad(subcuenta, {
        nombreDireccion: entrada.comunidadNombre,
        administradorId: entrada.administradorId ?? undefined,
    });

    if (creada) avisos.push(`Se ha creado la comunidad "${comunidad.nombreDireccion}" en la base de datos.`);

    // 2. Administrador: hace falta su nombre para el presupuesto y sus datos de
    //    contacto para el alta en GHL.
    const administradores = entrada.administradorId ? await listarAdministradores(subcuenta) : [];
    const administrador = administradores.find((a) => a.id === entrada.administradorId);

    // 3. Contacto de la oportunidad.
    //    Es el ADMINISTRADOR, no la persona de la visita: la cadena de
    //    seguimiento (DERCAS 5.2) escribe al administrador, y cuelga del
    //    contacto de la oportunidad. Sin administrador se usa el contacto de la
    //    visita, que es mejor que no tener ninguno.
    const contactId = administrador
        ? await upsertContact(subcuenta, {
              nombre: administrador.contactoPrincipal ?? administrador.nombreDespacho ?? "Administrador",
              email: administrador.email,
              telefono: administrador.telefono,
          })
        : await upsertContact(subcuenta, {
              nombre: entrada.contacto,
              telefono: entrada.telefono,
          });

    if (!administrador) {
        avisos.push("Sin administrador asignado: la oportunidad cuelga del contacto de la visita.");
    }

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
    const grupos = agruparEnOportunidades(payload);
    const oportunidades: OportunidadCreada[] = [];

    for (const grupo of grupos) {
        const keys = grupo.modulos.map((m) => m.key);
        const payloadGrupo = payloadDelGrupo(payload, keys);
        const modeloNegocio = modeloNegocioComun(grupo.modulos);

        const json = JSON.stringify(payloadGrupo);

        const id = await crearOportunidadPresupuesto(subcuenta, {
            contactId,
            asignadoA,
            nombre: nombreOportunidad(comunidad.nombreDireccion, grupo.etiqueta),
            comunidadNombre: comunidad.nombreDireccion,
            fechaVisita: payload.fechaVisita,
            modeloNegocio,
            descripcion: resumenLegible(payloadGrupo),
            json,
        });

        await asociarComunidadConOportunidad(subcuenta, comunidad.id, id);

        oportunidades.push({
            id,
            nombre: nombreOportunidad(comunidad.nombreDireccion, grupo.etiqueta),
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