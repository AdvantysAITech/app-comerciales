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
 * Construye el payload que se guarda en la oportunidad de GHL.
 *
 * Este objeto es el CONTRATO con el motor de IA de Fase 2. Va versionado
 * (`version` + `versionCatalogo`) para que, cuando el árbol crezca, se pueda
 * saber contra qué estructura se capturó cada visita. Cambiar la forma sin
 * subir la versión rompería el histórico en silencio.
 */

export const VERSION_PAYLOAD = 1;

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
    comunidad: {
        id: string | null;
        nombre: string;
        creada: boolean;
    };
    administradorId: string | null;
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
    comunidadId: string | null;
    comunidadNombre: string;
    comunidadCreada: boolean;
    administradorId: string | null;
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
        comunidad: {
            id: datos.comunidadId,
            nombre: datos.comunidadNombre.trim(),
            creada: datos.comunidadCreada,
        },
        administradorId: datos.administradorId,
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
 * Versión legible del payload, para el campo de descripción de la oportunidad.
 *
 * El JSON lo consume la IA; esto lo lee Miguel al validar el presupuesto y el
 * comercial al repasar la visita. Son dos públicos distintos y por eso van en
 * campos distintos: nadie debería tener que leer JSON para revisar una obra.
 */
export function resumenLegible(payload: PayloadVisita): string {
    const lineas: string[] = [];

    lineas.push(`Comunidad: ${payload.comunidad.nombre}`);
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
                        ? ` — ${partida.cantidad} ${partida.unidad ?? ""}`.trimEnd()
                        : " — sin medir";
                const nota = partida.nota ? ` (${partida.nota})` : "";
                lineas.push(`- ${partida.camino.join(" > ")}${medicion}${nota}`);
            }
        }

        if (modulo.alertas.length > 0) {
            for (const alerta of modulo.alertas) lineas.push(`! ${alerta}`);
        }

        lineas.push(
            modulo.fotos.length > 0 ? `Fotos (${modulo.fotos.length}):` : "Fotos: (ninguna)"
        );
        modulo.fotos.forEach((url, i) => lineas.push(`  ${i + 1}. ${url}`));
        lineas.push("");
    }

    lineas.push("Observaciones del comercial:");
    lineas.push(payload.observaciones || "(sin observaciones)");

    return lineas.join("\n");
}

/**
 * Cómo se reparten los módulos en oportunidades de GHL.
 *
 * - "una": un presupuesto = una oportunidad, con todos los módulos dentro.
 * - "por_modulo": una oportunidad por módulo (literal del DERCAS §4.1).
 * - "por_modelo_negocio": agrupadas por el modelo de negocio del DERCAS.
 *
 * PENDIENTE DE VALIDACIÓN POR MIGUEL. Por defecto "una", porque la cadena de
 * seguimiento del §5.2 se dispara por oportunidad: con "por_modulo", una visita
 * a una fachada mandaría cuatro WhatsApps al mismo administrador a los 14 días.
 */
export type ModoAgrupacion = "una" | "por_modulo" | "por_modelo_negocio";

export const MODO_AGRUPACION: ModoAgrupacion = "una";

export type GrupoOportunidad = {
    /** Sufijo para el nombre de la oportunidad. */
    etiqueta: string;
    modulos: ModuloPayload[];
};

/** Reparte los módulos del payload en los grupos que serán oportunidades. */
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
    return completo.length <= maximo ? completo : `${completo.slice(0, maximo - 1).trimEnd()}…`;
}

/** Total de partidas del payload. Para logs y validaciones. */
export function totalPartidas(payload: PayloadVisita): number {
    return payload.modulos.reduce((suma, m) => suma + m.partidas.length, 0);
}