/**
 * lib/imagen/exif.ts
 *
 * Lectura mínima de la orientación EXIF de un JPEG, sin dependencias.
 *
 * Por qué hace falta (23/09/2026): LibreOffice IGNORA la orientación EXIF al
 * pintar una imagen incrustada en un ODT (verificado con LibreOffice 24.2: una
 * foto con Orientation=6 sale tumbada en el PDF). Las fotos que se recomprimen
 * al subirlas ya llegan con la rotación aplicada a los píxeles, pero el atajo
 * de `normalizarFoto` que sube tal cual los JPEG pequeños conservaba la
 * etiqueta. Con esto, ese atajo solo se toma si la foto ya está derecha.
 */

/** 1 = normal. 2-8 = volteada o girada. `null` = sin EXIF o no es JPEG. */
export function orientacionExif(datos: Uint8Array): number | null {
    if (datos.length < 4 || datos[0] !== 0xff || datos[1] !== 0xd8) return null;

    let i = 2;
    while (i + 4 < datos.length) {
        if (datos[i] !== 0xff) return null;
        const marcador = datos[i + 1];
        const longitud = (datos[i + 2] << 8) | datos[i + 3];
        if (longitud < 2) return null;

        // APP1 con cabecera "Exif\0\0".
        if (
            marcador === 0xe1 &&
            datos[i + 4] === 0x45 &&
            datos[i + 5] === 0x78 &&
            datos[i + 6] === 0x69 &&
            datos[i + 7] === 0x66
        ) {
            const tiff = i + 10;
            if (tiff + 8 > datos.length) return null;
            const le = datos[tiff] === 0x49; // "II" little endian, "MM" big endian
            const u16 = (p: number) => (le ? datos[p] | (datos[p + 1] << 8) : (datos[p] << 8) | datos[p + 1]);
            const u32 = (p: number) =>
                le
                    ? (datos[p] | (datos[p + 1] << 8) | (datos[p + 2] << 16) | (datos[p + 3] << 24)) >>> 0
                    : ((datos[p] << 24) | (datos[p + 1] << 16) | (datos[p + 2] << 8) | datos[p + 3]) >>> 0;

            const ifd = tiff + u32(tiff + 4);
            if (ifd + 2 > datos.length) return null;
            const entradas = u16(ifd);
            for (let e = 0; e < entradas; e++) {
                const p = ifd + 2 + e * 12;
                if (p + 12 > datos.length) return null;
                if (u16(p) === 0x0112) return u16(p + 8);
            }
            return null;
        }

        // Inicio de la imagen: ya no habrá EXIF.
        if (marcador === 0xda) return null;
        i += 2 + longitud;
    }
    return null;
}
