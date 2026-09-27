"use client";

import { useMemo, useState } from "react";
import { normalizarNombre } from "@/lib/texto";

/**
 * Paso previo al formulario: "¿Qué finca vas a visitar?" (27/09/2026).
 *
 * Antes la comunidad se tecleaba en un campo del formulario y, si no casaba con
 * ninguna, se creaba al guardar. El alta existía (botón "+ Nueva"), pero estaba
 * escondida entre los datos generales y los comerciales no la encontraban. Aquí
 * es lo primero que se ve: o eliges una comunidad del CRM o la creas, y solo
 * entonces se abre el formulario.
 *
 * El alta en sí la sigue haciendo `AltaRapida` (modales), que pinta el padre:
 * este componente solo busca y avisa.
 */

type ComunidadListado = { id: string; nombreDireccion: string; administradorId?: string };
type AdministradorListado = { id: string; nombreDespacho?: string };

type Props = {
    comunidades: ComunidadListado[];
    administradores: AdministradorListado[];
    /** Hay una comunidad ya elegida: se ofrece volver sin cambiarla. */
    actual?: string | null;
    onElegir: (comunidad: ComunidadListado) => void;
    onCrearComunidad: (nombreInicial: string) => void;
    onCrearAdministrador: () => void;
    onCancelar?: () => void;
};

const MAXIMO_RESULTADOS = 8;

export function PasoFinca({
    comunidades,
    administradores,
    actual = null,
    onElegir,
    onCrearComunidad,
    onCrearAdministrador,
    onCancelar,
}: Props) {
    const [consulta, setConsulta] = useState("");

    const nombreAdministrador = useMemo(
        () => new Map(administradores.map((a) => [a.id, a.nombreDespacho ?? "(sin nombre)"])),
        [administradores]
    );

    const resultados = useMemo(() => {
        const texto = normalizarNombre(consulta);
        if (texto.length < 2) return [];
        return comunidades
            .filter((c) => normalizarNombre(c.nombreDireccion).includes(texto))
            .slice(0, MAXIMO_RESULTADOS);
    }, [comunidades, consulta]);

    const buscando = normalizarNombre(consulta).length >= 2;

    return (
        <div className="flex flex-col gap-3">
            <section className="rounded-2xl border border-hairline bg-surface p-4">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted">
                    ¿Qué finca vas a visitar?
                </p>

                <input
                    type="text"
                    autoFocus
                    aria-label="Buscar comunidad"
                    value={consulta}
                    onChange={(e) => setConsulta(e.target.value)}
                    placeholder="Calle y número"
                    className="w-full rounded-xl border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-ink/30 focus:outline-none"
                />

                {buscando && (
                    <div className="mt-2 flex flex-col gap-1.5">
                        {resultados.map((c) => (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => onElegir(c)}
                                className="cursor-pointer rounded-xl border border-hairline px-3 py-2.5 text-left transition hover:border-ink/30"
                            >
                                <span className="block text-sm text-ink">{c.nombreDireccion}</span>
                                <span className="mt-0.5 block text-[11px] text-muted">
                                    {c.administradorId
                                        ? nombreAdministrador.get(c.administradorId) ?? "Administrador del CRM"
                                        : "Sin administrador"}
                                </span>
                            </button>
                        ))}

                        {resultados.length === 0 && (
                            <p className="px-1 py-2 text-xs text-muted">No hay ninguna comunidad con ese nombre.</p>
                        )}
                    </div>
                )}

                <button
                    type="button"
                    onClick={() => onCrearComunidad(consulta.trim())}
                    className={`mt-3 w-full cursor-pointer rounded-xl py-3 text-sm font-semibold transition ${
                        buscando && resultados.length === 0
                            ? "bg-ink text-canvas"
                            : "border border-hairline text-ink hover:border-ink/30"
                    }`}
                >
                    + Crear comunidad nueva
                </button>
            </section>

            <section className="flex items-center justify-between gap-3 rounded-2xl border border-hairline bg-surface p-4">
                <p className="text-xs text-muted">¿El administrador no está en el CRM?</p>
                <button
                    type="button"
                    onClick={onCrearAdministrador}
                    className="shrink-0 cursor-pointer rounded-lg border border-hairline px-2.5 py-1.5 text-xs font-medium text-ink transition hover:border-ink/30"
                >
                    + Crear administrador
                </button>
            </section>

            {actual && onCancelar && (
                <button
                    type="button"
                    onClick={onCancelar}
                    className="cursor-pointer rounded-xl border border-hairline py-2.5 text-sm text-ink transition hover:bg-surface"
                >
                    Seguir con {actual}
                </button>
            )}
        </div>
    );
}
