import { ETIQUETA_UNIDAD, getModulo, type ModeloNegocioDercas } from "@/lib/catalogo";
import { VERSION_CATALOGO } from "@/lib/catalogo";
import {
    alertasActivas,
    partidasDeModulo,
    type PartidaResuelta,
    type SeleccionVisita,
    type Subcuenta,
} from "./seleccion";

/**
 * Payload CANONICO de una visita.
 *
 * Es la representacion completa y anidada de lo que capturo el comercial. Se
 * guarda tal cual en la oportunidad de GHL y es la unica version que se
 * conserva: da trazabilidad y permite reinterpretar visitas antiguas cuando el
 * catalogo crezca.
 *
 * La app externa de documentos NO consume esto directamente: consume la version
 * plana que se deriva de aqui en `lib/documentos/plano.ts`. Aplanar es una
 * proyeccion de salida, no un formato de almacenamiento. Si guardaramos solo lo
 * plano perderiamos la estructura y no habria vuelta atras.
 *
 * Va versionado (`version` + `versionCatalogo`) para saber contra que estructura
 * se capturo cada visita. Cambiar la forma sin subir la version romperia el
 * historico en silencio.
 */

export const VERSION_PAYLOAD = 2;

export type PartidaPayload = {
    ruta: string;
    camino: string[];
    label: string;
    unidad?: string;
    cantidad?: number;
    nota?: string;
};

export type ModuloPayload = {
    key: string;
    label: string;
    modeloNegocioDercas: ModeloNegocioDercas | null;
    partidas: PartidaPayload[];
    fotos: string[];
    alertas: string[];
};

export type PayloadVisita = {
    version: number;
    versionCatalogo: number;
    capturadoEn: string;
    subcuenta: string;
    /** Nombre comercial de la empresa. Necesario para el branding del DERCAS 5.1. */
    empresa: string;
    /** Comercial que hace la visita. Firma los documentos (DERCAS 5.1). */
    comercial: string;
    comunidad: {
        id: string | null;
        nombre: string;
        creada: boolean;
    };
    administrador: {
        id: string | null;
        nombre: string | null;
    };
    contacto: {
        nombre: string;
        telefono: string;
    };
    fechaVisita: string;
    observaciones: string;
    modulos: ModuloPayload[];
};

export type DatosCaptura = {
    subcuenta: Subcuenta;
    empresa: string;
    comercial: string;
    comunidadId: string | null;
    comunidadNombre: string;
    comunidadCreada: boolean;
    administradorId: string | null;
    administradorNombre: string | null;
    contacto: string;
    telefono: string;
    fechaVisita: string;
    observaciones: string;
    modulosElegidos: string[];
    seleccion: SeleccionVisita;
    fotosPorModulo: Record<string, string[]>;
};

function aPartidaPayload(partida: PartidaResuelta): PartidaPayload {
    return {
        ruta: partida.ruta,
        camino: partida.caminoLabels,
        label: partida.label,
        unidad: partida.unidad ? ETIQUETA_UNIDAD[partida.unidad] : undefined,
        cantidad: partida.cantidad,
        nota: partida.nota,
    };
}

export function construirPayload(datos: DatosCaptura): PayloadVisita {
    const modulos: ModuloPayload[] = datos.modulosElegidos
        .map((key) => {
            const modulo = getModulo(datos.subcuenta, key);
            if (!modulo) return null;

            return {
                key: modulo.key,
                label: modulo.label,
                modeloNegocioDercas: modulo.modeloNegocioDercas,
                partidas: partidasDeModulo(datos.subcuenta, key, datos.seleccion).map(aPartidaPayload),
                fotos: datos.fotosPorModulo[key] ?? [],
                alertas: alertasActivas(datos.subcuenta, [key], datos.seleccion)
                    .map((a) => a.alerta)
                    .filter((a): a is string => Boolean(a)),
            };
        })
        .filter((m): m is ModuloPayload => m !== null);

    return {
        version: VERSION_PAYLOAD,
        versionCatalogo: VERSION_CATALOGO,
        capturadoEn: new Date().toISOString(),
        subcuenta: datos.subcuenta,
        empresa: datos.empresa,
        comercial: datos.comercial,
        comunidad: {
            id: datos.comunidadId,
            nombre: datos.comunidadNombre.trim(),
            creada: datos.comunidadCreada,
        },
        administrador: {
            id: datos.administradorId,
            nombre: datos.administradorNombre?.trim() || null,
        },
        contacto: {
            nombre: datos.contacto.trim(),
            telefono: datos.telefono.trim(),
        },
        fechaVisita: datos.fechaVisita,
        observaciones: datos.observaciones.trim(),
        modulos,
    };
}

/**
 * Numero en formato espanol: coma decimal, y sin decimales si es entero.
 * Vive aqui porque lo usan las dos salidas (resumen legible y JSON plano) y las
 * dos tienen que decir exactamente lo mismo.
 */
export function formatearCantidad(cantidad: number): string {
    return Number.isInteger(cantidad) ? String(cantidad) : String(cantidad).replace(".", ",");
}

/**
 * Version legible del payload, para el campo de descripcion de la oportunidad.
 *
 * El JSON lo consume la app de documentos; esto lo lee Miguel al validar el
 * presupuesto y el comercial al repasar la visita. Son dos publicos distintos y
 * por eso van en campos distintos: nadie deberia tener que leer JSON para
 * revisar una obra.
 */
export function resumenLegible(payload: PayloadVisita): string {
    const lineas: string[] = [];

    lineas.push(`Comunidad: ${payload.comunidad.nombre}`);
    if (payload.administrador.nombre) lineas.push(`Administrador: ${payload.administrador.nombre}`);
    lineas.push(`Contacto: ${payload.contacto.nombre} - ${payload.contacto.telefono}`);
    lineas.push(`Fecha de visita: ${payload.fechaVisita}`);
    lineas.push("");

    for (const modulo of payload.modulos) {
        lineas.push(`## ${modulo.label.toUpperCase()}`);

        if (modulo.partidas.length === 0) {
            lineas.push("(sin partidas)");
        } else {
            for (const partida of modulo.partidas) {
                const medicion =
                    partida.cantidad !== undefined
                        ? ` - ${formatearCantidad(partida.cantidad)} ${partida.unidad ?? ""}`.trimEnd()
                        : " - sin medir";
                const nota = partida.nota ? ` (${partida.nota})` : "";
                lineas.push(`- ${partida.camino.join(" > ")}${medicion}${nota}`);
            }
        }

        if (modulo.alertas.length > 0) {
            for (const alerta of modulo.alertas) lineas.push(`! ${alerta}`);
        }

        lineas.push(modulo.fotos.length > 0 ? `Fotos (${modulo.fotos.length}):` : "Fotos: (ninguna)");
        modulo.fotos.forEach((url, i) => lineas.push(`  ${i + 1}. ${url}`));
        lineas.push("");
    }

    lineas.push("Observaciones del comercial:");
    lineas.push(payload.observaciones || "(sin observaciones)");

    return lineas.join("\n");
}

/**
 * Como se reparten los modulos en oportunidades de GHL.
 *
 * - "una": un presupuesto = una oportunidad, con todos los modulos dentro.
 * - "por_modulo": una oportunidad por modulo (literal del DERCAS 4.1).
 * - "por_modelo_negocio": agrupadas por el modelo de negocio del DERCAS.
 *
 * PENDIENTE DE VALIDACION POR MIGUEL. Por defecto "una", porque la cadena de
 * seguimiento del 5.2 se dispara por oportunidad: con "por_modulo", una visita
 * a una fachada mandaria cuatro WhatsApps al mismo administrador a los 14 dias.
 */
export type ModoAgrupacion = "una" | "por_modulo" | "por_modelo_negocio";

export const MODO_AGRUPACION: ModoAgrupacion = "una";

export type GrupoOportunidad = {
    /** Sufijo para el nombre de la oportunidad. */
    etiqueta: string;
    modulos: ModuloPayload[];
};

/** Reparte los modulos del payload en los grupos que seran oportunidades. */
export function agruparEnOportunidades(
    payload: PayloadVisita,
    modo: ModoAgrupacion = MODO_AGRUPACION
): GrupoOportunidad[] {
    const conPartidas = payload.modulos.filter((m) => m.partidas.length > 0);
    if (conPartidas.length === 0) return [];

    if (modo === "por_modulo") {
        return conPartidas.map((m) => ({ etiqueta: m.label, modulos: [m] }));
    }

    if (modo === "por_modelo_negocio") {
        const porModelo = new Map<string, ModuloPayload[]>();
        for (const modulo of conPartidas) {
            const clave = modulo.modeloNegocioDercas ?? "sin_modelo";
            porModelo.set(clave, [...(porModelo.get(clave) ?? []), modulo]);
        }
        return [...porModelo.values()].map((modulos) => ({
            etiqueta: modulos.map((m) => m.label).join(" + "),
            modulos,
        }));
    }

    return [
        {
            etiqueta: conPartidas.map((m) => m.label).join(" + "),
            modulos: conPartidas,
        },
    ];
}

/** Nombre de la oportunidad en GHL. Se recorta para que el pipeline sea legible. */
export function nombreOportunidad(comunidad: string, etiqueta: string, maximo = 90): string {
    const completo = `${comunidad} - ${etiqueta}`;
    return completo.length <= maximo ? completo : `${completo.slice(0, maximo - 1).trimEnd()}...`;
}

/** Total de partidas del payload. Para logs y validaciones. */
export function totalPartidas(payload: PayloadVisita): number {
    return payload.modulos.reduce((suma, m) => suma + m.partidas.length, 0);
}

/**
 * Modelo de negocio comun a un grupo de modulos, o null si no lo comparten.
 *
 * El campo "Modelo de negocio" de GHL es SINGLE_OPTIONS: una oportunidad con
 * fachada + bajantes pertenece a dos modelos y no hay valor correcto que
 * escribir. Se prefiere dejarlo vacio y avisar al comercial antes que inventar
 * un valor que contamine el reporting de direccion en silencio.
 */
export function modeloNegocioComun(modulos: ModuloPayload[]): ModeloNegocioDercas | null {
    const modelos = new Set(
        modulos.map((m) => m.modeloNegocioDercas).filter((m): m is ModeloNegocioDercas => m !== null)
    );
    return modelos.size === 1 ? [...modelos][0] : null;
}