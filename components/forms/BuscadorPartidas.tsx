"use client";

import { useMemo, useState } from "react";
import { ETIQUETA_UNIDAD, type ModuloTrabajo } from "@/lib/catalogo";
import {
    buscarPartidas,
    KEY_TEXTO_LIBRE_BUSCADOR,
    MINIMO_CARACTERES_BUSQUEDA,
} from "@/lib/catalogo/buscador";
import {
    alternarNodo,
    estaSeleccionada,
    fijarCantidad,
    fijarNota,
    partidasDeModulo,
    type SeleccionVisita,
    type Subcuenta,
} from "@/lib/visita/seleccion";

/**
 * Buscador de partidas del módulo Varios.
 *
 * El esquema del cliente lo pide así: "un buscador para añadir alguna cosa
 * especial". La tarifa tiene 199 partidas; como casillas serían inmanejables en
 * un móvil, así que el comercial escribe y elige.
 *
 * No tiene estado propio de negocio: marca y mide rutas con las mismas funciones
 * que `SelectorArbol`, así que borrador, validación y payload no distinguen
 * entre una partida buscada y una marcada en un árbol.
 */

type Props = {
    subcuenta: Subcuenta;
    modulo: ModuloTrabajo;
    seleccion: SeleccionVisita;
    onSeleccionChange: (seleccion: SeleccionVisita) => void;
};

const ESTILO_CAMPO =
    "w-full rounded-xl border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-ink/30 focus:outline-none";

export function BuscadorPartidas({ subcuenta, modulo, seleccion, onSeleccionChange }: Props) {
    const [consulta, setConsulta] = useState("");

    const elegidas = useMemo(
        () => partidasDeModulo(subcuenta, modulo.key, seleccion).filter((p) => p.unidad !== undefined),
        [subcuenta, modulo.key, seleccion]
    );

    const resultados = useMemo(
        () =>
            buscarPartidas(modulo.key, modulo.estructura, consulta).filter(
                (r) => !estaSeleccionada(seleccion, r.ruta)
            ),
        [modulo.key, modulo.estructura, consulta, seleccion]
    );

    const rutaTextoLibre = `${modulo.key}.${KEY_TEXTO_LIBRE_BUSCADOR}`;
    const textoLibreMarcado = estaSeleccionada(seleccion, rutaTextoLibre);
    const consultaCorta = consulta.trim().length < MINIMO_CARACTERES_BUSQUEDA;

    function anadir(ruta: string) {
        onSeleccionChange(alternarNodo(seleccion, subcuenta, ruta));
        setConsulta("");
    }

    return (
        <div className="flex flex-col gap-3">
            {elegidas.length > 0 && (
                <ul className="flex flex-col gap-2">
                    {elegidas.map((p) => (
                        <li key={p.ruta} className="rounded-xl border border-ink/30 bg-ink/[0.04] px-3 py-2">
                            <div className="flex items-start justify-between gap-3">
                                <p className="text-sm font-medium text-ink">{p.label}</p>
                                <button
                                    type="button"
                                    onClick={() => onSeleccionChange(alternarNodo(seleccion, subcuenta, p.ruta))}
                                    className="min-h-8 shrink-0 cursor-pointer rounded-lg px-2 text-xs text-muted hover:text-ink"
                                >
                                    Quitar
                                </button>
                            </div>
                            <p className="text-[11px] text-muted">
                                {p.ruta.split(".").pop()?.toUpperCase()} · {p.caminoLabels[0]}
                            </p>
                            <div className="mt-1.5 flex items-center gap-2">
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    step="any"
                                    value={p.cantidad ?? ""}
                                    onChange={(e) =>
                                        onSeleccionChange(
                                            fijarCantidad(
                                                seleccion,
                                                p.ruta,
                                                e.target.value === "" ? undefined : Number(e.target.value)
                                            )
                                        )
                                    }
                                    placeholder="Medición"
                                    aria-label={`Medición de ${p.label}`}
                                    className={`${ESTILO_CAMPO} max-w-32`}
                                />
                                <span className="text-xs text-muted">{p.unidad && ETIQUETA_UNIDAD[p.unidad]}</span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <div>
                <label htmlFor={`buscar-${modulo.key}`} className="mb-1.5 block text-xs text-muted">
                    Añadir partida de la tarifa
                </label>
                <input
                    id={`buscar-${modulo.key}`}
                    type="search"
                    value={consulta}
                    onChange={(e) => setConsulta(e.target.value)}
                    placeholder="Contenedor, línea de vida, arqueta..."
                    autoComplete="off"
                    className={ESTILO_CAMPO}
                />
            </div>

            {!consultaCorta && resultados.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                    {resultados.map((r) => (
                        <li key={r.ruta}>
                            <button
                                type="button"
                                onClick={() => anadir(r.ruta)}
                                className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl border border-hairline px-3 py-2 text-left transition hover:border-ink/20"
                            >
                                <span className="flex-1">
                                    <span className="block text-sm text-ink">{r.descripcion}</span>
                                    <span className="block text-[11px] text-muted">
                                        {r.codigo} · {r.capitulo}
                                    </span>
                                </span>
                                <span className="shrink-0 text-xs text-muted">
                                    {r.unidad && ETIQUETA_UNIDAD[r.unidad]}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {!consultaCorta && resultados.length === 0 && (
                <p className="rounded-xl border border-dashed border-hairline px-3 py-3 text-xs text-muted">
                    Ninguna partida de la tarifa coincide con «{consulta.trim()}». Si el trabajo no está en la
                    tarifa, descríbelo abajo.
                </p>
            )}

            <div className="border-t border-hairline pt-3">
                <button
                    type="button"
                    onClick={() => onSeleccionChange(alternarNodo(seleccion, subcuenta, rutaTextoLibre))}
                    aria-pressed={textoLibreMarcado}
                    className={`flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                        textoLibreMarcado ? "border-ink/30 bg-ink/[0.04]" : "border-hairline hover:border-ink/20"
                    }`}
                >
                    <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                            textoLibreMarcado ? "border-ink bg-ink text-canvas" : "border-hairline"
                        }`}
                    >
                        {textoLibreMarcado && (
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-3 w-3"
                            >
                                <path d="M20 6 9 17l-5-5" />
                            </svg>
                        )}
                    </span>
                    <span className="flex-1 text-sm text-ink">Trabajo que no está en la tarifa</span>
                </button>

                {textoLibreMarcado && (
                    <div className="mt-1.5 pl-8">
                        <textarea
                            rows={2}
                            value={seleccion[rutaTextoLibre]?.nota ?? ""}
                            onChange={(e) => onSeleccionChange(fijarNota(seleccion, rutaTextoLibre, e.target.value))}
                            placeholder="Describe el trabajo. Dirección lo valorará a mano."
                            className={`${ESTILO_CAMPO} resize-none`}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}