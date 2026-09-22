"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { LogoSubcuenta } from "@/components/LogoSubcuenta";
import { SUBCUENTAS, type SubcuentaSlug } from "@/lib/subcuenta";
import { cambiarSubcuenta } from "@/app/actions/subcuenta";

type Props = {
    /** Subcuentas del usuario. Con una sola, esto es el logo de siempre. */
    subcuentas: readonly SubcuentaSlug[];
    activa: SubcuentaSlug;
};

/**
 * Conmutador de subcuenta para los perfiles multi-subcuenta (DERCAS 9.1).
 *
 * Ocupa el sitio del logo en la cabecera del dashboard: es el sitio donde el
 * usuario ya mira para saber en que empresa esta, y deja claro que lo que
 * cambia es TODA la pantalla, no un filtro del listado.
 *
 * Con una sola subcuenta se pinta el logo tal cual, sin boton ni chevron: Jose
 * y Toni no tienen nada que conmutar y no deben ver ni el gesto.
 */
export function SelectorSubcuenta({ subcuentas, activa }: Props) {
    const [abierto, setAbierto] = useState(false);
    const [pendiente, iniciarTransicion] = useTransition();
    const contenedor = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!abierto) return;

        function alPulsarFuera(evento: MouseEvent) {
            if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false);
        }
        function alEscape(evento: KeyboardEvent) {
            if (evento.key === "Escape") setAbierto(false);
        }

        document.addEventListener("mousedown", alPulsarFuera);
        document.addEventListener("keydown", alEscape);
        return () => {
            document.removeEventListener("mousedown", alPulsarFuera);
            document.removeEventListener("keydown", alEscape);
        };
    }, [abierto]);

    if (subcuentas.length <= 1) {
        return <LogoSubcuenta subcuenta={activa} variante="completo" alto={36} priority />;
    }

    function seleccionar(slug: SubcuentaSlug) {
        setAbierto(false);
        if (slug === activa) return;
        iniciarTransicion(() => {
            void cambiarSubcuenta(slug);
        });
    }

    return (
        <div ref={contenedor} className="relative">
            <button
                type="button"
                onClick={() => setAbierto((v) => !v)}
                disabled={pendiente}
                aria-haspopup="listbox"
                aria-expanded={abierto}
                aria-label={`Subcuenta activa: ${SUBCUENTAS[activa].nombre}. Cambiar de subcuenta`}
                className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1 transition hover:bg-ink/5 disabled:opacity-50"
            >
                <LogoSubcuenta subcuenta={activa} variante="completo" alto={36} priority />
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`h-4 w-4 shrink-0 text-muted transition-transform ${abierto ? "rotate-180" : ""}`}
                >
                    <path d="m6 9 6 6 6-6" />
                </svg>
            </button>

            {abierto && (
                <ul
                    role="listbox"
                    className="absolute left-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-hairline bg-surface p-1.5 shadow-lg"
                >
                    {subcuentas.map((slug) => {
                        const seleccionada = slug === activa;
                        return (
                            <li key={slug}>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={seleccionada}
                                    onClick={() => seleccionar(slug)}
                                    className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                                        seleccionada ? "bg-ink/5 font-medium text-ink" : "text-ink hover:bg-ink/5"
                                    }`}
                                >
                                    <span className="flex min-w-0 items-center gap-2.5">
                                        <LogoSubcuenta subcuenta={slug} variante="isotipo" alto={18} />
                                        <span className="truncate">{SUBCUENTAS[slug].nombre}</span>
                                    </span>
                                    {seleccionada && (
                                        <svg
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className="h-4 w-4 shrink-0"
                                        >
                                            <path d="M20 6 9 17l-5-5" />
                                        </svg>
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
