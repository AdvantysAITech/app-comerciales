"use client";

import { useEffect, useRef } from "react";

/**
 * Pestañas de los tipos de trabajo elegidos (29/09/2026).
 *
 * Antes cada tipo de trabajo añadía una sección completa (dictado + fotos)
 * debajo de la anterior: con tres o cuatro trabajos el formulario era una
 * tira larguísima y para llegar al último había que bajar y bajar, y para
 * volver a uno anterior, subir. En obra, con el móvil en una mano, era lo que
 * más molestaba.
 *
 * Ahora solo se ve UN trabajo a la vez. Arriba (móvil) o a la izquierda
 * (escritorio) están todos los elegidos como pestañas, cada una con su estado:
 * si le falta el dictado o fotos se ve sin tener que abrirla. Debajo del
 * contenido, "Anterior" / "Siguiente" para recorrerlos en orden sin volver
 * arriba.
 *
 * Este componente solo pinta la navegación: el contenido de la pestaña activa
 * lo pone el formulario como `children`.
 */

export type EstadoTrabajo = {
    key: string;
    label: string;
    /** Tiene dictado y las fotos mínimas. */
    completo: boolean;
    /** Texto corto bajo el nombre: "Falta dictado", "2 fotos"... */
    detalle: string;
};

type Props = {
    trabajos: EstadoTrabajo[];
    activo: string;
    onCambiar: (key: string) => void;
    children: React.ReactNode;
};

function Indicador({ completo }: { completo: boolean }) {
    return completo ? (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
                <path d="M20 6 9 17l-5-5" />
            </svg>
        </span>
    ) : (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
    );
}

export function PestanasTrabajos({ trabajos, activo, onCambiar, children }: Props) {
    const tiraRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const primerRender = useRef(true);

    const indice = Math.max(0, trabajos.findIndex((t) => t.key === activo));
    const anterior = indice > 0 ? trabajos[indice - 1] : null;
    const siguiente = indice < trabajos.length - 1 ? trabajos[indice + 1] : null;

    // Al cambiar de pestaña: la pestaña activa se centra en la tira (móvil) y,
    // si el comienzo del panel ha quedado fuera de pantalla (se venía de
    // "Siguiente", abajo del todo), se sube hasta él.
    useEffect(() => {
        const pestana = tiraRef.current?.querySelector<HTMLElement>(`[data-trabajo="${CSS.escape(activo)}"]`);
        pestana?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });

        if (primerRender.current) {
            primerRender.current = false;
            return;
        }
        const panel = panelRef.current;
        if (panel && panel.getBoundingClientRect().top < 0) {
            panel.scrollIntoView({ block: "start", behavior: "smooth" });
        }
    }, [activo]);

    const completos = trabajos.filter((t) => t.completo).length;

    return (
        <div className="lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-4">
            <div className="mb-3 flex items-center justify-between gap-2 lg:hidden">
                <p className="text-[11px] text-muted">
                    {completos} de {trabajos.length} {trabajos.length === 1 ? "trabajo listo" : "trabajos listos"}
                </p>
                <p className="text-[11px] text-muted">
                    {indice + 1} / {trabajos.length}
                </p>
            </div>

            {/* Móvil: tira horizontal deslizable. Escritorio: columna fija a la izquierda. */}
            <div
                ref={tiraRef}
                role="tablist"
                aria-label="Trabajos seleccionados"
                className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2 lg:sticky lg:top-4 lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0 lg:pb-0"
            >
                <p className="mb-1 hidden text-[11px] text-muted lg:block">
                    {completos} de {trabajos.length} {trabajos.length === 1 ? "trabajo listo" : "trabajos listos"}
                </p>
                {trabajos.map((t) => {
                    const seleccionada = t.key === activo;
                    return (
                        <button
                            key={t.key}
                            type="button"
                            role="tab"
                            aria-selected={seleccionada}
                            data-trabajo={t.key}
                            onClick={() => onCambiar(t.key)}
                            className={`flex min-h-11 shrink-0 snap-start cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-left transition lg:w-full ${
                                seleccionada
                                    ? "border-ink/40 bg-ink/[0.06] text-ink"
                                    : "border-hairline text-ink hover:border-ink/20"
                            }`}
                        >
                            <Indicador completo={t.completo} />
                            <span className="min-w-0">
                                <span className={`block truncate text-sm ${seleccionada ? "font-semibold" : ""}`}>
                                    {t.label}
                                </span>
                                <span
                                    className={`block truncate text-[11px] ${
                                        t.completo ? "text-muted" : "text-amber-700 dark:text-amber-400"
                                    }`}
                                >
                                    {t.detalle}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>

            <div ref={panelRef} role="tabpanel" className="min-w-0 scroll-mt-4">
                {children}

                {trabajos.length > 1 && (
                    <div className="mt-4 flex gap-2 border-t border-hairline pt-4">
                        <button
                            type="button"
                            disabled={!anterior}
                            onClick={() => anterior && onCambiar(anterior.key)}
                            className="min-w-0 flex-1 cursor-pointer truncate rounded-xl border border-hairline px-3 py-2.5 text-sm text-ink transition hover:border-ink/30 disabled:cursor-default disabled:opacity-30"
                        >
                            ← {anterior ? anterior.label : "Anterior"}
                        </button>
                        <button
                            type="button"
                            disabled={!siguiente}
                            onClick={() => siguiente && onCambiar(siguiente.key)}
                            className="min-w-0 flex-1 cursor-pointer truncate rounded-xl border border-hairline px-3 py-2.5 text-sm text-ink transition hover:border-ink/30 disabled:cursor-default disabled:opacity-30"
                        >
                            {siguiente ? siguiente.label : "Siguiente"} →
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}