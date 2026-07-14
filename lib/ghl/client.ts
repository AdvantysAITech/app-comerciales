type Subcuenta = "scala-valencia" | "vertical-projects";

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
            throw new Error("Faltan credenciales del Sistema Advantys para Vertcial Projects en .env.local");
        }

        return { apiToken, locationId };
    }
    throw new Error(`Subcuenta desconocida: ${subcuenta}`);
}

const SA_BASE_URL = "https://services.leadconnectorhq.com";

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
        throw new Error(`Error en Sistema Advantys (${response.status}): ${errorBody}`);
    }
    return response.json();
}

export { getSaConfig };
export type { Subcuenta };
export function getLocationId(subcuenta: Subcuenta): string {
    return getSaConfig(subcuenta).locationId;
}