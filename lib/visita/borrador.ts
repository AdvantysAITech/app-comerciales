import type { SeleccionVisita } from "./seleccion";
import type { DocumentoAdjunto } from "@/lib/documentos/tipos";

/**
 * Borrador del presupuesto guardado en el propio dispositivo.
 *
 * Una visita completa son varios minutos de captura en una cubierta o un patio
 * de luces, muchas veces con mala cobertura. Sin esto, cerrar la pestaña o
 * recibir una llamada que mata el navegador significa repetir la visita entera.
 */

const VERSION_BORRADOR = 1;

export type BorradorPresupuesto = {
    version: number;
    guardadoEn: string;
    nombreComunidad: string;
    comunidadElegidaId: string | null;
    administradorId: string;
    contacto: string;
    telefono: string;
    fecha: string;
    observaciones: string;
    modulosElegidos: string[];
    seleccion: SeleccionVisita;
    fotosPorModulo: Record<string, string[]>;
    /**
     * Documentación del arquitecto en los módulos de captura por importación.
     * Se guardan URLs ya subidas, nunca el fichero: un BC3 cabría en
     * localStorage, pero un PDF de proyecto reventaría la cuota al instante.
     */
    documentosPorModulo: Record<string, DocumentoAdjunto[]>;
};

export type DatosBorrador = Omit<BorradorPresupuesto, "version" | "guardadoEn">;

/** Una clave por subcuenta: un comercial no debe ver el borrador de la otra empresa. */
export function claveBorrador(subcuenta: string): string {
    return `advantys:borrador-presupuesto:${subcuenta}`;
}

/** Hay algo que merezca la pena recuperar. */
export function tieneContenido(datos: DatosBorrador): boolean {
    return (
        datos.nombreComunidad.trim() !== "" ||
        datos.contacto.trim() !== "" ||
        datos.telefono.trim() !== "" ||
        datos.observaciones.trim() !== "" ||
        datos.modulosElegidos.length > 0 ||
        Object.keys(datos.seleccion).length > 0 ||
        // En el módulo Proyectos no hay partidas ni módulos con árbol: el único
        // contenido puede ser el BC3 que acaba de subir. Sin esta comprobación
        // ese borrador se consideraría vacío y no se autoguardaría.
        Object.values(datos.documentosPorModulo).some((docs) => docs.length > 0)
    );
}

/**
 * Guarda el borrador. Nunca lanza: un fallo de almacenamiento (modo privado de
 * Safari, cuota llena) no puede tumbar la captura que el comercial está
 * haciendo. Como mucho se pierde la red de seguridad, no el trabajo en curso.
 */
export function guardarBorrador(subcuenta: string, datos: DatosBorrador): void {
    if (typeof window === "undefined") return;

    try {
        const borrador: BorradorPresupuesto = {
            ...datos,
            version: VERSION_BORRADOR,
            guardadoEn: new Date().toISOString(),
        };
        window.localStorage.setItem(claveBorrador(subcuenta), JSON.stringify(borrador));
    } catch {
        // Silencioso a propósito. Ver comentario de arriba.
    }
}

/**
 * Recupera el borrador si existe y es de esta versión.
 *
 * Un borrador de una versión anterior se descarta: preferimos perder un
 * borrador a rehidratar el formulario con una forma que ya no encaja.
 *
 * VERSION_BORRADOR sigue en 1 pese a haber añadido `documentosPorModulo`. El
 * cambio es aditivo y la rehidratación ya rellena el campo que falte, así que
 * subirla solo serviría para tirar los borradores que algún comercial tenga a
 * medias ahora mismo.
 *
 * Las rutas de partidas que ya no existan en el catálogo no dan problema: el
 * resolutor recorre el catálogo y busca en la selección, así que una ruta
 * huérfana simplemente no se pinta ni viaja al presupuesto.
 */
export function cargarBorrador(subcuenta: string): BorradorPresupuesto | null {
    if (typeof window === "undefined") return null;

    try {
        const crudo = window.localStorage.getItem(claveBorrador(subcuenta));
        if (!crudo) return null;

        const datos = JSON.parse(crudo) as Partial<BorradorPresupuesto>;
        if (datos.version !== VERSION_BORRADOR) {
            window.localStorage.removeItem(claveBorrador(subcuenta));
            return null;
        }

        return {
            version: VERSION_BORRADOR,
            guardadoEn: datos.guardadoEn ?? new Date().toISOString(),
            nombreComunidad: datos.nombreComunidad ?? "",
            comunidadElegidaId: datos.comunidadElegidaId ?? null,
            administradorId: datos.administradorId ?? "",
            contacto: datos.contacto ?? "",
            telefono: datos.telefono ?? "",
            fecha: datos.fecha ?? "",
            observaciones: datos.observaciones ?? "",
            modulosElegidos: datos.modulosElegidos ?? [],
            seleccion: datos.seleccion ?? {},
            fotosPorModulo: datos.fotosPorModulo ?? {},
            documentosPorModulo: datos.documentosPorModulo ?? {},
        };
    } catch {
        return null;
    }
}

export function limpiarBorrador(subcuenta: string): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(claveBorrador(subcuenta));
    } catch {
        // Sin consecuencias.
    }
}

/** "hace 3 min", para que el aviso de recuperación diga algo útil. */
export function describirAntiguedad(guardadoEn: string): string {
    const minutos = Math.floor((Date.now() - new Date(guardadoEn).getTime()) / 60000);
    if (minutos < 1) return "hace unos segundos";
    if (minutos < 60) return `hace ${minutos} min`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `hace ${horas} h`;
    return `hace ${Math.floor(horas / 24)} d`;
}