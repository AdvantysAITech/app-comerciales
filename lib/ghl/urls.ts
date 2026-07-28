import { getLocationOrigin } from "next/dist/shared/lib/utils";
import { getLocationId, type Subcuenta } from "./client";

const SA_APP_BASE_URL = "https://app.advantys.ai/v2";

export function urlContactoSa(subcuenta: Subcuenta, contactId: string): string {
    return `${SA_APP_BASE_URL}/location/${getLocationId(subcuenta)}/contacts/detail/${contactId}`;
}

export function urlOportunidadSa(subcuenta: Subcuenta, oportunidadId: string): string {
    return `${SA_APP_BASE_URL}/location/${getLocationId(subcuenta)}/opportunities/${oportunidadId}?tab=Información+del+cliente+potencial`;
}