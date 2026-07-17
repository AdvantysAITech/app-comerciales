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
            <div className="flex flex-col gap-3 sm:flex-row">
                <input
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por comunidad o administrador..."
                    className="w-full rounded-2xl border border-hairline bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
                />
                <div className="flex gap-2">
                    <select
                        value={etapa}
                        onChange={(e) => setEtapa(e.target.value)}
                        className="rounded-2xl border border-hairline bg-surface px-3 py-2.5 text-sm text-ink focus:border-accent focus:outline-none"
                    >
                        {OPCIONES_ETAPA.map((op) => (
                            <option key={op.value} value={op.value}>{op.label}</option>
                        ))}
                    </select>
                    <select
                        value={periodo}
                        onChange={(e) => setPeriodo(e.target.value)}
                        className="rounded-2xl border border-hairline bg-surface px-3 py-2.5 text-sm text-ink focus:border-accent focus:outline-none"
                    >
                        {OPCIONES_PERIODO.map((op) => (
                            <option key={op.value} value={op.value}>{op.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {filtradas.length === 0 ? (
                <p className="mt-8 rounded-2xl border border-dashed border-hairline px-4 py-10 text-center text-sm text-muted">
                    Sin presupuestos que coincidan con la búsqueda
                </p>
            ) : (
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {filtradas.map((op) => (
                        <Link
                            key={op.id}
                            href={`/oportunidades/${op.id}`}
                            className="group flex aspect-square flex-col justify-between rounded-3xl border border-hairline bg-surface p-4 shadow-sm transition hover:border-accent/40"
                        >
                            <div>
                                <p className="line-clamp-2 font-medium text-ink">{op.comunidadNombre ?? op.name}</p>
                                <p className="mt-1 text-xs text-muted">{op.modeloNegocio ?? "Sin modelo asignado"}</p>
                            </div>
                            <div>
                                <p className="truncate text-xs text-muted">{op.administrador.nombre ?? "Sin administrador"}</p>
                                <span className="mt-2 inline-block rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
                                    {NOMBRE_ETAPA[op.pipelineStageId] ?? "—"}
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}