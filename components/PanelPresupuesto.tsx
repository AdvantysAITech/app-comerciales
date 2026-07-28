"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ETAPAS_PRESUPUESTO, NOMBRE_ETAPA, type OportunidadListado } from "@/lib/ghl/oportunidades";

type Props = {
    oportunidades: OportunidadListado[];
};

const OPCIONES_ETAPA = [
    { value: "todas", label: "Todas las etapas" },
    ...ETAPAS_PRESUPUESTO.map((id) => ({ value: id, label: NOMBRE_ETAPA[id] })),
];

const OPCIONES_PERIODO = [
    { value: "todos", label: "Todo el tiempo" },
    { value: "este-mes", label: "Este mes" },
    { value: "mes-pasado", label: "Mes pasado" },
];

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

    const filtradas = useMemo(() => {
        const texto = busqueda.trim().toLowerCase();
        return oportunidades.filter((op) => {
            const coincideTexto =
                texto === "" ||
                (op.comunidadNombre ?? op.name).toLowerCase().includes(texto) ||
                (op.administrador.nombre ?? "").toLowerCase().includes(texto);
            const coincideEtapa = etapa === "todas" || op.pipelineStageId === etapa;
            const coincideFecha = coincidePeriodo(op.createdAt, periodo);
            return coincideTexto && coincideEtapa && coincideFecha;
        });
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

            {filtradas.length === 0 ? (
                <p className="mt-6 rounded-2xl border border-dashed border-hairline px-4 py-10 text-center text-sm text-muted">
                    Sin presupuestos que coincidan con la búsqueda
                </p>
            ) : (
                // 1 columna en móvil (las tarjetas ya no son cuadradas, necesitan más ancho para leerse bien)
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filtradas.map((op) => (
                        <Link
                            key={op.id}
                            href={`/oportunidades/${op.id}`}
                            className="group rounded-2xl border border-hairline bg-surface p-4 transition hover:border-ink/20"
                        >
                            <p className="line-clamp-2 font-medium text-ink">{op.comunidadNombre ?? op.name}</p>
                            <p className="mt-1 text-xs text-muted">
                                {op.modeloNegocio ?? "Sin modelo asignado"} · {op.administrador.nombre ?? "Sin administrador"}
                            </p>
                            <span className="mt-3 inline-block rounded-full border border-hairline px-2.5 py-1 text-[11px] font-medium text-ink">
                                {NOMBRE_ETAPA[op.pipelineStageId] ?? "—"}
                            </span>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}