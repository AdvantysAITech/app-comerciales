import { getSaConfig, type Subcuenta } from "./client";

const SA_BASE_URL = "https://services.leadconnectorhq.com";

export async function subirFotoSa(subcuenta: Subcuenta, archivo: File): Promise<{ url: string; fileId: string }> {
    const { apiToken, locationId } = getSaConfig(subcuenta);

    const formData = new FormData();
    formData.append("file", archivo);
    formData.append("hosted", "false");

    const response = await fetch(`${SA_BASE_URL}/media/upload-file?locationId=${locationId}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiToken}`,
            Version: "2021-07-28",
        },
        body: formData,
    });

    if (!response.ok){
        const errorBody = await response.text();
        throw new Error(`Error al subir foto a GHL (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    return { url: data.url, fileId: data.fileId };
}