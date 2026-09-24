import type { SubcuentaSlug as Subcuenta } from "../subcuenta";

type SaConfig = {
    apiToken: string;
    locationId: string;
};

function getSaConfig(subcuenta: Subcuenta): SaConfig {
    if (subcuenta === "scala-valencia") {
        const apiToken = process.env.SA_SCALA_API_TOKEN;
        const locationId = process.env.SA_SCALA_LOCATION_ID;
        
        if (!apiToken || !locationId){
            throw new Error("Faltan credenciales del Sistema Advantys para Scala Valencia en .env.local");
        }

        return { apiToken, locationId };
    }

    if (subcuenta === 'vertical-projects') {
        const apiToken = process.env.SA_VERTICAL_API_TOKEN;
        const locationId = process.env.SA_VERTICAL_LOCATION_ID;

        if (!apiToken || !locationId) {
            throw new Error("Faltan credenciales del Sistema Advantys para Vertical Projects en .env.local");
        }

        return { apiToken, locationId };
    }
    throw new Error(`Subcuenta desconocida: ${subcuenta}`);
}

const SA_BASE_URL = "https://services.leadconnectorhq.com";

/**
 * Respuesta no-OK de la API. Mismo mensaje que antes; lo nuevo es `status`,
 * para poder distinguir "no existe" (400/404) de un fallo pasajero sin tener
 * que leer el texto del error.
 */
export class ErrorSistemaAdvantys extends Error {
    constructor(
        readonly status: number,
        readonly cuerpo: string
    ) {
        super(`Error en Sistema Advantys (${status}): ${cuerpo}`);
        this.name = "ErrorSistemaAdvantys";
    }
}

export async function saFetch(
    subcuenta: Subcuenta,
    endpoint: string,  
    options: RequestInit = {}
) {
    const { apiToken } = getSaConfig(subcuenta);

    const response = await fetch(`${SA_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${apiToken}`,
            Version: "2021-07-28",
            "Content-Type": "application/json",
            ...options.headers,
        },
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new ErrorSistemaAdvantys(response.status, errorBody);
    }
    return response.json();
}

export { getSaConfig };
export type { Subcuenta };
export function getLocationId(subcuenta: Subcuenta): string {
    return getSaConfig(subcuenta).locationId;
}