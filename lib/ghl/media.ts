import { getSaConfig, type Subcuenta } from "./client";

const SA_BASE_URL = "https://services.leadconnectorhq.com";

export type ArchivoSubido = { url: string; fileId: string };

/**
 * Subida a la biblioteca de medios del Sistema Advantys.
 *
 * Sirve para cualquier archivo, no solo imágenes: fotos de visita y también la
 * documentación de proyecto (.bc3 / .xlsx / .pdf). El endpoint es el mismo; lo
 * único que cambia es qué se le pasa.
 *
 * `cache: "no-store"` es obligatorio: el fetch parcheado de Next.js corrompe el
 * stream binario del FormData cuando intenta cachear la petición.
 */
export async function subirArchivoSa(subcuenta: Subcuenta, archivo: File): Promise<ArchivoSubido> {
    const { apiToken, locationId } = getSaConfig(subcuenta);

    const formData = new FormData();
    formData.append("file", archivo);
    formData.append("hosted", "false");

    const response = await fetch(`${SA_BASE_URL}/medias/upload-file?locationId=${locationId}`, {
        method: "POST",
        cache: "no-store",
        headers: {
            Authorization: `Bearer ${apiToken}`,
            Version: "2021-07-28",
        },
        body: formData,
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Error al subir archivo a GHL (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    return { url: data.url, fileId: data.fileId };
}

/** Alias histórico: mantiene funcionando las llamadas existentes de fotos. */
export async function subirFotoSa(subcuenta: Subcuenta, archivo: File): Promise<ArchivoSubido> {
    return subirArchivoSa(subcuenta, archivo);
}