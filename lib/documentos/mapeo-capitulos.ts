import type { PayloadVisita } from "@/lib/visita/payload";
import {
  obtenerPartida,
  UNIDADES_SELECCIONABLES,
  type PartidaTarifa,
  type UnidadSeleccionable,
} from "./tarifa";
import {
  calcularPresupuesto,
  assertCuadre,
  type EntradaPresupuesto,
  type LineaSolicitada,
  type PresupuestoCalculado,
} from "./motor";

/**
 * lib/documentos/mapeo-capitulos.ts
 *
 * Correspondencia entre el catálogo de CAPTURA y el catálogo de TARIFA.
 *
 * Aquí se resuelve la asimetría estructural del proyecto: el catálogo de
 * captura se organiza por MÓDULO (zona del edificio: cubiertas, fachada,
 * medianeras) porque es como recorre el edificio el comercial, y el
 * presupuesto se organiza por CAPÍTULO porque es como lo lee un administrador.
 *
 * No es una relación 1:1: un módulo alimenta varios capítulos y un capítulo
 * recibe partidas de varios módulos. El andamio de Cubiertas y el de Fachada
 * caen los dos en "1.02 ANDAMIOS Y MEDIOS DE ELEVACION", y `motor.ts` los
 * agrega en una sola línea sumando mediciones.
 *
 * ---------------------------------------------------------------------------
 * QUÉ CAMBIÓ RESPECTO A LA VERSIÓN ANTERIOR (31/08/2026)
 * ---------------------------------------------------------------------------
 * La versión anterior guardaba por ruta: código, capítulo, nombre de capítulo,
 * precio en céntimos y descripción. Los cinco campos salen ahora del catálogo
 * congelado `data/tarifa/tarifa-2026.json` (199 partidas, 12 capítulos).
 *
 * Este fichero ya NO conoce precios. Solo responde a una pregunta:
 *
 *     ¿a qué código de tarifa corresponde esta ruta de captura?
 *
 * Consecuencias:
 *  - `EntradaCatalogoPrecios` desaparece.
 *  - `ORDEN_CAPITULOS` desaparece: el orden lo fija el catálogo.
 *  - `economia.ts` queda obsoleto: el cálculo vive en `motor.ts`.
 *  - Ya NO estamos bloqueados por la sesión de precios con Miguel. Lo único
 *    pendiente es decidir la equivalencia de cada ruta, que es una decisión
 *    técnica revisable, no un dato que haya que esperar.
 *
 * ---------------------------------------------------------------------------
 * CÓMO AÑADIR UNA RUTA
 * ---------------------------------------------------------------------------
 *  1. Busca el código en el catálogo:  npm run tarifa:buscar -- "andamio"
 *  2. Añade la entrada a MAPA_RUTAS con su estado.
 *  3. Ejecuta:  npm run mapeo:auditar
 *
 * El estado NO afecta al cálculo. Sirve para saber qué tiene que validar
 * Miguel y para que "propuesto" no se confunda nunca con "confirmado".
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type EstadoMapeo =
  /** Equivalencia inequívoca. No requiere validación. */
  | "confirmado"
  /** Equivalencia razonable pero discutible. Miguel debe validarla. */
  | "propuesto"
  /** No existe partida equivalente en la tarifa. Bloquea el presupuesto. */
  | "sin_equivalencia";

export interface MapeoPartida {
  /** Código del catálogo de tarifa. Vacío si estado es "sin_equivalencia". */
  codigo: string;
  estado: EstadoMapeo;
  /** Por qué se eligió ese código, o qué falta. Se lee en la auditoría. */
  nota?: string;
}

// ---------------------------------------------------------------------------
// Tabla de mapeo
// ---------------------------------------------------------------------------

/**
 * Clave: `ruta` de la partida en el catálogo de captura (contrato estable,
 * no renombrar). Valor: su equivalencia en la tarifa.
 *
 * INCOMPLETA. Contiene solo las rutas observadas en el ODT generado el
 * 27/08/2026. Falta volcar el resto del catálogo de captura.
 */
export const MAPA_RUTAS: Record<string, MapeoPartida> = {
  // --- Medianeras ---------------------------------------------------------
  "medianeras.medios_auxiliares.andamio.colgante": {
    codigo: "",
    estado: "sin_equivalencia",
    nota:
      "La tarifa solo tiene andamio tubular multidireccional (AND001-AND003). " +
      "No hay andamio colgante. Decisión de Miguel: ¿se añade partida o se " +
      "remapea a AND001 a tanto alzado?",
  },
  "medianeras.picado.picado_cantos": {
    codigo: "DEM009",
    estado: "propuesto",
    nota: "DEM009 es picado de enfoscado en paramento vertical (m²); la captura habla de cantos (ml).",
  },
  "medianeras.picado.picado_grietas": {
    codigo: "FAC009",
    estado: "propuesto",
    nota: "FAC009 repara grieta con masilla elástica (ml). Si solo es picado sin reparar, revisar.",
  },
  "medianeras.pintura.hidrofugo_caravista": {
    codigo: "PIN010",
    estado: "propuesto",
    nota: "PIN010 es hidrofugante siloxánico para piedra natural, no para ladrillo caravista.",
  },

  // --- Fachada trasera ----------------------------------------------------
  "fachada_trasera.picado.limpieza_manual": {
    codigo: "DEM016",
    estado: "propuesto",
    nota:
      "DEM016 es lavado hidrodinámico a presión, no limpieza manual. " +
      "Alternativa: DEM018 (limpieza de juntas manual con cepillo). " +
      "OJO: DEM016 tiene tarifa pactada 2,91 € fuera del margen del 25%.",
  },
  "fachada_trasera.pintura.revestimiento_elastico": {
    codigo: "PIN008",
    estado: "confirmado",
    nota: "Revestimiento elástico antifisuras armado con malla, fachada exterior.",
  },

  // --- Cubiertas ----------------------------------------------------------
  "cubiertas.medios_auxiliares.andamio": {
    codigo: "AND002",
    estado: "propuesto",
    nota:
      "AND002 es h=10-20 m. Si el edificio es más bajo va AND001 (h<=10 m) y si " +
      "es más alto AND003 (h=20-30 m). La altura no se captura hoy en el formulario.",
  },
  "cubiertas.picado.limpieza_manual": {
    codigo: "DEM018",
    estado: "propuesto",
    nota: "Limpieza de juntas manual con cepillo. Confirmar que es el trabajo real.",
  },
  "cubiertas.picado.picado_piedra": {
    codigo: "DEM011",
    estado: "propuesto",
    nota: "DEM011 es demolición de chapado de piedra natural con grapas. Alternativa: DEM013.",
  },
  "cubiertas.impermeabilizacion.mortero_fibras": {
    codigo: "",
    estado: "sin_equivalencia",
    nota:
      "No hay mortero de impermeabilización con fibras en la tarifa. " +
      "Lo más próximo es IMP018 (membrana líquida de poliuretano), que no es lo mismo.",
  },
  "cubiertas.impermeabilizacion.epdm": {
    codigo: "",
    estado: "sin_equivalencia",
    nota:
      "No hay lámina EPDM en la tarifa. El capítulo 06 solo cubre bituminosa, " +
      "PU líquido y aislamientos. Decisión de Miguel: ¿se añade partida EPDM?",
  },
};

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------

export class RutasSinMapearError extends Error {
  constructor(
    public readonly desconocidas: readonly string[],
    public readonly sinEquivalencia: readonly { ruta: string; nota?: string }[]
  ) {
    const partes: string[] = ["No se puede presupuestar."];

    if (desconocidas.length) {
      partes.push(
        `\n${desconocidas.length} ruta(s) no están en MAPA_RUTAS (lib/documentos/mapeo-capitulos.ts):`,
        ...desconocidas.map((r) => `  - ${r}`)
      );
    }
    if (sinEquivalencia.length) {
      partes.push(
        `\n${sinEquivalencia.length} ruta(s) sin partida equivalente en la tarifa. Requieren decisión de Miguel:`,
        ...sinEquivalencia.map((s) => `  - ${s.ruta}${s.nota ? `\n      ${s.nota}` : ""}`)
      );
    }

    super(partes.join("\n"));
    this.name = "RutasSinMapearError";
  }

  /**
   * Listado plano de rutas que impiden presupuestar.
   * Se mantiene por compatibilidad con `PreciosPendientesError.rutasSinPrecio`.
   */
  get rutasSinPrecio(): readonly string[] {
    return [...this.desconocidas, ...this.sinEquivalencia.map((s) => s.ruta)];
  }
}

/**
 * @deprecated Usa `RutasSinMapearError`.
 *
 * El nombre anterior asumía que el problema era la falta de PRECIO. Ya no lo
 * es: los precios están en el catálogo congelado. Lo que falta ahora es la
 * EQUIVALENCIA entre una ruta de captura y una partida de tarifa.
 *
 * Alias temporal para no romper `app/api/documentos/generar/route.ts`.
 * Eliminar cuando esa ruta se migre.
 */
export const PreciosPendientesError = RutasSinMapearError;
export type PreciosPendientesError = RutasSinMapearError;

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export function mapearRuta(ruta: string): MapeoPartida | undefined {
  return MAPA_RUTAS[ruta];
}

/** Resuelve una ruta hasta su partida de tarifa, o `undefined`. */
export function partidaDeRuta(ruta: string): PartidaTarifa | undefined {
  const m = MAPA_RUTAS[ruta];
  if (!m || m.estado === "sin_equivalencia" || !m.codigo) return undefined;
  return obtenerPartida(m.codigo);
}

/** Rutas del payload que no se pueden valorar, separadas por causa. */
export function auditarPayload(payload: PayloadVisita): {
  desconocidas: string[];
  sinEquivalencia: { ruta: string; nota?: string }[];
  propuestas: { ruta: string; codigo: string; nota?: string }[];
} {
  const desconocidas: string[] = [];
  const sinEquivalencia: { ruta: string; nota?: string }[] = [];
  const propuestas: { ruta: string; codigo: string; nota?: string }[] = [];

  const rutas = new Set(
    payload.modulos.flatMap((m) => m.partidas).map((p) => p.ruta)
  );

  for (const ruta of rutas) {
    const m = MAPA_RUTAS[ruta];
    if (!m) {
      desconocidas.push(ruta);
    } else if (m.estado === "sin_equivalencia" || !m.codigo) {
      sinEquivalencia.push({ ruta, nota: m.nota });
    } else if (m.estado === "propuesto") {
      propuestas.push({ ruta, codigo: m.codigo, nota: m.nota });
    }
  }

  return { desconocidas, sinEquivalencia, propuestas };
}

/** Compatibilidad con la API anterior. */
export function rutasSinPrecio(payload: PayloadVisita): string[] {
  const a = auditarPayload(payload);
  return [...a.desconocidas, ...a.sinEquivalencia.map((s) => s.ruta)];
}

// ---------------------------------------------------------------------------
// Adaptador captura -> motor
// ---------------------------------------------------------------------------

function normalizarUnidadSeleccionada(
  bruta: string | null | undefined
): UnidadSeleccionable | null {
  if (!bruta) return null;
  const v = bruta.trim().toLowerCase();
  if (v === "ud" || v === "uds" || v === "u") return "ud";
  if (v === "m2" || v === "m²") return "m²";
  // El formulario solo ofrece ud y m² (acuerdo 31/08/2026). Cualquier otro
  // valor es dato heredado: se ignora y se imprime la unidad nativa.
  return null;
}

/**
 * Convierte el payload de la visita en la entrada del motor económico.
 * Lanza si alguna ruta no se puede valorar: mejor no generar que generar un
 * presupuesto incompleto sin que nadie lo note.
 */
export function construirEntradaPresupuesto(
  payload: PayloadVisita,
  ivaTipo?: number
): EntradaPresupuesto {
  const auditoria = auditarPayload(payload);
  if (auditoria.desconocidas.length || auditoria.sinEquivalencia.length) {
    throw new RutasSinMapearError(auditoria.desconocidas, auditoria.sinEquivalencia);
  }

  const lineas: LineaSolicitada[] = [];

  for (const modulo of payload.modulos) {
    for (const partida of modulo.partidas) {
      const mapeo = MAPA_RUTAS[partida.ruta];
      const cantidad = partida.cantidad ?? 0;

      // Cantidad 0 o vacía = el comercial no midió esa partida. No es un
      // error: simplemente no entra en el presupuesto.
      if (!Number.isFinite(cantidad) || cantidad <= 0) continue;

      lineas.push({
        codigo: mapeo.codigo,
        cantidad,
        unidadSeleccionada: normalizarUnidadSeleccionada(partida.unidad),
        descripcionLarga: null, // la inyecta la capa de generación de textos
      });
    }
  }

  if (lineas.length === 0) {
    throw new Error(
      "El presupuesto no contiene ninguna partida con medición mayor que 0. " +
        "Revisa que el comercial haya introducido cantidades en el formulario."
    );
  }

  return { lineas, ivaTipo };
}

/**
 * Punto de entrada del bloque económico: visita -> presupuesto calculado.
 * Mantiene el nombre de la versión anterior, pero devuelve `PresupuestoCalculado`
 * en lugar del antiguo `Economia`.
 */
export function presupuestar(
  payload: PayloadVisita,
  ivaTipo?: number
): PresupuestoCalculado {
  const resultado = calcularPresupuesto(construirEntradaPresupuesto(payload, ivaTipo));
  assertCuadre(resultado);
  return resultado;
}

// ---------------------------------------------------------------------------
// Integridad del mapeo (para tests y auditoría)
// ---------------------------------------------------------------------------

/**
 * Comprueba que todos los códigos de MAPA_RUTAS existen en la tarifa.
 * Un código mal escrito aquí produciría un fallo en tiempo de generación,
 * con el comercial delante. Esto lo caza en CI.
 */
export function validarMapeo(): string[] {
  const fallos: string[] = [];

  for (const [ruta, m] of Object.entries(MAPA_RUTAS)) {
    if (m.estado === "sin_equivalencia") {
      if (m.codigo) fallos.push(`${ruta}: estado "sin_equivalencia" pero tiene código "${m.codigo}".`);
      if (!m.nota) fallos.push(`${ruta}: "sin_equivalencia" sin nota que explique qué falta.`);
      continue;
    }
    if (!m.codigo) {
      fallos.push(`${ruta}: estado "${m.estado}" sin código.`);
      continue;
    }
    if (!obtenerPartida(m.codigo)) {
      fallos.push(`${ruta}: el código "${m.codigo}" no existe en el catálogo de tarifa.`);
    }
    if (m.estado === "propuesto" && !m.nota) {
      fallos.push(`${ruta}: estado "propuesto" sin nota. Miguel no sabrá qué validar.`);
    }
  }

  return fallos;
}

export function resumenMapeo(): Record<EstadoMapeo | "total", number> {
  const r = { confirmado: 0, propuesto: 0, sin_equivalencia: 0, total: 0 };
  for (const m of Object.values(MAPA_RUTAS)) {
    r[m.estado] += 1;
    r.total += 1;
  }
  return r;
}

export { UNIDADES_SELECCIONABLES };