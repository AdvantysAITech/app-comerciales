"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { OportunidadListado } from "@/lib/ghl/oportunidades";
import { ETAPAS_PRESUPUESTO, NOMBRE_ETAPA } from "@/lib/ghl/ids";
import { clasificar, type Clasificacion, type Columna, type TonoEtiqueta } from "@/lib/panel";

/**
 * Panel de presupuestos en dos columnas (27/09/2026): borradores a la izquierda,
 * documentos generados a la derecha con su etiqueta "Por revisar" / "Revisado".
 * El reparto vive en lib/panel.ts.
 *
 * En el teléfono dos columnas no caben: se ve una y se cambia con el selector
 * de arriba. Desde `lg` se ven las dos a la vez y el selector desaparece.
 */

type Props = {
    oportunidades: OportunidadListado[];
};

type Clasificada = OportunidadListado & { clasificacion: Clasificacion };

const OPCIONES_ETAPA = [
    { value: "todas", label: "Todas las etapas" },
    ...ETAPAS_PRESUPUESTO.map((clave) => ({ value: clave, label: NOMBRE_ETAPA[clave] })),
];

const OPCIONES_PERIODO = [
    { value: "todos", label: "Todo el tiempo" },
    { value: "este-mes", label: "Este mes" },
    { value: "mes-pasado", label: "Mes pasado" },
];

const COLUMNAS: { clave: Columna; titulo: string; vacio: string }[] = [
    { clave: "borrador", titulo: "Borradores", vacio: "Sin borradores" },
    { clave: "generado", titulo: "Generados", vacio: "Sin presupuestos generados" },
];

const ESTILO_TONO: Record<TonoEtiqueta, string> = {
    lleno: "border border-ink bg-ink text-canvas",
    borde: "border border-ink/40 text-ink",
    tenue: "border border-hairline text-muted",
};

function coincidePeriodo(fechaISO: string, periodo: string): boolean {
    if (periodo === "todos") return true;
    const fecha = new Date(fechaISO);
    const ahora = new Date();
    const inicioMesActual = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const inicioMesPasado = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);

    if (periodo === "este-mes") return fecha >= inicioMesActual;
    if (periodo === "mes-pasado") return fecha >= inicioMesPasado && fecha < inicioMesActual;
    return true;
}

export function PanelPresupuestos({ oportunidades }: Props) {
    const [busqueda, setBusqueda] = useState("");
    const [etapa, setEtapa] = useState("todas");
    const [periodo, setPeriodo] = useState("todos");
    // Solo manda en móvil: en pantalla grande se ven las dos columnas.
    const [columnaMovil, setColumnaMovil] = useState<Columna>("borrador");

    const porColumna = useMemo(() => {
        const texto = busqueda.trim().toLowerCase();
        const grupos: Record<Columna, Clasificada[]> = { borrador: [], generado: [] };

        for (const op of oportunidades) {
            const coincideTexto =
                texto === "" ||
                (op.comunidadNombre ?? op.name).toLowerCase().includes(texto) ||
                (op.administrador.nombre ?? "").toLowerCase().includes(texto);
            const coincideEtapa = etapa === "todas" || op.etapa === etapa;
            if (!coincideTexto || !coincideEtapa || !coincidePeriodo(op.createdAt, periodo)) continue;

            const clasificacion = clasificar(op);
            grupos[clasificacion.columna].push({ ...op, clasificacion });
        }

        // Dentro de generados, lo que hay que revisar va primero: es lo que el
        // comercial viene a buscar.
        grupos.generado.sort(
            (a, b) => Number(b.clasificacion.porRevisar) - Number(a.clasificacion.porRevisar)
        );

        return grupos;
    }, [oportunidades, busqueda, etapa, periodo]);

    return (
        <div className="mt-6">
            {/* Barra de cristal: agrupa buscador + filtros como una sola pieza, apilada en móvil */}
            <div className="flex flex-col gap-2 rounded-2xl border border-hairline bg-ink/[0.04] p-2 backdrop-blur-md sm:flex-row sm:items-center">
                <div className="relative flex-1">
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                    >
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.3-4.3" />
                    </svg>
                    <input
                        type="text"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Buscar por comunidad o administrador..."
                        className="w-full rounded-xl bg-transparent py-2 pl-10 pr-3 text-sm text-ink placeholder:text-muted focus:outline-none"
                    />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                    <select
                        value={etapa}
                        onChange={(e) => setEtapa(e.target.value)}
                        className="min-w-0 cursor-pointer rounded-xl bg-surface/70 px-3 py-2 text-xs text-ink focus:outline-none sm:text-sm"
                    >
                        {OPCIONES_ETAPA.map((op) => (
                            <option key={op.value} value={op.value}>{op.label}</option>
                        ))}
                    </select>
                    <select
                        value={periodo}
                        onChange={(e) => setPeriodo(e.target.value)}
                        className="min-w-0 cursor-pointer rounded-xl bg-surface/70 px-3 py-2 text-xs text-ink focus:outline-none sm:text-sm"
                    >
                        {OPCIONES_PERIODO.map((op) => (
                            <option key={op.value} value={op.value}>{op.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Selector de columna: solo móvil */}
            <div
                role="tablist"
                aria-label="Tipo de presupuesto"
                className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-hairline bg-ink/[0.04] p-1 lg:hidden"
            >
                {COLUMNAS.map((c) => {
                    const activa = columnaMovil === c.clave;
                    return (
                        <button
                            key={c.clave}
                            type="button"
                            role="tab"
                            aria-selected={activa}
                            onClick={() => setColumnaMovil(c.clave)}
                            className={`cursor-pointer rounded-lg py-2 text-sm transition ${
                                activa ? "bg-surface font-medium text-ink shadow-sm" : "text-muted"
                            }`}
                        >
                            {c.titulo} ({porColumna[c.clave].length})
                        </button>
                    );
                })}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-6 lg:mt-5 lg:grid-cols-2">
                {COLUMNAS.map((c) => (
                    <section
                        key={c.clave}
                        aria-label={c.titulo}
                        className={columnaMovil === c.clave ? "block" : "hidden lg:block"}
                    >
                        <h2 className="mb-3 hidden items-baseline gap-2 text-sm font-semibold text-ink lg:flex">
                            {c.titulo}
                            <span className="text-xs font-normal text-muted">{porColumna[c.clave].length}</span>
                        </h2>

                        {porColumna[c.clave].length === 0 ? (
                            <p className="rounded-2xl border border-dashed border-hairline px-4 py-10 text-center text-sm text-muted">
                                {c.vacio}
                            </p>
                        ) : (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                                {porColumna[c.clave].map((op) => (
                                    <Tarjeta key={op.id} op={op} />
                                ))}
                            </div>
                        )}
                    </section>
                ))}
            </div>
        </div>
    );
}

function Tarjeta({ op }: { op: Clasificada }) {
    const { etiqueta, tono } = op.clasificacion;
    // La etapa solo se añade cuando dice algo que la etiqueta no dice:
    // "Revisado" puede estar enviado, en negociación o ganado. Validado pero aún
    // en "Presupuesto en revisión" (el workflow no lo ha movido) no se detalla:
    // leer "Revisado · Presupuesto en revisión" confunde.
    const detalleEtapa =
        etiqueta === "Revisado" && op.etapa && op.etapa !== "PRESUPUESTO_EN_REVISION"
            ? NOMBRE_ETAPA[op.etapa]
            : null;

    return (
        <Link
            href={`/oportunidades/${op.id}`}
            className="group rounded-2xl border border-hairline bg-surface p-4 transition hover:border-ink/20"
        >
            <p className="line-clamp-2 font-medium text-ink">{op.comunidadNombre ?? op.name}</p>
            <p className="mt-1 text-xs text-muted">
                {op.modeloNegocio ?? "Sin modelo asignado"} · {op.administrador.nombre ?? "Sin administrador"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-medium ${ESTILO_TONO[tono]}`}>
                    {etiqueta}
                </span>
                {detalleEtapa && <span className="text-[11px] text-muted">{detalleEtapa}</span>}
            </div>
        </Link>
    );
}
