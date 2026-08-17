/**
 * Utilidades de texto sin dependencias.
 *
 * Vive fuera de `lib/ghl/` a propósito: el formulario la necesita en el
 * navegador, y no queremos arrastrar el cliente de GHL (ni sus variables de
 * entorno) al bundle del cliente solo para comparar dos cadenas.
 */

/**
 * Normaliza un nombre para compararlo: sin acentos, en minúsculas y sin
 * espacios de más.
 *
 * Cliente y servidor DEBEN usar esta misma función. Si divergen, el formulario
 * anunciaría "se creará una comunidad nueva" y el servidor encontraría una
 * existente (o al revés), que es exactamente el tipo de incoherencia que el
 * comercial no puede diagnosticar desde una obra.
 */
export function normalizarNombre(valor: string): string {
    return valor
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}