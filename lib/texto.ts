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
/**
 * Normaliza un teléfono al formato E.164 que exige GHL.
 *
 * POR QUÉ EXISTE (18/09/2026): la propiedad `telfono` del objeto de
 * administradores es de tipo PHONE y GHL valida el formato en el POST. Un
 * "600000000" recibe un 400 con el mensaje `isn't a valid phone number for
 * Teléfono`. Detectado con `npm run ghl:probar-altas` en las dos subcuentas.
 *
 * Vive aquí y no en `lib/ghl/` por la misma razón que `normalizarNombre`: el
 * modal de alta la necesita en el navegador para avisar ANTES de enviar, y no
 * queremos arrastrar el cliente de GHL al bundle.
 *
 * Devuelve `null` si no se puede normalizar. Quien llama decide qué hacer: el
 * modal lo convierte en un mensaje al comercial, la capa de GHL en un error.
 */
export function normalizarTelefono(valor: string, prefijoPorDefecto = "+34"): string | null {
    const limpio = valor.replace(/[\s.\-()]/g, "");

    if (limpio === "") return null;

    // Ya viene internacional: +34600000000 o 0034600000000.
    const internacional = limpio.startsWith("+")
        ? limpio.slice(1)
        : limpio.startsWith("00")
          ? limpio.slice(2)
          : null;

    if (internacional !== null) {
        return /^\d{8,15}$/.test(internacional) ? `+${internacional}` : null;
    }

    // Nacional con prefijo pegado y sin signo: 34600000000.
    if (/^34[6-9]\d{8}$/.test(limpio)) return `+${limpio}`;

    /**
     * Nacional de 9 dígitos, que es como lo escriben los comerciales.
     *
     * Se exige que empiece por 6-9 (móviles 6 y 7, fijos 8 y 9). Sin esa
     * comprobación, un "213456879" se convertía en "+34213456879" y GHL lo
     * rechazaba igual con un mensaje en inglés: el comercial veía el mismo
     * error incomprensible, solo que un paso más tarde. Detectado el
     * 18/09/2026 con un alta real.
     */
    if (/^[6-9]\d{8}$/.test(limpio)) return `${prefijoPorDefecto}${limpio}`;

    return null;
}