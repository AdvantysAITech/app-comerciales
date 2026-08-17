"use client";

import { esPartida, ETIQUETA_UNIDAD, construirRuta, type NodoCatalogo, type ModuloTrabajo } from "@/lib/catalogo";
import {
    alternarNodo,
    estaSeleccionada,
    fijarCantidad,
    fijarNota,
    rutasDescendientes,
    type SeleccionVisita,
    type Subcuenta,
} from "@/lib/visita/seleccion";

/**
 * Renderizador recursivo del árbol de opciones.
 *
 * No conoce ningún módulo concreto: se llama a sí mismo por cada nivel. Ampliar
 * el catálogo NUNCA obliga a tocar este fichero, que es justo lo que pide el
 * punto 9 del brief del cliente.
 *
 * Los hijos de un nodo solo se pintan cuando el nodo está marcado. Así el
 * comercial ve una lista corta en pantalla (5 grupos) en vez de las 125 partidas
 * posibles de golpe.
 */

type Props = {
    subcuenta: Subcuenta;
    modulo: ModuloTrabajo;
    seleccion: SeleccionVisita;
    onSeleccionChange: (seleccion: SeleccionVisita) => void;
};

const ESTILO_CAMPO =
    "w-full rounded-xl border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-ink/30 focus:outline-none";

export function SelectorArbol({ subcuenta, modulo, seleccion, onSeleccionChange }: Props) {
    if (modulo.captura !== "arbol") {
        return (
            <p className="rounded-2xl border border-dashed border-hairline px-4 py-6 text-center text-sm text-muted">
                Este módulo todavía no tiene árbol de opciones definido.
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            {modulo.estructura.map((nodo) => (
                <NodoArbol
                    key={nodo.key}
                    subcuenta={subcuenta}
                    moduloKey={modulo.key}
                    nodo={nodo}
                    ancestros={[]}
                    profundidad={0}
                    seleccion={seleccion}
                    onSeleccionChange={onSeleccionChange}
                />
            ))}
        </div>
    );
}

type NodoProps = {
    subcuenta: Subcuenta;
    moduloKey: string;
    nodo: NodoCatalogo;
    ancestros: string[];
    profundidad: number;
    seleccion: SeleccionVisita;
    onSeleccionChange: (seleccion: SeleccionVisita) => void;
};

function NodoArbol({
    subcuenta,
    moduloKey,
    nodo,
    ancestros,
    profundidad,
    seleccion,
    onSeleccionChange,
}: NodoProps) {
    const keys = [...ancestros, nodo.key];
    const ruta = construirRuta(moduloKey, keys);
    const marcado = estaSeleccionada(seleccion, ruta);
    const hoja = esPartida(nodo);
    const hijos = nodo.hijos ?? [];

    // Solo se cuentan hojas marcadas: es lo que de verdad acaba en el presupuesto.
    const partidasDebajo = marcado
        ? rutasDescendientes(seleccion, ruta).filter((r) => {
              const nivelesExtra = r.slice(ruta.length + 1).split(".").length;
              return nivelesExtra >= 1 && !rutasDescendientes(seleccion, r).length;
          }).length
        : 0;

    const entrada = seleccion[ruta];

    return (
        <div className={profundidad > 0 ? "border-l border-hairline pl-3" : ""}>
            <button
                type="button"
                onClick={() => onSeleccionChange(alternarNodo(seleccion, subcuenta, ruta))}
                aria-pressed={marcado}
                // min-h-11: objetivo táctil cómodo. Esto se usa en obra, de pie y con sol.
                className={`flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                    marcado ? "border-ink/30 bg-ink/[0.04]" : "border-hairline hover:border-ink/20"
                }`}
            >
                <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                        marcado ? "border-ink bg-ink text-canvas" : "border-hairline"
                    }`}
                >
                    {marcado && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                            <path d="M20 6 9 17l-5-5" />
                        </svg>
                    )}
                </span>

                <span className={`flex-1 text-sm ${marcado ? "font-medium text-ink" : "text-ink"}`}>
                    {nodo.label}
                </span>

                {!hoja && partidasDebajo > 0 && (
                    <span className="shrink-0 rounded-full border border-hairline px-2 py-0.5 text-[11px] text-muted">
                        {partidasDebajo}
                    </span>
                )}

                {!hoja && hijos.length > 0 && (
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`h-4 w-4 shrink-0 text-muted transition-transform ${marcado ? "rotate-180" : ""}`}
                    >
                        <path d="m6 9 6 6 6-6" />
                    </svg>
                )}
            </button>

            {marcado && nodo.alerta && (
                <p className="mt-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    {nodo.alerta}
                </p>
            )}

            {marcado && hoja && nodo.medicion && (
                <div className="mt-1.5 flex items-center gap-2 pl-8">
                    <input
                        type="number"
                        // inputMode decimal: saca el teclado numérico en móvil sin pelearse con el tipo.
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={entrada?.cantidad ?? ""}
                        onChange={(e) =>
                            onSeleccionChange(
                                fijarCantidad(
                                    seleccion,
                                    ruta,
                                    e.target.value === "" ? undefined : Number(e.target.value)
                                )
                            )
                        }
                        placeholder="Medición"
                        className={`${ESTILO_CAMPO} max-w-32`}
                    />
                    <span className="text-xs text-muted">{ETIQUETA_UNIDAD[nodo.medicion.unidad]}</span>
                </div>
            )}

            {marcado && nodo.permiteTextoLibre && (
                <div className="mt-1.5 pl-8">
                    <textarea
                        rows={2}
                        value={entrada?.nota ?? ""}
                        onChange={(e) => onSeleccionChange(fijarNota(seleccion, ruta, e.target.value))}
                        placeholder="Describe la partida especial..."
                        className={`${ESTILO_CAMPO} resize-none`}
                    />
                </div>
            )}

            {marcado && hijos.length > 0 && (
                <div className="mt-1.5 flex flex-col gap-1.5">
                    {hijos.map((hijo) => (
                        <NodoArbol
                            key={hijo.key}
                            subcuenta={subcuenta}
                            moduloKey={moduloKey}
                            nodo={hijo}
                            ancestros={keys}
                            profundidad={profundidad + 1}
                            seleccion={seleccion}
                            onSeleccionChange={onSeleccionChange}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}