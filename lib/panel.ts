import type { ClaveEtapa } from "@/lib/ghl/ids";

/**
 * lib/panel.ts
 *
 * Reparto de las oportunidades del panel en dos columnas (27/09/2026):
 *
 *  - BORRADORES: presupuestos que el comercial todavía puede tocar porque no
 *    tienen documento. "Visita concertada" (datos sin tomar) y "Datos recogidos"
 *    (datos tomados, documento sin generar).
 *  - GENERADOS: ya tienen documento. Etiqueta "Por revisar" mientras dirección
 *    no lo valide, "Revisado" cuando sí.
 *
 * Se decide por ETAPA y no por la casilla `PRESUPUESTO_GENERADO`: generar LIMPIA
 * esa casilla al encolar (lib/ghl/casillas.ts), así que durante la generación
 * una oportunidad ya en revisión saltaría a borradores unos segundos. La etapa
 * solo avanza a "Presupuesto en revisión" cuando el documento se publica.
 *
 * Es una función pura a propósito: el contador de la cabecera y las columnas
 * tienen que decir lo mismo, y antes cada uno contaba "por revisar" a su manera.
 */

export type Columna = "borrador" | "generado";

/** Estilo de la etiqueta: relleno (hecho), borde (pendiente), tenue (cerrada). */
export type TonoEtiqueta = "lleno" | "borde" | "tenue";

export type Clasificacion = {
    columna: Columna;
    etiqueta: string;
    tono: TonoEtiqueta;
    /** Cuenta para "Tienes N por revisar". */
    porRevisar: boolean;
};

type OportunidadClasificable = {
    etapa: ClaveEtapa | null;
    presupuestoValidado: boolean;
};

/**
 * Etapas que solo se alcanzan con el presupuesto ya validado: el workflow de GHL
 * mueve a "Presupuesto enviado" al marcar la validación. Si alguien desmarcó la
 * casilla a mano después, el presupuesto sigue estando revisado.
 */
const ETAPAS_REVISADO: readonly ClaveEtapa[] = ["PRESUPUESTO_ENVIADO", "EN_NEGOCIACION", "GANADA"];

export function clasificar(op: OportunidadClasificable): Clasificacion {
    switch (op.etapa) {
        case "VISITA_CONCERTADA":
            return { columna: "borrador", etiqueta: "Visita pendiente", tono: "tenue", porRevisar: false };
        case "DATOS_RECOGIDOS":
        case null:
            // Sin etapa reconocible (etapa nueva en GHL que la app no conoce):
            // mejor en borradores, donde el comercial la ve, que desaparecida.
            return { columna: "borrador", etiqueta: "Borrador", tono: "borde", porRevisar: false };
        case "PERDIDA":
            // Cerrada: ni por revisar ni revisada, no hay nada que hacer con ella.
            return { columna: "generado", etiqueta: "Perdida", tono: "tenue", porRevisar: false };
    }

    const revisado = op.presupuestoValidado || ETAPAS_REVISADO.includes(op.etapa);
    return revisado
        ? { columna: "generado", etiqueta: "Revisado", tono: "lleno", porRevisar: false }
        : { columna: "generado", etiqueta: "Por revisar", tono: "borde", porRevisar: true };
}
