import type { LineaPropuesta } from "./tipos";

/**
 * lib/propuesta/conflictos.ts
 *
 * Misma partida (mismo código) con precios o unidades distintos (28/09/2026).
 *
 * El motor (lib/documentos/motor.ts, `agregarLineas`) junta las líneas del
 * mismo código en una sola fila sumando mediciones y se queda con el PRIMER
 * precio y la PRIMERA unidad. Es lo correcto para la misma partida en dos zonas
 * del edificio, pero si el comercial le puso precios distintos en la revisión,
 * el documento salía con otro total sin que nadie lo viera: 2 x 10 + 3 x 20 =
 * 80 € en pantalla, 5 x 10 = 50 € en el PDF.
 *
 * Se bloquea antes de crear el presupuesto y se le dice al comercial qué
 * unificar. Sin dependencias: lo usan el navegador y el servidor.
 */

export type ConflictoCodigo = { codigo: string; ids: string[]; mensaje: string };

export function conflictosDeCodigo(lineas: readonly LineaPropuesta[]): ConflictoCodigo[] {
    const porCodigo = new Map<string, LineaPropuesta[]>();
    for (const l of lineas) {
        const codigo = l.codigo.trim().toUpperCase();
        if (!codigo) continue;
        porCodigo.set(codigo, [...(porCodigo.get(codigo) ?? []), l]);
    }

    const conflictos: ConflictoCodigo[] = [];
    for (const [codigo, grupo] of porCodigo) {
        if (grupo.length < 2) continue;
        const precios = new Set(grupo.map((l) => l.precioUnitario));
        const unidades = new Set(grupo.map((l) => l.unidad));
        if (precios.size === 1 && unidades.size === 1) continue;

        const diferencia = [precios.size > 1 ? "precios" : null, unidades.size > 1 ? "unidades" : null]
            .filter(Boolean)
            .join(" y ");
        conflictos.push({
            codigo,
            ids: grupo.map((l) => l.id),
            mensaje:
                `La partida ${codigo} aparece ${grupo.length} veces con ${diferencia} distintos. ` +
                `En el documento va en una sola línea: pon el mismo precio y la misma unidad.`,
        });
    }
    return conflictos;
}
