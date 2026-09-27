import { NextRequest, NextResponse } from "next/server";
import { sesionApp } from "@/lib/sesion";
import { getModulo } from "@/lib/catalogo";
import { iaDisponible, IaNoConfiguradaError } from "@/lib/ia/claude";
import { generarPropuesta } from "@/lib/propuesta/generar";
import type { DictadoModulo } from "@/lib/propuesta/tipos";

/**
 * Dictado -> propuesta de partidas (pasos 1 y 2: extracción y tarifa).
 *
 * Cuerpo: { modulos: [{ key, dictado, fotos }] }. La etiqueta de cada módulo se
 * saca del catálogo de la subcuenta, no del cliente. Las fotos (URLs públicas
 * de GHL) se mandan a la IA junto a su dictado; ver `contenidoExtraccion`.
 *
 * Las líneas que no están en la tarifa vuelven con `pendienteCype`: el
 * formulario las pide una a una a /api/propuesta/cype.
 */

export const maxDuration = 60;

const MAX_DICTADO = 8000;

export async function POST(request: NextRequest) {
    const sesion = await sesionApp();
    if (!sesion) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (!iaDisponible()) return NextResponse.json({ error: new IaNoConfiguradaError().message }, { status: 503 });

    let cuerpo: { modulos?: { key?: unknown; dictado?: unknown; fotos?: unknown }[] };
    try {
        cuerpo = await request.json();
    } catch {
        return NextResponse.json({ error: "Cuerpo de la peticion invalido" }, { status: 400 });
    }

    const modulos: DictadoModulo[] = [];
    for (const m of cuerpo.modulos ?? []) {
        const key = typeof m.key === "string" ? m.key : "";
        const dictado = typeof m.dictado === "string" ? m.dictado.trim().slice(0, MAX_DICTADO) : "";
        const modulo = getModulo(sesion.subcuenta, key);
        const fotos = Array.isArray(m.fotos) ? m.fotos.filter((u): u is string => typeof u === "string") : [];
        if (modulo && dictado) modulos.push({ key, label: modulo.label, dictado, fotos });
    }

    if (modulos.length === 0) {
        return NextResponse.json({ error: "No hay ningún dictado que analizar." }, { status: 400 });
    }

    try {
        const propuesta = await generarPropuesta(modulos);
        if (propuesta.lineas.length === 0) {
            return NextResponse.json(
                { error: "No se ha encontrado ningún trabajo en el dictado. Describe qué hay que hacer y con qué medidas." },
                { status: 422 }
            );
        }
        return NextResponse.json({ propuesta });
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        console.error("[propuesta] extraer:", mensaje);
        return NextResponse.json({ error: `No se ha podido generar la propuesta: ${mensaje}` }, { status: 502 });
    }
}
