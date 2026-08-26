import { saFetch, type Subcuenta } from "@/lib/ghl/client";

const CAMPO_ESTADO_POR_SUBCUENTA: Record<string, string | undefined> = {
    "scala-valencia": process.env.SA_CAMPO_ESTADO_DOCUMENTO,
    "vertical-projects": process.env.SA_VERTICAL_CAMPO_ESTADO_DOCUMENTO,
};

export type EstadoDocumento =
    /** Se ha pedido pero aún no hay respuesta de la app. */
    | "solicitado"
    /** La app lo tiene en cola o procesando. */
    | "generando"
    /** Terminado en la app, pendiente de verificar contenido. */
    | "recibido"
    /** Verificado: contenido correcto y cifras cuadradas. */
    | "validado"
    /** Subido a GHL y disponible para el comercial. */
    | "publicado"
    /** Fallo en la app o contenido inservible. No se publica. */
    | "fallido";

/** Transiciones permitidas. Fuera de aquí, se rechaza. */
const TRANSICIONES: Record<EstadoDocumento, readonly EstadoDocumento[]> = {
    solicitado: ["generando", "recibido", "fallido"],
    generando: ["recibido", "fallido"],
    recibido: ["validado", "fallido"],
    validado: ["publicado", "fallido"],
    // Terminales. Para rehacer un documento se genera con otra version de
    // RequestId, que arranca un registro nuevo: no se reabre el anterior.
    publicado: [],
    fallido: [],
};

export function puedeTransicionar(desde: EstadoDocumento, hasta: EstadoDocumento): boolean {
    return TRANSICIONES[desde].includes(hasta);
}

export type RegistroDocumento = {
    requestId: string;
    estado: EstadoDocumento;
    /** Referencia del presupuesto (ESC-2026-0001). */
    numeroReferencia: string;
    /** URL en GHL Media Storage. Solo cuando está publicado. */
    urlDocumento?: string;
    /** Motivos del fallo, tal cual los devolvió la verificación. */
    errores?: string[];
    /**
     * Documento generado SIN precios reales (catálogo de Miguel pendiente).
     *
     * Se queda en `recibido` y nunca avanza a `validado`: no es descargable por
     * el comercial por construcción, no por una comprobación que alguien pueda
     * saltarse. Sirve para validar la integración, no para presupuestar.
     */
    borrador?: boolean;
    /** Tokens consumidos. Control de coste por presupuesto. */
    tokens?: number;
    /**
     * Versión del prompt template de cada sección, según `sectionTraces`.
     *
     * La configuración de la app es estado mutable sin versionado por nuestra
     * parte: si alguien edita un prompt, los presupuestos cambian y no queda
     * traza. Guardarla aquí permite explicar por qué uno de marzo no se parece
     * a uno de junio.
     */
    versionesPrompt?: Record<string, number>;
    actualizadoEn: string;
};

function campoConfigurado(subcuenta: Subcuenta): string {
    const campo = CAMPO_ESTADO_POR_SUBCUENTA[subcuenta];
    if (!campo) {
        throw new Error(
            `No hay custom field "Estado documento" configurado para la subcuenta "${subcuenta}". ` +
                `Créalo en GHL (tipo TEXT, model=opportunity) y pega su id en .env.local. ` +
                `La generación de documentos no está disponible en esta subcuenta.`
        );
    }
    return campo;
}

/** Si la subcuenta puede generar documentos hoy. Para la UI. */
export function documentosDisponibles(subcuenta: Subcuenta): boolean {
    return Boolean(CAMPO_ESTADO_POR_SUBCUENTA[subcuenta]);
}

/** Lee el registro. Devuelve null si nunca se pidió documento. */
export async function leerRegistro(
    subcuenta: Subcuenta,
    oportunidadId: string
): Promise<RegistroDocumento | null> {
    const campo = campoConfigurado(subcuenta);

    try {
        const datos = await saFetch(subcuenta, `/opportunities/${oportunidadId}`);
        const oportunidad = datos.opportunity ?? datos;
        const custom: Array<{ id: string; fieldValue?: unknown; field_value?: unknown }> =
            oportunidad?.customFields ?? [];

        const encontrado = custom.find((c) => c.id === campo);
        const valor = encontrado?.fieldValue ?? encontrado?.field_value;
        if (typeof valor !== "string" || valor.trim() === "") return null;

        return JSON.parse(valor) as RegistroDocumento;
    } catch {
        // Un JSON corrupto o una oportunidad inaccesible no deben tumbar el
        // flujo: se trata como "no hay registro" y se vuelve a generar.
        return null;
    }
}

/**
 * Escribe el registro, comprobando antes que la transición es legal.
 *
 * `forzar` existe solo para el arranque (crear el registro inicial) y para
 * pruebas. En el flujo normal siempre se valida.
 */
export async function escribirRegistro(
    subcuenta: Subcuenta,
    oportunidadId: string,
    registro: RegistroDocumento,
    opciones: { forzar?: boolean } = {}
): Promise<RegistroDocumento> {
    const campo = campoConfigurado(subcuenta);

    if (!opciones.forzar) {
        const previo = await leerRegistro(subcuenta, oportunidadId);
        if (previo && previo.estado !== registro.estado && !puedeTransicionar(previo.estado, registro.estado)) {
            throw new Error(
                `Transición no permitida: ${previo.estado} -> ${registro.estado} ` +
                    `(oportunidad ${oportunidadId}).`
            );
        }
    }

    const conFecha: RegistroDocumento = { ...registro, actualizadoEn: new Date().toISOString() };

    await saFetch(subcuenta, `/opportunities/${oportunidadId}`, {
        method: "PUT",
        body: JSON.stringify({
            customFields: [{ id: campo, field_value: JSON.stringify(conFecha) }],
        }),
    });

    return conFecha;
}

/** Atajo para pasar de estado conservando el resto del registro. */
export async function avanzar(
    subcuenta: Subcuenta,
    oportunidadId: string,
    registro: RegistroDocumento,
    estado: EstadoDocumento,
    cambios: Partial<RegistroDocumento> = {}
): Promise<RegistroDocumento> {
    return escribirRegistro(subcuenta, oportunidadId, { ...registro, ...cambios, estado });
}

/** Versiones de prompt template por markerkey, desde las trazas de la app. */
export function extraerVersionesPrompt(
    trazas: ReadonlyArray<{ markerKey?: string | null; promptTemplateVersion?: number | null }>
): Record<string, number> {
    const versiones: Record<string, number> = {};
    for (const traza of trazas) {
        if (traza.markerKey && typeof traza.promptTemplateVersion === "number") {
            versiones[traza.markerKey] = traza.promptTemplateVersion;
        }
    }
    return versiones;
}