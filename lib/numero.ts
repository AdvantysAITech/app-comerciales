/**
 * lib/numero.ts
 *
 * Lectura de importes y mediciones tecleados a mano. Sin dependencias: lo usa
 * la pantalla de revisión en el navegador.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ EXISTE (24/09/2026)
 * ---------------------------------------------------------------------------
 * La versión anterior (`aNumero` en RevisionPresupuesto.tsx) quitaba TODOS los
 * puntos dando por hecho que eran separador de miles. Pero el teclado numérico
 * de un ordenador y cualquier móvil en inglés escriben el decimal con punto:
 * "14.5" se guardaba como 145 y el andamio pasaba de 662 € a 7.902 € sin
 * ningún aviso. Además, lo que no entendía lo convertía en 0 en silencio.
 *
 * ---------------------------------------------------------------------------
 * REGLAS
 * ---------------------------------------------------------------------------
 *  - Con coma: la coma es el decimal y los puntos, miles.  "1.250,50" -> 1250.5
 *  - Sin coma y UN punto: el punto es el decimal.          "14.5"     -> 14.5
 *  - Sin coma y VARIOS puntos en grupos de 3: miles.        "1.250.000" -> 1250000
 *  - Cualquier otra cosa: ilegible -> `null`, nunca 0.
 *
 * El único caso ambiguo es "1.250" (¿1,25 o 1250?). Se lee como 1,25 porque es
 * lo que produce un teclado numérico. Para que un mil doscientos cincuenta mal
 * leído no pase desapercibido, la pantalla avisa cuando el precio se aleja de
 * la tarifa (ver `desviacion`).
 */

/** Número leído, o `null` si el texto no es un número válido. Vacío = `null`. */
export function leerDecimal(valor: string): number | null {
    const limpio = valor.replace(/[\s €]/g, "");
    if (limpio === "") return null;

    let normalizado: string;

    if (limpio.includes(",")) {
        // Formato español: puntos de miles opcionales, coma decimal.
        if (!/^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(limpio)) return null;
        normalizado = limpio.replace(/\./g, "").replace(",", ".");
    } else if ((limpio.match(/\./g) ?? []).length > 1) {
        // Varios puntos: solo valen como miles bien agrupados.
        if (!/^-?\d{1,3}(\.\d{3})+$/.test(limpio)) return null;
        normalizado = limpio.replace(/\./g, "");
    } else {
        // Un punto o ninguno: decimal con punto o entero.
        if (!/^-?(\d+(\.\d+)?|\.\d+)$/.test(limpio)) return null;
        normalizado = limpio;
    }

    const n = Number(normalizado);
    return Number.isFinite(n) ? n : null;
}

/** Como `leerDecimal`, pero para cálculos en vivo: lo ilegible cuenta como 0. */
export function decimalOCero(valor: string): number {
    return leerDecimal(valor) ?? 0;
}

/**
 * Cuántas veces se aleja `valor` de `referencia` (siempre >= 1), o `null` si no
 * hay con qué comparar. 2 = el doble o la mitad; 12 = doce veces más o menos.
 */
export function desviacion(valor: number, referencia: number): number | null {
    if (!(referencia > 0) || !(valor > 0)) return null;
    return valor >= referencia ? valor / referencia : referencia / valor;
}

/** Precio que se aleja más de un 50 % de la tarifa. */
export const UMBRAL_DESVIACION_PRECIO = 1.5;

/** Medición que multiplica o divide por 5 la tomada en obra. */
export const UMBRAL_DESVIACION_MEDICION = 5;