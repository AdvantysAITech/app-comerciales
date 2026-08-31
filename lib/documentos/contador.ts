import { saFetch, getLocationId, type Subcuenta } from "@/lib/ghl/client";

/**
 * lib/documentos/contador.ts
 *
 * Numeración correlativa de presupuestos. DERCAS §12.3.
 *
 * Formato:  SV-2026-0001
 *           ^^ prefijo de empresa
 *              ^^^^ año de emisión (etiqueta, NO reinicia el contador)
 *                   ^^^^ correlativo continuo
 *
 * Decisión de Jacob (31/08/2026): el contador NO se reinicia cada año. Solo
 * cambia la etiqueta del año. Después de SV-2026-0450 viene SV-2027-0451.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ SE DERIVA DE LAS OPORTUNIDADES
 * ---------------------------------------------------------------------------
 * El sitio natural del contador sería un Custom Value de la subcuenta, pero el
 * PIT no tiene ese scope habilitado a 31/08/2026. En lugar de bloquear el
 * bloque, se deriva: se recorren las oportunidades, se leen las referencias ya
 * asignadas y se toma la mayor.
 *
 * `FuenteCorrelativo` existe justamente para que esto sea sustituible: cuando
 * el scope esté disponible, se implementa `ContadorEnCustomValue` y se cambia
 * una línea en `asignarReferencia`. Nada fuera de este fichero se entera.
 *
 * ---------------------------------------------------------------------------
 * LIMITACIÓN CONOCIDA: CARRERA
 * ---------------------------------------------------------------------------
 * Leer-calcular-escribir no es atómico. Si dos comerciales generan en el mismo
 * instante, los dos pueden leer el mismo máximo y obtener el mismo número.
 *
 * Se asume conscientemente: con un comercial activo en Scala y unos pocos
 * presupuestos al día, la ventana real es de milisegundos. `verificarUnicidad`
 * permite detectarlo a posteriori.
 *
 * Si el equipo crece, la solución NO es parchear esto: es implementar la
 * fuente sobre un backend con incremento atómico.
 */

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

/**
 * Prefijo de referencia por subcuenta.
 *
 * El DERCAS §12.3 proponía "ESC-", pero el presupuesto real que usa Miguel
 * lleva "SV-2026-001". Manda el documento real (decisión de Jacob, 31/08/2026).
 *
 * PENDIENTE: el prefijo de Vertical Projects sigue sin decidir. "VRT" es el
 * del DERCAS; si se quiere coherencia con "SV" (iniciales de Scala Valencia),
 * sería "VP". No urge: la subcuenta de Vertical está vacía.
 */
export const PREFIJO_REFERENCIA: Record<Subcuenta, string> = {
    "scala-valencia": "SV",
    "vertical-projects": "VRT",
};

/** Dígitos del correlativo. Cuatro: no hay que cambiar el ancho al pasar de 999. */
const DIGITOS = 4;

/** Máximo de páginas a recorrer. 100 por página. */
const MAX_PAGINAS = 20;

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

export function formatearReferencia(
    subcuenta: Subcuenta,
    anio: number,
    correlativo: number
): string {
    const prefijo = PREFIJO_REFERENCIA[subcuenta] ?? "REF";
    return `${prefijo}-${anio}-${String(correlativo).padStart(DIGITOS, "0")}`;
}

/**
 * Extrae el correlativo de una referencia, o `null` si no corresponde a esta
 * subcuenta.
 *
 * Ignora a propósito las referencias con otro prefijo. En Scala hay
 * "ESC-2026-0082" de antes: no era un correlativo, sino los dígitos del
 * oportunidadId. Contarla haría arrancar la serie en 83 sin ningún motivo.
 */
export function extraerCorrelativo(referencia: string, subcuenta: Subcuenta): number | null {
    const prefijo = PREFIJO_REFERENCIA[subcuenta];
    const patron = new RegExp(`^${prefijo}-(\\d{4})-(\\d+)$`);
    const m = referencia.trim().match(patron);
    if (!m) return null;
    const n = Number(m[2]);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------------------
// Fuente del correlativo
// ---------------------------------------------------------------------------

export interface FuenteCorrelativo {
    /** Correlativo más alto ya asignado. 0 si no hay ninguno. */
    maximoAsignado(subcuenta: Subcuenta): Promise<number>;
    /**
     * Todas las referencias en uso, en bruto y CON repeticiones.
     *
     * Devuelve una lista y no un Set a propósito: un Set descartaría justo los
     * duplicados que `verificarUnicidad` tiene que encontrar.
     */
    referenciasEnUso(subcuenta: Subcuenta): Promise<string[]>;
}

/** Forma de un custom field tal como llega en /opportunities/search. */
type CampoBusqueda = {
    id: string;
    /**
     * En /opportunities/search el valor viene en `fieldValueString`.
     * En /opportunities/:id viene en `fieldValue`.
     * En /contacts viene en `value`.
     * Verificado empíricamente el 31/08/2026. Se leen las tres por si acaso.
     */
    fieldValueString?: unknown;
    fieldValue?: unknown;
    value?: unknown;
};

type OportunidadBusqueda = {
    id: string;
    customFields?: CampoBusqueda[];
    /** Cursor de paginación: [epochMs, id]. */
    sort?: [number, string];
};

function valorDeCampo(campo: CampoBusqueda): string | null {
    const v = campo.fieldValueString ?? campo.fieldValue ?? campo.value;
    return typeof v === "string" && v.trim() !== "" ? v : null;
}

const CAMPO_ESTADO_POR_SUBCUENTA: Record<string, string | undefined> = {
    "scala-valencia": process.env.SA_CAMPO_ESTADO_DOCUMENTO,
    "vertical-projects": process.env.SA_VERTICAL_CAMPO_ESTADO_DOCUMENTO,
};

/**
 * Recorre las oportunidades de la subcuenta y recolecta las referencias
 * guardadas en el registro de documento.
 */
async function recolectarReferencias(subcuenta: Subcuenta): Promise<string[]> {
    const campoEstado = CAMPO_ESTADO_POR_SUBCUENTA[subcuenta];
    if (!campoEstado) {
        throw new Error(
            `No hay custom field "Estado documento" configurado para "${subcuenta}". ` +
                `Sin él no se puede saber qué referencias están en uso.`
        );
    }

    const locationId = getLocationId(subcuenta);
    const referencias: string[] = [];

    let startAfter: number | undefined;
    let startAfterId: string | undefined;

    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
        const params = new URLSearchParams({
            location_id: locationId,
            status: "all",
            limit: "100",
        });
        if (startAfter !== undefined && startAfterId !== undefined) {
            params.set("startAfter", String(startAfter));
            params.set("startAfterId", startAfterId);
        }

        const respuesta = (await saFetch(subcuenta, `/opportunities/search?${params}`)) as {
            opportunities?: OportunidadBusqueda[];
        };

        const lote = respuesta.opportunities ?? [];
        if (lote.length === 0) return referencias;

        for (const oportunidad of lote) {
            const campo = (oportunidad.customFields ?? []).find((c) => c.id === campoEstado);
            const bruto = campo ? valorDeCampo(campo) : null;
            if (!bruto) continue;

            try {
                const registro = JSON.parse(bruto) as { numeroReferencia?: unknown };
                if (typeof registro.numeroReferencia === "string") {
                    referencias.push(registro.numeroReferencia);
                }
            } catch {
                // Registro ilegible. No es asunto del contador: `estado.ts` ya
                // deja traza cuando lo encuentra.
            }
        }

        const ultima = lote[lote.length - 1];
        if (lote.length < 100 || !ultima.sort) return referencias;
        [startAfter, startAfterId] = ultima.sort;
    }

    throw new Error(
        `Se alcanzó el límite de ${MAX_PAGINAS} páginas (${MAX_PAGINAS * 100} oportunidades) ` +
            `recorriendo "${subcuenta}". El contador derivado no escala a este volumen: ` +
            `toca migrar a un contador con incremento atómico.`
    );
}

export const contadorDesdeOportunidades: FuenteCorrelativo = {
    async maximoAsignado(subcuenta) {
        const referencias = await recolectarReferencias(subcuenta);
        let maximo = 0;
        for (const referencia of referencias) {
            const n = extraerCorrelativo(referencia, subcuenta);
            if (n !== null && n > maximo) maximo = n;
        }
        return maximo;
    },

    async referenciasEnUso(subcuenta) {
        return recolectarReferencias(subcuenta);
    },
};

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Reserva y devuelve la siguiente referencia.
 *
 * "Reserva" es optimista: el número no queda tomado hasta que se escribe el
 * registro de la oportunidad. Ver la limitación de carrera arriba.
 */
export async function asignarReferencia(
    subcuenta: Subcuenta,
    fuente: FuenteCorrelativo = contadorDesdeOportunidades,
    anio: number = new Date().getFullYear()
): Promise<string> {
    const maximo = await fuente.maximoAsignado(subcuenta);
    return formatearReferencia(subcuenta, anio, maximo + 1);
}

/**
 * Comprueba que no hay referencias repetidas en la subcuenta.
 *
 * Pensado para un chequeo periódico o para depurar tras una sospecha de
 * carrera. Devuelve las referencias duplicadas, o vacío si todo está bien.
 */
export async function verificarUnicidad(
    subcuenta: Subcuenta,
    fuente: FuenteCorrelativo = contadorDesdeOportunidades
): Promise<string[]> {
    const todas = await fuente.referenciasEnUso(subcuenta);

    const vistas = new Set<string>();
    const duplicadas = new Set<string>();
    for (const referencia of todas) {
        if (vistas.has(referencia)) duplicadas.add(referencia);
        vistas.add(referencia);
    }
    return [...duplicadas];
}