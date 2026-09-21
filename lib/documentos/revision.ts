import { listarCapitulos, obtenerPartida, UNIDADES_SELECCIONABLES, type UnidadSeleccionable } from "./tarifa";
import type { PresupuestoCalculado } from "./motor";
import type { AjusteLinea, AjustesPresupuesto, LineaAnadida } from "./ajustes";

/**
 * lib/documentos/revision.ts
 *
 * Modelo de vista de la pantalla de revisión y saneado de lo que esa pantalla
 * envía de vuelta.
 *
 * Vive fuera del componente a propósito: la validación de un ajuste NO puede
 * estar solo en el navegador. Un precio que llega por la API acaba en un
 * documento precontractual, así que se comprueba en servidor aunque la pantalla
 * ya lo haya comprobado antes.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ HACEN FALTA DOS PRESUPUESTOS
 * ---------------------------------------------------------------------------
 * El presupuesto ajustado no contiene las partidas que dirección ha excluido:
 * por eso son excluidas. Pero la pantalla tiene que seguir enseñándolas, tachadas
 * y con un botón para recuperarlas — si no, quitar una partida sería una decisión
 * irreversible desde la interfaz.
 *
 * De ahí `construirFilas(base, actual)`: el esqueleto sale del cálculo SIN
 * ajustes y los importes del cálculo CON ajustes.
 */

export type FilaRevision = {
    codigo: string;
    codigoJerarquico: string;
    descripcion: string;
    /** Unidad que se imprime. */
    unidad: string;
    /** Medición y precio que salen de la visita y la tarifa. */
    cantidadBase: number;
    precioBase: number;
    /** Medición y precio aplicados. Si está excluida, los de base. */
    cantidad: number;
    precioUnitario: number;
    importe: number;
    excluida: boolean;
    /** La ha añadido dirección; no venía de la visita. */
    anadida: boolean;
    /** Difiere de la base en medición, precio o unidad. */
    ajustada: boolean;
};

export type CapituloRevision = {
    codigo: string;
    codigoJerarquico: string;
    nombre: string;
    filas: FilaRevision[];
    /** Total del capítulo YA ajustado. Las excluidas no suman. */
    total: number;
};

export type VistaRevision = {
    capitulos: CapituloRevision[];
    pem: number;
    ivaTipo: number;
    ivaImporte: number;
    total: number;
    /** Avisos del motor (precios ajustados, unidades divergentes...). */
    avisos: { nivel: string; codigo: string; mensaje: string }[];
};

/** Partida de tarifa tal y como la consume el buscador de la pantalla. */
export type PartidaBuscable = {
    codigo: string;
    codigoJerarquico: string;
    descripcion: string;
    unidad: string;
    precio: number;
    capitulo: string;
};

function indexarPorCodigo(presupuesto: PresupuestoCalculado) {
    const mapa = new Map<
        string,
        { capitulo: string; cantidad: number; precioUnitario: number; importe: number; unidad: string; resumen: string; codigoJerarquico: string }
    >();

    for (const capitulo of presupuesto.capitulos) {
        for (const linea of capitulo.lineas) {
            mapa.set(linea.codigo, {
                capitulo: capitulo.codigo,
                cantidad: linea.cantidad,
                precioUnitario: linea.precioUnitario,
                importe: linea.importe,
                unidad: linea.unidad,
                resumen: linea.resumen,
                codigoJerarquico: linea.codigoJerarquico,
            });
        }
    }

    return mapa;
}

/**
 * Construye la tabla que ve dirección.
 *
 * `base` es el cálculo sin ajustes y `actual` el cálculo con ellos. Las partidas
 * que solo están en `base` se pintan como excluidas; las que solo están en
 * `actual` son añadidos de dirección.
 */
export function construirFilas(
    base: PresupuestoCalculado,
    actual: PresupuestoCalculado
): VistaRevision {
    const enBase = indexarPorCodigo(base);
    const enActual = indexarPorCodigo(actual);

    const totalesCapitulo = new Map(actual.capitulos.map((c) => [c.codigo, c.total]));
    const porCapitulo = new Map<string, FilaRevision[]>();

    const anadir = (capitulo: string, fila: FilaRevision) => {
        const lista = porCapitulo.get(capitulo) ?? [];
        lista.push(fila);
        porCapitulo.set(capitulo, lista);
    };

    for (const [codigo, linea] of enBase) {
        const aplicada = enActual.get(codigo);

        anadir(linea.capitulo, {
            codigo,
            codigoJerarquico: linea.codigoJerarquico,
            descripcion: linea.resumen,
            unidad: aplicada?.unidad ?? linea.unidad,
            cantidadBase: linea.cantidad,
            precioBase: linea.precioUnitario,
            cantidad: aplicada?.cantidad ?? linea.cantidad,
            precioUnitario: aplicada?.precioUnitario ?? linea.precioUnitario,
            importe: aplicada?.importe ?? linea.importe,
            excluida: !aplicada,
            anadida: false,
            ajustada: Boolean(
                aplicada &&
                    (aplicada.cantidad !== linea.cantidad ||
                        aplicada.precioUnitario !== linea.precioUnitario ||
                        aplicada.unidad !== linea.unidad)
            ),
        });
    }

    for (const [codigo, linea] of enActual) {
        if (enBase.has(codigo)) continue;

        const partida = obtenerPartida(codigo);

        anadir(linea.capitulo, {
            codigo,
            codigoJerarquico: linea.codigoJerarquico,
            descripcion: linea.resumen,
            unidad: linea.unidad,
            cantidadBase: linea.cantidad,
            precioBase: partida?.tarifaEmpresa ?? linea.precioUnitario,
            cantidad: linea.cantidad,
            precioUnitario: linea.precioUnitario,
            importe: linea.importe,
            excluida: false,
            anadida: true,
            ajustada: partida ? linea.precioUnitario !== partida.tarifaEmpresa : false,
        });
    }

    // Orden del catálogo, el mismo que sigue el PDF.
    const capitulos: CapituloRevision[] = [];
    for (const capitulo of listarCapitulos()) {
        const filas = porCapitulo.get(capitulo.codigo);
        if (!filas || filas.length === 0) continue;

        capitulos.push({
            codigo: capitulo.codigo,
            codigoJerarquico: capitulo.codigoJerarquico,
            nombre: capitulo.nombre,
            filas,
            total: totalesCapitulo.get(capitulo.codigo) ?? 0,
        });
    }

    return {
        capitulos,
        pem: actual.pem,
        ivaTipo: actual.ivaTipo,
        ivaImporte: actual.ivaImporte,
        total: actual.total,
        avisos: actual.avisos.map((a) => ({ nivel: a.nivel, codigo: a.codigo, mensaje: a.mensaje })),
    };
}

// ---------------------------------------------------------------------------
// Saneado de la entrada
// ---------------------------------------------------------------------------

export type CuerpoAjustes = {
    lineas?: Record<string, AjusteLinea>;
    anadidas?: LineaAnadida[];
    ivaTipo?: number;
    motivo?: string;
};

export type ResultadoSaneado =
    | { ok: true; lineas: Record<string, AjusteLinea>; anadidas: LineaAnadida[]; ivaTipo?: number; motivo?: string }
    | { ok: false; errores: string[] };

function esUnidad(valor: unknown): valor is UnidadSeleccionable {
    return typeof valor === "string" && (UNIDADES_SELECCIONABLES as readonly string[]).includes(valor);
}

/**
 * Comprueba y normaliza lo que envía la pantalla.
 *
 * Reglas:
 *  - El código tiene que existir en la tarifa. Uno inventado no llega al motor.
 *  - Cantidad > 0. Una partida que no se mide, se excluye; no se pone a cero.
 *  - Precio >= 0. El cero es legítimo (partida incluida sin cargo) y se ve en el
 *    documento como tal; un negativo no significa nada en un presupuesto.
 *  - IVA en tanto por uno entre 0 y 1.
 */
export function sanearAjustes(cuerpo: CuerpoAjustes): ResultadoSaneado {
    const errores: string[] = [];
    const lineas: Record<string, AjusteLinea> = {};
    const anadidas: LineaAnadida[] = [];

    for (const [codigoBruto, ajusteBruto] of Object.entries(cuerpo.lineas ?? {})) {
        const codigo = String(codigoBruto).trim().toUpperCase();
        if (!obtenerPartida(codigo)) {
            errores.push(`La partida "${codigo}" no existe en la tarifa 2026.`);
            continue;
        }

        const ajuste: AjusteLinea = {};
        const bruto = ajusteBruto ?? {};

        if (bruto.excluida) ajuste.excluida = true;

        if (bruto.cantidad !== undefined && bruto.cantidad !== null) {
            const cantidad = Number(bruto.cantidad);
            if (!Number.isFinite(cantidad) || cantidad <= 0) {
                errores.push(`[${codigo}] La medición tiene que ser mayor que 0 (recibido: ${bruto.cantidad}).`);
            } else {
                ajuste.cantidad = cantidad;
            }
        }

        if (bruto.precioUnitario !== undefined && bruto.precioUnitario !== null) {
            const precio = Number(bruto.precioUnitario);
            if (!Number.isFinite(precio) || precio < 0) {
                errores.push(`[${codigo}] El precio no puede ser negativo (recibido: ${bruto.precioUnitario}).`);
            } else {
                ajuste.precioUnitario = precio;
            }
        }

        if (bruto.unidad !== undefined) {
            if (bruto.unidad === null || esUnidad(bruto.unidad)) ajuste.unidad = bruto.unidad;
            else errores.push(`[${codigo}] Unidad no admitida: "${bruto.unidad}".`);
        }

        if (bruto.descripcionLarga !== undefined) {
            ajuste.descripcionLarga =
                typeof bruto.descripcionLarga === "string" ? bruto.descripcionLarga : null;
        }

        if (Object.keys(ajuste).length > 0) lineas[codigo] = ajuste;
    }

    for (const brutoAnadida of cuerpo.anadidas ?? []) {
        const codigo = String(brutoAnadida?.codigo ?? "").trim().toUpperCase();
        const partida = obtenerPartida(codigo);

        if (!partida) {
            errores.push(`La partida añadida "${codigo}" no existe en la tarifa 2026.`);
            continue;
        }

        const cantidad = Number(brutoAnadida.cantidad);
        if (!Number.isFinite(cantidad) || cantidad <= 0) {
            errores.push(`[${codigo}] La medición de la partida añadida tiene que ser mayor que 0.`);
            continue;
        }

        const anadida: LineaAnadida = { codigo, cantidad };

        if (brutoAnadida.precioUnitario !== undefined && brutoAnadida.precioUnitario !== null) {
            const precio = Number(brutoAnadida.precioUnitario);
            if (!Number.isFinite(precio) || precio < 0) {
                errores.push(`[${codigo}] El precio de la partida añadida no puede ser negativo.`);
                continue;
            }
            anadida.precioUnitario = precio;
        }

        if (brutoAnadida.unidad !== undefined) {
            if (brutoAnadida.unidad === null || esUnidad(brutoAnadida.unidad)) anadida.unidad = brutoAnadida.unidad;
            else errores.push(`[${codigo}] Unidad no admitida en la partida añadida.`);
        }

        anadidas.push(anadida);
    }

    let ivaTipo: number | undefined;
    if (cuerpo.ivaTipo !== undefined && cuerpo.ivaTipo !== null) {
        const tipo = Number(cuerpo.ivaTipo);
        if (!Number.isFinite(tipo) || tipo < 0 || tipo > 1) {
            errores.push(`Tipo de IVA inválido: ${cuerpo.ivaTipo}. Se espera tanto por uno (0,10 = 10 %).`);
        } else {
            ivaTipo = tipo;
        }
    }

    if (errores.length > 0) return { ok: false, errores };

    const motivo = typeof cuerpo.motivo === "string" ? cuerpo.motivo.trim().slice(0, 500) : undefined;
    return { ok: true, lineas, anadidas, ivaTipo, motivo: motivo || undefined };
}

/**
 * ¿El documento publicado refleja los ajustes vigentes?
 *
 * Si dirección tocó algo DESPUÉS de generar, el PDF que hay en la oportunidad ya
 * no es el que está viendo, y enviarlo al administrador sería mandar una versión
 * anterior. Es la comprobación que separa "he cambiado cosas" de "he cambiado
 * cosas y las he plasmado en el documento".
 */
export function documentoAlDia(
    registroActualizadoEn: string | undefined,
    ajustes: AjustesPresupuesto | null
): boolean {
    if (!registroActualizadoEn) return false;
    if (!ajustes) return true;

    const documento = new Date(registroActualizadoEn).getTime();
    const ajuste = new Date(ajustes.actualizadoEn).getTime();

    if (Number.isNaN(documento) || Number.isNaN(ajuste)) return false;
    return documento >= ajuste;
}