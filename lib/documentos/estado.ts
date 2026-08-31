import { saFetch, type Subcuenta } from "@/lib/ghl/client";

const CAMPO_ESTADO_POR_SUBCUENTA: Record<string, string | undefined> = {
    "scala-valencia": process.env.SA_CAMPO_ESTADO_DOCUMENTO,
    "vertical-projects": process.env.SA_VERTICAL_CAMPO_ESTADO_DOCUMENTO,
};

/**
 * Subcuentas con la parametrización de GHL terminada.
 *
 * Tener el custom field configurado en .env.local NO significa que la
 * subcuenta esté lista: Vertical Projects tiene la variable puesta pero la
 * subcuenta está vacía (sin custom objects, sin contactos, sin oportunidades)
 * a 31/08/2026. Sin esta lista, `documentosDisponibles` devolvería true y
 * Toni podría lanzar una generación que fallaría a mitad.
 *
 * Quitar "vertical-projects" del comentario y añadirlo al Set cuando se
 * replique la subcuenta.
 */
const SUBCUENTAS_OPERATIVAS: ReadonlySet<string> = new Set(["scala-valencia"]);

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
    /** Referencia del presupuesto (SV-2026-0001). */
    numeroReferencia: string;
    /** URL en GHL Media Storage. Solo cuando está publicado. */
    urlDocumento?: string;
    /** Motivos del fallo, tal cual los devolvió la verificación. */
    errores?: string[];
    /**
     * Documento generado sin importes: hay rutas del formulario sin
     * equivalencia en la tarifa (ver mapeo-capitulos.ts).
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

/**
 * La lectura del registro falló. NO significa que no haya registro.
 *
 * Existe porque la distinción importa: "no hay documento todavía" y "no he
 * podido saber si hay documento" llevan a decisiones opuestas.
 */
export class ErrorLecturaRegistro extends Error {
    constructor(
        public readonly oportunidadId: string,
        public readonly causa: unknown
    ) {
        const detalle = causa instanceof Error ? causa.message : String(causa);
        super(`No se pudo leer el registro de la oportunidad ${oportunidadId}: ${detalle}`);
        this.name = "ErrorLecturaRegistro";
    }
}

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
    return Boolean(CAMPO_ESTADO_POR_SUBCUENTA[subcuenta]) && SUBCUENTAS_OPERATIVAS.has(subcuenta);
}

/**
 * Lee el registro de la oportunidad.
 *
 * Devuelve `null` SOLO cuando se ha podido consultar la oportunidad y no hay
 * registro: campo vacío, ausente, o con un JSON ilegible.
 *
 * Si la consulta falla (red, 401, rate limit), LANZA `ErrorLecturaRegistro`.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ ESTO NO ES UN DETALLE
 * ---------------------------------------------------------------------------
 * La versión anterior tenía un `catch { return null }` que se tragaba
 * cualquier error. Como `escribirRegistro` usa esta función para validar la
 * transición, un fallo transitorio de red hacía que `previo` fuese `null`, la
 * validación se saltara entera, y se pudiera escribir cualquier estado sobre
 * cualquier otro. Un documento podía pasar de `fallido` a `publicado` sin que
 * nadie lo viera.
 *
 * Fallar ruidosamente es preferible: una generación que da error se reintenta;
 * un estado corrupto no se detecta hasta que el comercial descarga un
 * documento que no debería existir.
 */
export async function leerRegistro(
    subcuenta: Subcuenta,
    oportunidadId: string
): Promise<RegistroDocumento | null> {
    const campo = campoConfigurado(subcuenta);

    let datos: Record<string, unknown>;
    try {
        datos = (await saFetch(subcuenta, `/opportunities/${oportunidadId}`)) as Record<string, unknown>;
    } catch (error) {
        throw new ErrorLecturaRegistro(oportunidadId, error);
    }

    const oportunidad = (datos.opportunity ?? datos) as {
        customFields?: Array<{ id: string; fieldValue?: unknown; field_value?: unknown }>;
    };

    const custom = oportunidad?.customFields ?? [];
    const encontrado = custom.find((c) => c.id === campo);
    const valor = encontrado?.fieldValue ?? encontrado?.field_value;

    // Campo ausente o vacío: no hay registro. Este sí es un null legítimo.
    if (typeof valor !== "string" || valor.trim() === "") return null;

    try {
        return JSON.parse(valor) as RegistroDocumento;
    } catch {
        // JSON corrupto. Se trata como "no hay registro" para no bloquear la
        // regeneración, pero se deja traza: un registro ilegible es un bug,
        // no un estado normal.
        console.error(
            `[estado] Registro ilegible en la oportunidad ${oportunidadId} ` +
                `(subcuenta ${subcuenta}). Se regenerará desde cero. Valor: ${valor.slice(0, 200)}`
        );
        return null;
    }
}

/**
 * Igual que `leerRegistro` pero devuelve `null` también si la lectura falla.
 *
 * Solo para pintar estado en la UI, donde un fallo de red no debe romper la
 * pantalla. NUNCA para decidir una transición: ahí se usa `leerRegistro`.
 */
export async function leerRegistroParaUI(
    subcuenta: Subcuenta,
    oportunidadId: string
): Promise<{ registro: RegistroDocumento | null; errorLectura: boolean }> {
    try {
        return { registro: await leerRegistro(subcuenta, oportunidadId), errorLectura: false };
    } catch (error) {
        if (error instanceof ErrorLecturaRegistro) {
            console.error(`[estado] ${error.message}`);
            return { registro: null, errorLectura: true };
        }
        throw error;
    }
}

/**
 * Escribe el registro, comprobando antes que la transición es legal.
 *
 * `forzar` existe solo para el arranque (crear el registro inicial) y para
 * pruebas. En el flujo normal siempre se valida, y si la lectura previa falla
 * la escritura se aborta: sin saber el estado actual no se puede afirmar que
 * la transición sea legal.
 */
export async function escribirRegistro(
    subcuenta: Subcuenta,
    oportunidadId: string,
    registro: RegistroDocumento,
    opciones: { forzar?: boolean } = {}
): Promise<RegistroDocumento> {
    const campo = campoConfigurado(subcuenta);

    if (!opciones.forzar) {
        // Si esto lanza, la escritura no ocurre. Es lo correcto: antes, un
        // fallo de red aquí saltaba la validación por completo.
        const previo = await leerRegistro(subcuenta, oportunidadId);

        if (
            previo &&
            previo.estado !== registro.estado &&
            !puedeTransicionar(previo.estado, registro.estado)
        ) {
            throw new Error(
                `Transición no permitida: ${previo.estado} -> ${registro.estado} ` +
                    `(oportunidad ${oportunidadId}).`
            );
        }
    }

    const conFecha: RegistroDocumento = { ...registro, actualizadoEn: new Date().toISOString() };

    // locationId se omite a propósito en PUT: GHL lo rechaza si viene.
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