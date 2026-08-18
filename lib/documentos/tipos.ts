/**
 * Documentación de proyecto (módulo "Proyectos" del catálogo).
 *
 * Entra en juego cuando la comunidad ha contratado a un arquitecto y la obra
 * sale a licitación: el técnico entrega mediciones y presupuesto ya definidos y
 * Escala solo pone precios. Es un flujo distinto al de la visita normal, así que
 * estos ficheros NO alimentan el árbol de partidas: se adjuntan y se enlazan.
 *
 * El parseo del BC3 (FIEBDC-3) y el motor de oferta quedan para Fase 2.
 *
 * Este módulo se importa desde cliente y desde servidor: sin dependencias de
 * Node ni de DOM, para que la validación sea exactamente la misma en los dos
 * lados y no haya un fichero que pase en el navegador y reviente en la API.
 */

export type ExtensionDocumento = "bc3" | "xlsx" | "pdf";

export const EXTENSIONES_ADMITIDAS: ExtensionDocumento[] = ["bc3", "xlsx", "pdf"];

/**
 * Límite de subida. Vercel corta el cuerpo de las funciones serverless en torno
 * a 4,5 MB, así que el tope real no lo pone GHL sino la plataforma. Un PDF de
 * proyecto con planos lo supera de largo: para ese caso está el enlace externo.
 */
export const TAMANO_MAXIMO_BYTES = 4 * 1024 * 1024;

/** Lo que consume el atributo `accept` del input de ficheros. */
export const ACEPTA_INPUT = ".bc3,.xlsx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type DocumentoAdjunto = {
    /** Nombre de cara al comercial. Para los enlaces lo escribe él. */
    nombre: string;
    url: string;
    extension: ExtensionDocumento | "enlace";
    /** Solo en ficheros subidos. */
    bytes?: number;
    origen: "subido" | "enlace";
};

/**
 * La extensión manda, no el MIME.
 *
 * Los navegadores devuelven `type: ""` para un .bc3 porque no es un tipo
 * registrado, así que validar por MIME dejaría fuera justo el formato que más
 * información estructurada trae.
 */
export function extensionDe(nombreArchivo: string): string {
    const partes = nombreArchivo.toLowerCase().split(".");
    return partes.length > 1 ? partes[partes.length - 1] : "";
}

export function esExtensionAdmitida(nombreArchivo: string): boolean {
    return (EXTENSIONES_ADMITIDAS as string[]).includes(extensionDe(nombreArchivo));
}

/** Devuelve el motivo del rechazo, o `null` si el fichero vale. */
export function motivoRechazo(nombre: string, bytes: number): string | null {
    if (!esExtensionAdmitida(nombre)) {
        return `"${nombre}": solo se admiten ficheros .bc3, .xlsx y .pdf`;
    }
    if (bytes === 0) {
        return `"${nombre}" está vacío`;
    }
    if (bytes > TAMANO_MAXIMO_BYTES) {
        return (
            `"${nombre}" pesa ${formatearBytes(bytes)} y el máximo por fichero son ` +
            `${formatearBytes(TAMANO_MAXIMO_BYTES)}. Súbelo a Drive y pega el enlace.`
        );
    }
    return null;
}

export function formatearBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Acepta solo http/https. Evita `javascript:` y rutas locales pegadas por error. */
export function normalizarEnlace(valor: string): string | null {
    const texto = valor.trim();
    if (!texto) return null;
    try {
        const url = new URL(texto);
        return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
    } catch {
        return null;
    }
}