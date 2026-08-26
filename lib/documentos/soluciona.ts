import type { SubcuentaSlug } from "@/lib/subcuenta";
import { validarContenido, validarCifras, validarMapeoDirecto, type TrazaSeccion } from "./contrato";

/**
 * Cliente de la app de documentos (ExponentialIT Risk Reports API).
 *
 * Contrato verificado empíricamente el 26/08/2026 (TEST-001 a TEST-006):
 *
 *   POST /api/auth/token          {email,password} -> {token,tokenType,expiresIn}
 *   POST /api/Reports/generate    multipart -> 202 {requestId,status,alreadyExisted}
 *   GET  /api/Reports/{id}        -> detalle con sectionTraces
 *   GET  /api/Reports/{id}/odt    -> binario
 *
 * INSTANCIA COMPARTIDA por las dos subcuentas: mismas credenciales y mismo
 * catálogo de content types. El aislamiento del DERCAS 11.1 lo garantiza este
 * código, no la plataforma. De ahí el prefijo de subcuenta en el RequestId.
 */

const BASE_URL = process.env.SOLUCIONA_BASE_URL ?? "https://prlia.solucionait.es";

/** Estados observados. 4 y 5 existen en el enum pero no se han provocado. */
export const ESTADO = {
    EN_COLA: 1,
    PROCESANDO: 2,
    COMPLETADO: 3,
} as const;

/** Terminal y correcto. Cualquier otro estado terminal es fallo. */
export function esCompletado(estado: number): boolean {
    return estado === ESTADO.COMPLETADO;
}

export function esTerminal(detalle: DetalleInforme): boolean {
    return Boolean(detalle.completedUtc) || Boolean(detalle.failureReason);
}

export type DetalleInforme = {
    requestId: string;
    status: number;
    templateFileName: string | null;
    callbackUrl: string | null;
    callbackDelivered: boolean;
    failureReason: string | null;
    validationErrorsJson: string | null;
    resultFileName: string | null;
    createdUtc: string;
    completedUtc: string | null;
    sectionTraces: TrazaSeccion[] | null;
    auditLogs: Array<{ eventType?: string; message?: string; createdUtc?: string }> | null;
};

export type RespuestaEncolado = {
    requestId: string;
    status: number;
    alreadyExisted: boolean;
};

// --- Autenticación ------------------------------------------------------

type TokenCacheado = { valor: string; tipo: string; expiraEn: number };

/**
 * Caché en memoria del módulo. En serverless cada instancia tiene la suya, que
 * es justo lo que queremos: no hay estado compartido que invalidar.
 */
let tokenCacheado: TokenCacheado | null = null;

/** Margen de seguridad: se renueva 5 min antes de caducar. */
const MARGEN_RENOVACION_MS = 5 * 60 * 1000;

function credenciales(): { email: string; password: string } {
    const email = process.env.SOLUCIONA_EMAIL;
    const password = process.env.SOLUCIONA_PASSWORD;
    if (!email || !password) {
        throw new Error("Faltan SOLUCIONA_EMAIL y SOLUCIONA_PASSWORD en .env.local");
    }
    return { email, password };
}

async function pedirToken(): Promise<TokenCacheado> {
    const respuesta = await fetch(`${BASE_URL}/api/auth/token`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credenciales()),
    });

    if (!respuesta.ok) {
        throw new Error(`No se pudo autenticar contra la app de documentos (${respuesta.status}).`);
    }

    const datos = (await respuesta.json()) as { token: string; tokenType?: string; expiresIn: number };

    return {
        valor: datos.token,
        tipo: datos.tokenType || "Bearer",
        expiraEn: Date.now() + datos.expiresIn * 1000,
    };
}

async function obtenerToken(forzar = false): Promise<TokenCacheado> {
    if (!forzar && tokenCacheado && tokenCacheado.expiraEn - MARGEN_RENOVACION_MS > Date.now()) {
        return tokenCacheado;
    }
    tokenCacheado = await pedirToken();
    return tokenCacheado;
}

/**
 * Códigos que significan "el token ya no vale".
 *
 * El 415 está aquí a propósito y no es un despiste: con el JWT caducado, la API
 * rechaza ANTES de negociar el multipart y devuelve 415 Unsupported Media Type
 * en lugar de 401. Sin este caso, un cuerpo perfectamente válido parece mal
 * formado y se pierde media hora buscando el fallo donde no está.
 */
const CODIGOS_DE_TOKEN_MUERTO = new Set([401, 415]);

/**
 * Ejecuta una petición autenticada y la reintenta UNA vez con token nuevo si el
 * servidor responde con un código de token muerto.
 */
async function conAutenticacion(peticion: (cabeceras: HeadersInit) => Promise<Response>): Promise<Response> {
    const token = await obtenerToken();
    let respuesta = await peticion({ Authorization: `${token.tipo} ${token.valor}` });

    if (CODIGOS_DE_TOKEN_MUERTO.has(respuesta.status)) {
        const renovado = await obtenerToken(true);
        respuesta = await peticion({ Authorization: `${renovado.tipo} ${renovado.valor}` });
    }

    return respuesta;
}

// --- Identificador de petición ------------------------------------------

/**
 * RequestId estable y único.
 *
 * La app es idempotente por este campo (verificado: una segunda llamada con el
 * mismo id devuelve `alreadyExisted: true` y no regenera). Eso hace seguros los
 * reintentos por timeout y el doble clic del comercial en obra.
 *
 * Lleva la subcuenta porque la instancia es compartida: sin prefijo, la misma
 * oportunidad de Scala y de Vertical colisionaría.
 *
 * La `version` se sube cuando se quiere regenerar de verdad (por ejemplo, tras
 * corregir precios): un id nuevo obliga a la app a rehacer el documento.
 */
export function construirRequestId(
    subcuenta: SubcuentaSlug,
    oportunidadId: string,
    version: number = 1
): string {
    return `${subcuenta}-${oportunidadId}-v${version}`;
}

// --- Operaciones --------------------------------------------------------

export type PeticionGeneracion = {
    requestId: string;
    /** JSON del documento. Se serializa aquí: la app espera una cadena. */
    json: unknown;
    /** Plantilla ODT. Obligatoria en cada llamada. */
    plantilla: { nombre: string; contenido: ArrayBuffer };
    /** Opcional. Hoy no se usa: se hace polling desde el cliente. */
    callbackUrl?: string;
};

/**
 * Encola una generación. Devuelve en cuanto la app responde 202: NO espera.
 *
 * Es deliberado. Una generación real tarda ~40 s (TEST-003) y esperarla dentro
 * de la función serverless agotaría el límite de Vercel. El cliente hace polling
 * contra /api/documentos/estado.
 */
export async function generarDocumento(peticion: PeticionGeneracion): Promise<RespuestaEncolado> {
    const formulario = new FormData();
    formulario.append("RequestId", peticion.requestId);
    formulario.append("QuestionnaireJson", JSON.stringify(peticion.json));
    if (peticion.callbackUrl) formulario.append("CallbackUrl", peticion.callbackUrl);
    formulario.append(
        "Template",
        new Blob([peticion.plantilla.contenido], { type: "application/vnd.oasis.opendocument.text" }),
        peticion.plantilla.nombre
    );

    const respuesta = await conAutenticacion((cabeceras) =>
        fetch(`${BASE_URL}/api/Reports/generate`, {
            method: "POST",
            // OBLIGATORIO. El fetch parcheado de Next.js corrompe el stream
            // binario del FormData al intentar cachear la peticion. Ya nos costo
            // varios fallos silenciosos con GHL Media Storage.
            cache: "no-store",
            headers: cabeceras,
            body: formulario,
        })
    );

    if (!respuesta.ok) {
        const cuerpo = await respuesta.text();
        throw new Error(`La app de documentos rechazo la peticion (${respuesta.status}): ${cuerpo}`);
    }

    return (await respuesta.json()) as RespuestaEncolado;
}

export async function consultarEstado(requestId: string): Promise<DetalleInforme> {
    const respuesta = await conAutenticacion((cabeceras) =>
        fetch(`${BASE_URL}/api/Reports/${encodeURIComponent(requestId)}`, {
            cache: "no-store",
            headers: cabeceras,
        })
    );

    if (!respuesta.ok) {
        throw new Error(`No se pudo consultar el estado de ${requestId} (${respuesta.status}).`);
    }

    return (await respuesta.json()) as DetalleInforme;
}

export async function descargarOdt(requestId: string): Promise<ArrayBuffer> {
    const respuesta = await conAutenticacion((cabeceras) =>
        fetch(`${BASE_URL}/api/Reports/${encodeURIComponent(requestId)}/odt`, {
            cache: "no-store",
            headers: cabeceras,
        })
    );

    if (!respuesta.ok) {
        throw new Error(`No se pudo descargar el ODT de ${requestId} (${respuesta.status}).`);
    }

    return respuesta.arrayBuffer();
}

// --- Verificación del resultado -----------------------------------------

export type Veredicto =
    | { ok: true; detalle: DetalleInforme }
    | { ok: false; motivo: "en_proceso"; detalle: DetalleInforme }
    | { ok: false; motivo: "fallido" | "contenido_invalido"; errores: string[]; detalle: DetalleInforme };

/**
 * Decide si un documento se puede publicar.
 *
 * `success: true` en las trazas NO basta. La app da por buena cualquier
 * respuesta del modelo, incluida "No se han recibido datos de entrada": eso
 * ocurrió en TEST-001 y TEST-003 con las 18 secciones en verde y un documento
 * inservible. Aquí se mira el contenido y, si se pasan las cifras del cálculo,
 * también se comprueba que la IA no se haya inventado ningún importe.
 */
export function verificarResultado(
    detalle: DetalleInforme,
    cifrasPermitidas: readonly string[] = [],
    /** JSON enviado. Si se pasa, se comprueba que el mapeo directo cuadra. */
    jsonEnviado?: unknown
): Veredicto {
    if (!esTerminal(detalle)) {
        return { ok: false, motivo: "en_proceso", detalle };
    }

    if (!esCompletado(detalle.status) || detalle.failureReason) {
        const errores = [
            detalle.failureReason ?? `La app terminó en estado ${detalle.status}.`,
            detalle.validationErrorsJson ?? "",
        ].filter(Boolean);
        return { ok: false, motivo: "fallido", errores, detalle };
    }

    const trazas = detalle.sectionTraces ?? [];
    const errores = [
        ...validarContenido(trazas),
        ...(cifrasPermitidas.length > 0 ? validarCifras(trazas, cifrasPermitidas) : []),
        ...(jsonEnviado !== undefined ? validarMapeoDirecto(trazas, jsonEnviado) : []),
    ];

    if (errores.length > 0) {
        return { ok: false, motivo: "contenido_invalido", errores, detalle };
    }

    return { ok: true, detalle };
}

/** Tokens consumidos. Para control de coste por presupuesto. */
export function tokensConsumidos(detalle: DetalleInforme): number {
    return (detalle.sectionTraces ?? []).reduce((suma, t) => suma + (t.totalTokens ?? 0), 0);
}

/**
 * Espera activa hasta que la petición sea terminal.
 *
 * NO usar desde una ruta de API en Vercel: agotaría el tiempo de la función.
 * Está para scripts y pruebas de integración.
 */
export async function esperarResultado(
    requestId: string,
    opciones: { intentos?: number; esperaMs?: number } = {}
): Promise<DetalleInforme> {
    const intentos = opciones.intentos ?? 20;
    const esperaMs = opciones.esperaMs ?? 5000;

    let detalle = await consultarEstado(requestId);
    for (let i = 1; i < intentos && !esTerminal(detalle); i++) {
        await new Promise((r) => setTimeout(r, esperaMs));
        detalle = await consultarEstado(requestId);
    }

    return detalle;
}