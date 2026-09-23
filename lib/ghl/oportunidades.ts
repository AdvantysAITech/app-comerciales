import { saFetch, getLocationId, type Subcuenta } from "./client";
import { asociarComunidadConOportunidad } from "./comunidades";
import { casillaMarcadaEn, entradaCasilla } from "./casillas";
import {
    claveEtapa,
    ETAPAS_ANTES_DE_REVISION,
    idsGhl,
    NOMBRE_ETAPA,
    type CasillaOportunidad,
    type ClaveEtapa,
} from "./ids";

// Pipeline, etapas y custom fields viven en lib/ghl/ids.ts, por subcuenta.
// Se reexportan para no romper a quien los importaba desde aquí.
export { ETAPAS_PRESUPUESTO, NOMBRE_ETAPA, type ClaveEtapa } from "./ids";

/**
 * Etiquetas EXACTAS del picklist "Modelo de negocio" en GHL.
 *
 * No tocar sin comprobar antes el picklist en la subcuenta. GHL acepta y guarda
 * valores que no estan en la lista sin devolver error, asi que una mayuscula
 * mal puesta no rompe nada a la vista: simplemente esa oportunidad deja de
 * aparecer al filtrar por modelo de negocio y el reporting de direccion sale
 * incompleto sin que nadie se entere.
 */
const ETIQUETA_MODELO_NEGOCIO: Record<string, string> = {
    rehabilitacion_impermeabilizacion: "Rehabilitación e Impermeabilización",
    descuelgues_verticales: "Descuelgues Verticales",
    retirada_amianto: "Retirada de Amianto",
    reformas_zonas_comunes: "Reformas y Zonas Comunes",
};

type DatosOportunidad = {
    contactId: string;
    comunidadId: string;
    comunidadNombre: string;
    modeloNegocio: string;
    fecha: string;
    contactoVisita: string;
    descripcionLibre: string;
    camposEspecificos: Record<string, string>;
    fotos: string[];
    /**
     * Id en GHL del comercial que crea la oportunidad (`assignedTo`).
     *
     * Los workflows del CRM notifican al "Assigned To": el aviso de presupuesto
     * validado va dirigido a quien llevó la visita. Una oportunidad sin
     * propietario ejecuta el workflow y no avisa a nadie.
     */
    asignadoA?: string | null;
};

type OportunidadAbierta = {
    id: string;
    name: string;
    pipelineStageId: string;
    etapa: ClaveEtapa | null;
    createdAt: string;
    modeloNegocio: string | null;
}

export type OportunidadListado = {
    id: string;
    name: string;
    pipelineStageId: string;
    /**
     * Etapa normalizada. La UI trabaja con esto y no con `pipelineStageId`: el
     * ID de una misma etapa es distinto en cada subcuenta.
     */
    etapa: ClaveEtapa | null;
    createdAt: string;
    modeloNegocio: string | null;
    comunidadNombre: string | null;
    fechaVisita: string | null;
    descripcionVisita: string | null;
    /** Dirección ha dado el presupuesto por bueno. */
    presupuestoValidado: boolean;
    /**
     * Id en GHL del usuario propietario (`assignedTo`). Es lo que decide qué
     * oportunidades ve un comercial: solo las suyas.
     */
    asignadoA: string | null;
    /**
     * Contacto PRINCIPAL de la oportunidad en GHL: el vecino o propietario que
     * avisa (decision 23/09/2026). En oportunidades anteriores a ese cambio,
     * si se eligio administrador, aqui aparece el administrador.
     */
    contacto: {
        id: string | null;
        nombre: string | null;
        email: string | null;
        telefono: string | null;
    };
    /**
     * Administrador de la finca. Sale del JSON de la visita, NO del contacto
     * de la oportunidad: desde el 23/09/2026 el contacto es el vecino.
     */
    administrador: {
        nombre: string | null;
    };
};

type DatosVisita = {
    comunidadNombre: string;
    modeloNegocio: string;
    fecha: string;
    contactoVisita: string;
    descripcionLibre: string;
    camposEspecificos: Record<string, string>;
    fotos: string[];
};

/**
 * Lee un custom field sin dar por hecho en que clave viene el valor.
 *
 * GHL no es consistente: /opportunities/search devuelve `fieldValueString` y
 * /opportunities/{id} devuelve `fieldValue` para el mismo campo. Como este
 * mapeador se usa para las dos respuestas, leer una sola clave dejaba la ficha
 * de detalle completamente vacia. Se prueban por orden y gana la primera que
 * traiga algo.
 */
function valorCampo(op: any, campoId: string): string | null {
    const campo = op.customFields?.find((cf: any) => cf.id === campoId);
    if (!campo) return null;

    const bruto = campo.fieldValueString ?? campo.fieldValue ?? campo.value ?? null;
    if (bruto === null || bruto === undefined || bruto === "") return null;

    return typeof bruto === "string" ? bruto : String(bruto);
}

/**
 * Lee un custom field de tipo DATE y lo devuelve como dd/mm/aaaa.
 *
 * Los campos DATE llegan en `fieldValueDate` como timestamp en milisegundos, no
 * en `fieldValueString`. Se usan getters UTC a proposito: con los locales, una
 * fecha guardada a medianoche UTC puede pintarse con un dia de menos segun la
 * zona horaria del servidor.
 */
function valorFecha(op: any, campoId: string): string | null {
    const campo = op.customFields?.find((cf: any) => cf.id === campoId);
    if (!campo) return null;

    const bruto =
        campo.fieldValueDate ?? campo.fieldValue ?? campo.fieldValueString ?? null;
    if (bruto === null || bruto === undefined || bruto === "") return null;

    // El timestamp puede llegar como numero o como cadena de digitos.
    const comoTexto = String(bruto);
    const milisegundos =
        typeof bruto === "number"
            ? bruto
            : /^\d+$/.test(comoTexto)
              ? Number(comoTexto)
              : null;

    const fecha = milisegundos !== null ? new Date(milisegundos) : new Date(comoTexto);

    // Si no hay forma de interpretarla, se devuelve tal cual antes que perder el dato.
    if (Number.isNaN(fecha.getTime())) return comoTexto;

    const dia = String(fecha.getUTCDate()).padStart(2, "0");
    const mes = String(fecha.getUTCMonth() + 1).padStart(2, "0");

    return `${dia}/${mes}/${fecha.getUTCFullYear()}`;
}

function construirDescripcion(datos: {
    contactoVisita: string;
    camposEspecificos: Record<string, string>;
    fotos: string[];
    descripcionLibre: string;
}): string {
    const detalles = 
        Object.entries(datos.camposEspecificos)
            .map(([key, value]) => `- ${key}: ${value}`)
            .join("\n") || "(sin detalles)";

    const fotos =
        datos.fotos.map((url, i) => `Foto ${i + 1}: ${url}`).join("\n") || "(sin fotos)";

    return [
        `Contacto de la visita: ${datos.contactoVisita || "(no especificado)"}`,
        "",
        "Detalles del trabajo",
        detalles,
        "",
        "Fotos: ",
        fotos,
        "",
        "Descripción del comercial: ",
        datos.descripcionLibre || "(sin descripción adicional)",
    ].join("\n");
}

/**
 * Estado que se le enseña al usuario en la app.
 *
 * La validación de dirección NO es una etapa del pipeline: es una casilla de la
 * oportunidad. Mientras esté marcada y la oportunidad siga en revisión, el
 * estado honesto es "Presupuesto validado" -- si se pintara la etapa a secas,
 * el comercial seguiría leyendo "Presupuesto en revisión" en un presupuesto que
 * dirección ya ha dado por bueno y que le toca enviar a él.
 *
 * En cuanto la oportunidad avanza a "Presupuesto enviado" manda la etapa otra
 * vez: ahí la casilla ya no aporta nada.
 */
export function estadoVisible(oportunidad: {
    etapa: ClaveEtapa | null;
    presupuestoValidado: boolean;
}): string {
    if (oportunidad.presupuestoValidado && oportunidad.etapa === "PRESUPUESTO_EN_REVISION") {
        return "Presupuesto validado";
    }

    return oportunidad.etapa ? NOMBRE_ETAPA[oportunidad.etapa] : "—";
}

/**
 * Nombre del administrador guardado en el JSON de la visita (`DATOS_VISITA`).
 *
 * `null` si la oportunidad no tiene JSON (flujo antiguo) o no lleva
 * administrador. No lanza: un JSON corrupto no debe tumbar el listado.
 */
function administradorDeLaVisita(op: unknown, campoId: string): string | null {
    const bruto = valorCampo(op, campoId);
    if (!bruto) return null;
    try {
        const payload = JSON.parse(bruto) as { administrador?: { nombre?: string | null } };
        return payload.administrador?.nombre?.trim() || null;
    } catch {
        return null;
    }
}

function mapearOportunidadListado(subcuenta: Subcuenta, op: any): OportunidadListado {
    const { campos } = idsGhl(subcuenta);
    return {
        id: op.id,
        name: op.name,
        pipelineStageId: op.pipelineStageId,
        etapa: claveEtapa(subcuenta, op.pipelineStageId),
        createdAt: op.createdAt,
        modeloNegocio: valorCampo(op, campos.MODELO_NEGOCIO),
        comunidadNombre: valorCampo(op, campos.COMUNIDAD),
        fechaVisita: valorFecha(op, campos.FECHA_VISITA),
        descripcionVisita: valorCampo(op, campos.DESCRIPCION),
        presupuestoValidado: casillaMarcadaEn(subcuenta, "PRESUPUESTO_VALIDADO", op.customFields),
        asignadoA: op.assignedTo ?? null,
        contacto: {
            id: op.contactId ?? op.contact?.id ?? null,
            nombre: op.contact?.name ?? null,
            email: op.contact?.email ?? null,
            telefono: op.contact?.phone ?? null,
        },
        administrador: {
            nombre: administradorDeLaVisita(op, campos.DATOS_VISITA),
        },
    };
}

export async function crearOportunidad(subcuenta: Subcuenta, datos: DatosOportunidad) {
    const descripcionCompleta = construirDescripcion(datos);
    const { pipelineId, etapas, campos } = idsGhl(subcuenta);

    const data = await saFetch(subcuenta, "/opportunities/", {
        method: "POST",
        body: JSON.stringify({
            locationId: getLocationId(subcuenta),
            pipelineId,
            pipelineStageId: etapas.AVISO_RECIBIDO,
            contactId: datos.contactId,
            name: `${datos.comunidadNombre} - ${ETIQUETA_MODELO_NEGOCIO[datos.modeloNegocio]}`,
            status: "open",
            ...(datos.asignadoA ? { assignedTo: datos.asignadoA } : {}),
            customFields: [
                { id: campos.MODELO_NEGOCIO, field_value: ETIQUETA_MODELO_NEGOCIO[datos.modeloNegocio] },
                { id: campos.DESCRIPCION, field_value: descripcionCompleta },
                { id: campos.FECHA_VISITA, field_value: datos.fecha },
            ],
        }),
    });

    const oportunidad = data.opportunity ?? data;
    await asociarComunidadConOportunidad(subcuenta, datos.comunidadId, oportunidad.id);
    return oportunidad;
}

export async function crearOportunidadDesdeVisita(subcuenta: Subcuenta, datos: DatosOportunidad) {
    const descripcionCompleta = construirDescripcion(datos);
    const { pipelineId, etapas, campos } = idsGhl(subcuenta);

    const data = await saFetch(subcuenta, "/opportunities/", {
        method: "POST",
        body: JSON.stringify({
            locationId: getLocationId(subcuenta),
            pipelineId,
            pipelineStageId: etapas.DATOS_RECOGIDOS,
            contactId: datos.contactId,
            name: `${datos.comunidadNombre} - ${ETIQUETA_MODELO_NEGOCIO[datos.modeloNegocio]}`,
            status: "open",
            ...(datos.asignadoA ? { assignedTo: datos.asignadoA } : {}),
            customFields: [
                { id: campos.MODELO_NEGOCIO, field_value: ETIQUETA_MODELO_NEGOCIO[datos.modeloNegocio] },
                { id: campos.DESCRIPCION, field_value: descripcionCompleta },
                { id: campos.FECHA_VISITA, field_value: datos.fecha },
                { id: campos.COMUNIDAD, field_value: datos.comunidadNombre },
            ],
        }),
    });

    const oportunidad = data.opportunity ?? data;
    await asociarComunidadConOportunidad(subcuenta, datos.comunidadId, oportunidad.id);
    return oportunidad;
}

export async function buscarOportunidadesAbiertas(
    subcuenta: Subcuenta,
    contactId: string,
    etapasCandidatas: readonly ClaveEtapa[]
): Promise<OportunidadAbierta[]> {
    const locationId = getLocationId(subcuenta);
    const { pipelineId, etapas, campos } = idsGhl(subcuenta);
    const idsCandidatos = etapasCandidatas.map((clave) => etapas[clave]);

    const data = await saFetch(
        subcuenta,
        `/opportunities/search?location_id=${locationId}&contact_id=${contactId}`
    );

    const oportunidades: any[] = data.opportunities ?? [];

    return oportunidades
        .filter(
            (op) =>
                op.pipelineId === pipelineId &&
                op.status === "open" &&
                idsCandidatos.includes(op.pipelineStageId)
        )
        .map((op) => ({
            id: op.id,
            name: op.name,
            pipelineStageId: op.pipelineStageId,
            etapa: claveEtapa(subcuenta, op.pipelineStageId),
            createdAt: op.createdAt,
            modeloNegocio: valorCampo(op, campos.MODELO_NEGOCIO),
        }));
}

/**
 * Tope de páginas al listar. Existe para que un fallo de paginación nunca se
 * convierta en un bucle infinito: 20 x 100 = 2.000 oportunidades por pipeline.
 */
const MAX_PAGINAS_OPORTUNIDADES = 20;

/** Máximo que admite GHL en `/opportunities/search`. Sin `limit`, devuelve 20. */
const LIMITE_PAGINA_OPORTUNIDADES = 100;

/**
 * Filtro de visibilidad del listado.
 *
 * - `{ tipo: "todas" }`: dirección. Ve todo el pipeline de la subcuenta.
 * - `{ tipo: "propias", usuarioGhl }`: comercial. Solo las oportunidades cuyo
 *   `assignedTo` es él. `usuarioGhl` null = no se sabe quién es en GHL, y
 *   entonces no ve NINGUNA: mejor vacío que enseñarle las de otro.
 */
export type FiltroPropietario =
    | { tipo: "todas" }
    | { tipo: "propias"; usuarioGhl: string | null };

/**
 * Filtro que corresponde a la sesión: dirección ve todas, el resto (comercial)
 * solo las suyas. Tipo estructural para no importar lib/sesion desde aquí.
 */
export function filtroPropietario(sesion: {
    rol: string;
    usuarioGhl: string | null;
}): FiltroPropietario {
    return sesion.rol === "direccion"
        ? { tipo: "todas" }
        : { tipo: "propias", usuarioGhl: sesion.usuarioGhl?.trim() || null };
}

/**
 * ¿Puede este usuario ver esta oportunidad? Mismo criterio para el listado y
 * para abrir la ficha por URL: ocultar una fila no es control de acceso.
 */
export function puedeVerOportunidad(
    filtro: FiltroPropietario,
    oportunidad: { asignadoA: string | null }
): boolean {
    if (filtro.tipo === "todas") return true;
    return filtro.usuarioGhl !== null && oportunidad.asignadoA === filtro.usuarioGhl;
}

/**
 * Oportunidades del pipeline en las etapas pedidas, TODAS (paginando).
 *
 * ---------------------------------------------------------------------------
 * POR QUE PAGINA (23/09/2026)
 * ---------------------------------------------------------------------------
 * Antes se hacía una sola llamada sin `limit`. GHL devuelve 20 por defecto, así
 * que a partir de la oportunidad 21 el listado se quedaba corto sin avisar, y
 * los contadores de la cabecera (Total, Ganados...) salían mal.
 *
 * ---------------------------------------------------------------------------
 * POR QUE FILTRA POR PROPIETARIO (23/09/2026)
 * ---------------------------------------------------------------------------
 * Toni tiene acceso a Scala además de a Vertical y veía las oportunidades de
 * Jose. Un comercial solo ve las suyas; dirección las ve todas.
 *
 * El filtro va dos veces a propósito: `assigned_to` en la consulta (GHL
 * devuelve menos datos) y otra vez aquí sobre `assignedTo`. Si GHL ignorase el
 * parámetro, el segundo filtro evita que se cuele nada.
 */
export async function listarOportunidades(
    subcuenta: Subcuenta,
    etapasIncluidas: readonly ClaveEtapa[],
    filtro: FiltroPropietario
): Promise<OportunidadListado[]> {
    // Comercial sin id de GHL: no hay forma de saber cuáles son suyas.
    if (filtro.tipo === "propias" && !filtro.usuarioGhl) {
        console.warn(
            `[oportunidades] Comercial sin id de GHL en ${subcuenta}: el listado sale vacío. ` +
                `Revisa las variables *_GHL_USER_ID.`
        );
        return [];
    }

    const locationId = getLocationId(subcuenta);
    const { pipelineId, etapas } = idsGhl(subcuenta);
    const idsIncluidos = etapasIncluidas.map((clave) => etapas[clave]);

    const parametrosBase = new URLSearchParams({
        location_id: locationId,
        pipeline_id: pipelineId,
        limit: String(LIMITE_PAGINA_OPORTUNIDADES),
    });
    if (filtro.tipo === "propias" && filtro.usuarioGhl) {
        parametrosBase.set("assigned_to", filtro.usuarioGhl);
    }

    // Por id: si una página se repite (paginación mal interpretada), no duplica.
    const porId = new Map<string, unknown>();
    let total: number | null = null;

    for (let page = 1; page <= MAX_PAGINAS_OPORTUNIDADES; page++) {
        const parametros = new URLSearchParams(parametrosBase);
        parametros.set("page", String(page));

        const data = await saFetch(subcuenta, `/opportunities/search?${parametros.toString()}`);
        const lote: Array<{ id?: string }> = data.opportunities ?? [];

        const antes = porId.size;
        for (const op of lote) if (op?.id) porId.set(op.id, op);

        if (typeof data.meta?.total === "number") total = data.meta.total;

        const ultimaPagina =
            lote.length < LIMITE_PAGINA_OPORTUNIDADES ||
            porId.size === antes ||
            (total !== null && porId.size >= total);
        if (ultimaPagina) break;

        if (page === MAX_PAGINAS_OPORTUNIDADES) {
            console.warn(
                `[oportunidades] Tope de ${MAX_PAGINAS_OPORTUNIDADES} páginas alcanzado en ${subcuenta}: ` +
                    `el listado puede estar incompleto.`
            );
        }
    }

    if (total !== null && porId.size < total) {
        console.warn(
            `[oportunidades] ${subcuenta}: GHL anuncia ${total} oportunidades y se han leído ${porId.size}.`
        );
    }

    return [...porId.values()]
        .map((op) => op as { pipelineId?: string; pipelineStageId?: string })
        .filter(
            (op) =>
                op.pipelineId === pipelineId &&
                op.pipelineStageId !== undefined &&
                idsIncluidos.includes(op.pipelineStageId)
        )
        .map((op) => mapearOportunidadListado(subcuenta, op))
        .filter((op) => puedeVerOportunidad(filtro, op));
}

export async function obtenerOportunidad(
    subcuenta: Subcuenta,
    oportunidadId: string
): Promise<OportunidadListado | null> {
    try {
        const data = await saFetch(subcuenta, `/opportunities/${oportunidadId}`);
        const op = data.opportunity ?? data;
        if (!op?.id) return null;
        return mapearOportunidadListado(subcuenta, op);
    } catch {
        return null;
    }
}

export async function adjuntarDatosVisita(
    subcuenta: Subcuenta,
    oportunidadId: string,
    datos: DatosVisita
) {
    const descripcionCompleta = construirDescripcion(datos);
    const { etapas, campos } = idsGhl(subcuenta);

    const data = await saFetch(subcuenta, `/opportunities/${oportunidadId}`, {
        method: "PUT",
        body: JSON.stringify({
            pipelineStageId: etapas.DATOS_RECOGIDOS,
            customFields: [
                { id: campos.MODELO_NEGOCIO, field_value: ETIQUETA_MODELO_NEGOCIO[datos.modeloNegocio] },
                { id: campos.DESCRIPCION, field_value: descripcionCompleta },
                { id: campos.FECHA_VISITA, field_value: datos.fecha },
                { id: campos.COMUNIDAD, field_value: datos.comunidadNombre },
            ],
        }),
    });

    return data.opportunity ?? data;
}
/**
 * Campo FILE_UPLOAD "Presupuesto" de la oportunidad.
 *
 * Es donde Miguel y el comercial ven el documento desde GHL. Hasta ahora la URL
 * solo vivía dentro del JSON del registro de estado, que nadie va a abrir para
 * sacar un enlace. Su ID, por subcuenta, en lib/ghl/ids.ts (`campos.PRESUPUESTO`).
 */

export type DocumentoAdjunto = {
    url: string;
    /** Nombre visible en GHL. Se usa la referencia: "SV-2026-0005.odt". */
    nombre: string;
    mimetype: string;
    /** Tamaño REAL en bytes. Ver la nota de abajo: un 0 hace fallar el PUT. */
    bytes: number;
};

/**
 * Adjunta el documento generado al campo "Presupuesto" de la oportunidad.
 *
 * ---------------------------------------------------------------------------
 * COMPORTAMIENTO DE GHL VERIFICADO POR API (10/09/2026)
 * ---------------------------------------------------------------------------
 *  - El valor de un FILE_UPLOAD es un ARRAY de objetos
 *    `{ url, meta: { mimetype, name, size }, deleted }`.
 *  - `meta.size` es OBLIGATORIO y tiene que ser el tamaño real. Con `size: 0`
 *    la API responde 400 "Invalid Custom Field Value" sin decir qué campo está
 *    mal. Fue media hora de búsqueda.
 *  - La URL NO tiene por qué estar en el bucket privado de GHL: acepta una de
 *    Media Storage sin problema.
 *  - En el PUT, `customFields` se FUSIONA, no reemplaza. Enviar solo este campo
 *    deja intactos el registro de estado y el JSON de la visita. Comprobado en
 *    la ficha después de escribir.
 *  - `locationId` se omite: la API lo exige en POST y lo rechaza en PUT.
 *
 * Se envía un único elemento a propósito: cada regeneración PISA la anterior.
 * El campo admite varios, pero un administrador que ve tres presupuestos
 * adjuntos no sabe cuál vale. El histórico de versiones vive en el registro.
 *
 * ---------------------------------------------------------------------------
 * LAS CASILLAS VIAJAN EN ESTE MISMO PUT (21/09/2026)
 * ---------------------------------------------------------------------------
 * `casillas` permite marcar `PRESUPUESTO_GENERADO` en la MISMA llamada que
 * adjunta el fichero. No es comodidad, es corrección: esa casilla dispara el
 * workflow que avisa a dirección, y escribirla en un PUT aparte abre una
 * ventana en la que el workflow ya se ha disparado y el campo "Presupuesto"
 * todavía apunta al documento ANTERIOR. Con un único PUT, o están las dos cosas
 * o no está ninguna.
 *
 * ---------------------------------------------------------------------------
 * Y TAMBIÉN EL CAMBIO DE ETAPA (23/09/2026)
 * ---------------------------------------------------------------------------
 * Generar el presupuesto hace avanzar la oportunidad a "Presupuesto en
 * revisión", pero SOLO si viene de "Visita concertada" o "Datos recogidos"
 * (`etapaActual`). Una regeneración con la oportunidad ya enviada o en
 * negociación no la hace retroceder. Va en el mismo PUT por el mismo motivo que
 * la casilla: el documento, el aviso y la etapa llegan juntos o no llega nada.
 */
export async function adjuntarPresupuesto(
    subcuenta: Subcuenta,
    oportunidadId: string,
    documento: DocumentoAdjunto,
    casillas: Partial<Record<CasillaOportunidad, boolean>> = {},
    /** Etapa en la que está la oportunidad al publicar. `null` = desconocida: no se mueve. */
    etapaActual: ClaveEtapa | null = null
) {
    if (!Number.isInteger(documento.bytes) || documento.bytes <= 0) {
        throw new Error(
            `El tamaño del documento debe ser un entero positivo (recibido: ${documento.bytes}). ` +
                `GHL rechaza el campo con un 400 genérico si meta.size no es real.`
        );
    }

    const campos: Array<Record<string, unknown>> = [
        {
            id: idsGhl(subcuenta).campos.PRESUPUESTO,
            field_value: [
                {
                    url: documento.url,
                    meta: {
                        mimetype: documento.mimetype,
                        name: documento.nombre,
                        size: documento.bytes,
                    },
                    deleted: false,
                },
            ],
        },
    ];

    // Las casillas que la subcuenta no tenga creadas devuelven null y se omiten.
    for (const [casilla, marcada] of Object.entries(casillas) as Array<
        [CasillaOportunidad, boolean]
    >) {
        const entrada = entradaCasilla(subcuenta, casilla, marcada);
        if (entrada) campos.push(entrada);
    }

    const avanzaARevision = etapaActual !== null && ETAPAS_ANTES_DE_REVISION.includes(etapaActual);

    const data = await saFetch(subcuenta, `/opportunities/${oportunidadId}`, {
        method: "PUT",
        body: JSON.stringify({
            customFields: campos,
            ...(avanzaARevision
                ? { pipelineStageId: idsGhl(subcuenta).etapas.PRESUPUESTO_EN_REVISION }
                : {}),
        }),
    });

    return data.opportunity ?? data;
}