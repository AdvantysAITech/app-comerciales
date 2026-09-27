import { obtenerCapitulo, obtenerPartida } from "@/lib/documentos/tarifa";
import { normalizarUnidad, type LineaPropuesta, type OrigenLinea, type Propuesta } from "./tipos";

/**
 * lib/propuesta/validar.ts
 *
 * Validación EN SERVIDOR de la propuesta que manda el formulario al crear el
 * presupuesto. SOLO SERVIDOR (importa la tarifa).
 *
 * El comercial puede cambiar precio, unidad y medición (decisión de Jacob,
 * 27/09/2026): eso no se discute aquí. Lo que se garantiza es que lo que llega
 * a GHL y al motor es calculable:
 *  - toda línea tiene código, medición > 0 y precio >= 0;
 *  - una línea "tarifa" existe en la tarifa, y su descripción es la del
 *    catálogo (no la que diga el navegador);
 *  - ninguna línea sigue pendiente de CYPE;
 *  - el capítulo existe y el módulo es uno de los elegidos.
 */

const ORIGENES: readonly OrigenLinea[] = ["tarifa", "cype", "manual"];
const MAX_LINEAS = 200;

const texto = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const numeroONull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export type ResultadoValidacion = { ok: true; propuesta: Propuesta } | { ok: false; errores: string[] };

export function validarPropuesta(bruta: unknown, modulosElegidos: readonly string[]): ResultadoValidacion {
    const errores: string[] = [];
    const p = (bruta && typeof bruta === "object" ? bruta : {}) as Partial<Propuesta>;
    const brutas = Array.isArray(p.lineas) ? p.lineas.slice(0, MAX_LINEAS) : [];
    const modulos = new Set(modulosElegidos);
    const lineas: LineaPropuesta[] = [];

    if (brutas.length === 0) errores.push("La propuesta no tiene ninguna partida.");

    for (const [i, b] of brutas.entries()) {
        const l = (b ?? {}) as Partial<LineaPropuesta>;
        const nombre = texto(l.descripcionCorta, 120) || `línea ${i + 1}`;
        const origen = ORIGENES.includes(l.origen as OrigenLinea) ? (l.origen as OrigenLinea) : null;
        const codigo = texto(l.codigo, 20).toUpperCase();
        const cantidad = numeroONull(l.cantidad);
        const precio = numeroONull(l.precioUnitario);
        const unidad = normalizarUnidad(texto(l.unidad));
        const moduloKey = texto(l.moduloKey, 100);

        if (l.pendienteCype) errores.push(`"${nombre}": todavía se está buscando en CYPE.`);
        if (!origen) errores.push(`"${nombre}": origen desconocido.`);
        if (!/^[A-Z0-9-]{2,20}$/.test(codigo)) errores.push(`"${nombre}": sin código. Ponle precio o elige una partida.`);
        if (cantidad === null || cantidad <= 0) errores.push(`"${nombre}": falta la medición.`);
        if (precio === null || precio < 0) errores.push(`"${nombre}": falta el precio.`);
        if (!unidad) errores.push(`"${nombre}": unidad no válida.`);
        if (!modulos.has(moduloKey)) errores.push(`"${nombre}": tipo de trabajo no seleccionado.`);

        let descripcionCorta = texto(l.descripcionCorta, 300);
        let descripcionLarga: string | null = texto(l.descripcionLarga, 4000) || null;
        let capitulo = texto(l.capitulo, 2);
        let precioCype = numeroONull(l.precioCype);

        if (origen === "tarifa") {
            const partida = obtenerPartida(codigo);
            if (!partida) {
                errores.push(`"${nombre}": el código ${codigo} no está en la tarifa.`);
            } else {
                descripcionCorta = partida.descripcionCorta;
                descripcionLarga = descripcionLarga ?? partida.descripcionLarga;
                capitulo = partida.capitulo;
                precioCype = partida.precioCype;
            }
        } else if (!descripcionCorta) {
            errores.push(`"${nombre}": falta la descripción.`);
        }
        if (!obtenerCapitulo(capitulo)) errores.push(`"${nombre}": capítulo "${capitulo}" inexistente.`);

        lineas.push({
            id: texto(l.id, 40) || `l${i + 1}`,
            moduloKey,
            textoOriginal: texto(l.textoOriginal, 1000),
            codigo,
            origen: origen ?? "manual",
            descripcionCorta,
            descripcionLarga,
            unidad: unidad ?? "ud",
            cantidad,
            precioUnitario: precio,
            precioReferencia: numeroONull(l.precioReferencia),
            precioCype,
            capitulo,
            url: texto(l.url, 500) || null,
            aviso: null,
        });
    }

    if (errores.length > 0) return { ok: false, errores };

    return {
        ok: true,
        propuesta: {
            generadaEn: texto(p.generadaEn, 40) || new Date().toISOString(),
            lineas,
            observaciones: Array.isArray(p.observaciones) ? p.observaciones.map((o) => texto(o, 500)).filter(Boolean) : [],
            sugerencias: Array.isArray(p.sugerencias) ? p.sugerencias.map((o) => texto(o, 500)).filter(Boolean) : [],
        },
    };
}
