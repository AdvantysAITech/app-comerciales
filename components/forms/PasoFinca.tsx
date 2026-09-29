"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
 * DESPLEGABLE (29/09/2026): la lista ya no espera a que se escriban dos letras.
 * En cuanto el comercial toca la casilla se despliegan TODAS las comunidades de
 * la subcuenta (orden alfabético) y se van filtrando mientras escribe. La
 * opción de crear vive dentro del propio desplegable, fija abajo para que no se
 * pierda con el scroll, y solo propone el texto escrito cuando no coincide
 * exacto con una comunidad existente (si coincide, lo que toca es elegirla).
 *
 * El alta en sí la sigue haciendo `AltaRapida` (modales), que pinta el padre:
 * este componente solo busca y avisa. El antiduplicados de parecidos sigue en
 * el modal de alta.
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

/**
 * Tope de filas pintadas. No es por GHL (la lista ya viene entera del
 * servidor), es por el móvil: cientos de botones en un desplegable con scroll
 * se notan. Si hay más, se pide que afine escribiendo.
 */
const MAXIMO_VISIBLES = 150;

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
    // Abierta de entrada: este paso existe solo para elegir finca, así que la
    // lista se ve sin tener que tocar nada (y se reabre al tocar la casilla).
    const [abierto, setAbierto] = useState(true);
    /** Índice de la opción resaltada con teclado. `visibles.length` = "Crear". */
    const [activo, setActivo] = useState(-1);

    const listaRef = useRef<HTMLUListElement>(null);
    const idLista = useId();

    const nombreAdministrador = useMemo(
        () => new Map(administradores.map((a) => [a.id, a.nombreDespacho ?? "(sin nombre)"])),
        [administradores]
    );

    /** Orden alfabético una sola vez; el filtro trabaja sobre esta copia. */
    const ordenadas = useMemo(
        () =>
            [...comunidades]
                .map((c) => ({ ...c, clave: normalizarNombre(c.nombreDireccion) }))
                .sort((a, b) => a.nombreDireccion.localeCompare(b.nombreDireccion, "es", { numeric: true })),
        [comunidades]
    );

    const texto = normalizarNombre(consulta);

    const filtradas = useMemo(
        () => (texto === "" ? ordenadas : ordenadas.filter((c) => c.clave.includes(texto))),
        [ordenadas, texto]
    );

    const visibles = filtradas.slice(0, MAXIMO_VISIBLES);
    const hayCoincidenciaExacta = texto !== "" && ordenadas.some((c) => c.clave === texto);
    const ofrecerConNombre = texto !== "" && !hayCoincidenciaExacta;
    const indiceCrear = visibles.length;

    // La lista NO se cierra al tocar fuera (29/09/2026): en el móvil, deslizar
    // la página para ver más cuenta como "tocar fuera", la lista se cerraba y
    // con ella desaparecía "+ Crear comunidad", que es justo lo que este paso
    // tiene que dejar a mano. Se pliega con la flecha o con Escape.

    // Mantener visible la opción resaltada con teclado.
    useEffect(() => {
        if (activo < 0 || !listaRef.current) return;
        const fila = listaRef.current.querySelector<HTMLElement>(`[data-indice="${activo}"]`);
        fila?.scrollIntoView({ block: "nearest" });
    }, [activo]);

    function crear() {
        setAbierto(false);
        onCrearComunidad(ofrecerConNombre ? consulta.trim() : "");
    }

    function elegir(c: ComunidadListado) {
        setAbierto(false);
        onElegir({ id: c.id, nombreDireccion: c.nombreDireccion, administradorId: c.administradorId });
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setAbierto(true);
            setActivo((i) => (i >= indiceCrear ? 0 : i + 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAbierto(true);
            setActivo((i) => (i <= 0 ? indiceCrear : i - 1));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (activo >= 0 && activo < visibles.length) elegir(visibles[activo]);
            else if (activo === indiceCrear) crear();
            else if (visibles.length === 1) elegir(visibles[0]);
        } else if (e.key === "Escape") {
            setAbierto(false);
        }
    }

    return (
        <div className="flex flex-col gap-3">
            <section className="rounded-2xl border border-hairline bg-surface p-4">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted">
                    ¿Qué finca vas a visitar?
                </p>

                <div>
                    <div className="relative">
                        <input
                            type="text"
                            autoFocus
                            role="combobox"
                            aria-label="Buscar comunidad"
                            aria-expanded={abierto}
                            aria-controls={abierto ? idLista : undefined}
                            aria-activedescendant={
                                abierto && activo >= 0 ? `${idLista}-${activo}` : undefined
                            }
                            aria-autocomplete="list"
                            autoComplete="off"
                            value={consulta}
                            onFocus={() => setAbierto(true)}
                            onClick={() => setAbierto(true)}
                            onChange={(e) => {
                                setConsulta(e.target.value);
                                setAbierto(true);
                                setActivo(-1);
                            }}
                            onKeyDown={onKeyDown}
                            placeholder="Buscar comunidad (calle y número)"
                            className="w-full rounded-xl border border-hairline bg-canvas py-2.5 pl-3 pr-10 text-sm text-ink placeholder:text-muted focus:border-ink/30 focus:outline-none"
                        />
                        <button
                            type="button"
                            tabIndex={-1}
                            aria-label={abierto ? "Cerrar lista" : "Ver todas las comunidades"}
                            onClick={() => setAbierto((v) => !v)}
                            className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center text-muted"
                        >
                            <svg
                                viewBox="0 0 20 20"
                                className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                aria-hidden="true"
                            >
                                <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    </div>

                    {abierto && (
                        <div className="mt-2 overflow-hidden rounded-xl border border-hairline bg-canvas">
                            <p className="border-b border-hairline px-3 py-1.5 text-[11px] text-muted">
                                {texto === ""
                                    ? `${ordenadas.length} comunidades`
                                    : `${filtradas.length} de ${ordenadas.length} comunidades`}
                            </p>

                            <ul
                                id={idLista}
                                ref={listaRef}
                                role="listbox"
                                aria-label="Comunidades"
                                className="max-h-[45vh] overflow-y-auto overscroll-contain"
                            >
                                {visibles.map((c, i) => (
                                    <li
                                        key={c.id}
                                        id={`${idLista}-${i}`}
                                        role="option"
                                        aria-selected={activo === i}
                                        data-indice={i}
                                        onMouseEnter={() => setActivo(i)}
                                        onClick={() => elegir(c)}
                                        className={`cursor-pointer border-b border-hairline/60 px-3 py-2.5 last:border-b-0 ${
                                            activo === i ? "bg-surface" : "hover:bg-surface"
                                        }`}
                                    >
                                        <span className="block text-sm text-ink">{c.nombreDireccion}</span>
                                        <span className="mt-0.5 block text-[11px] text-muted">
                                            {c.administradorId
                                                ? nombreAdministrador.get(c.administradorId) ?? "Administrador del CRM"
                                                : "Sin administrador"}
                                        </span>
                                    </li>
                                ))}

                                {filtradas.length > MAXIMO_VISIBLES && (
                                    <li className="px-3 py-2 text-[11px] text-muted">
                                        Hay {filtradas.length - MAXIMO_VISIBLES} más. Escribe para afinar la búsqueda.
                                    </li>
                                )}

                                {visibles.length === 0 && (
                                    <li className="px-3 py-3 text-xs text-muted">
                                        {ordenadas.length === 0
                                            ? "Todavía no hay comunidades en esta cuenta."
                                            : "No hay ninguna comunidad con ese nombre."}
                                    </li>
                                )}
                            </ul>

                            {/* Crear: fuera del scroll para que siempre se vea. */}
                            <button
                                type="button"
                                id={`${idLista}-${indiceCrear}`}
                                data-indice={indiceCrear}
                                onMouseEnter={() => setActivo(indiceCrear)}
                                onClick={crear}
                                className={`w-full cursor-pointer border-t border-hairline px-3 py-3 text-left text-sm font-semibold transition ${
                                    ofrecerConNombre && visibles.length === 0
                                        ? "bg-ink text-canvas"
                                        : activo === indiceCrear
                                          ? "bg-surface text-ink"
                                          : "text-ink hover:bg-surface"
                                }`}
                            >
                                {ofrecerConNombre ? (
                                    <>
                                        + Crear comunidad «<span className="break-words">{consulta.trim()}</span>»
                                    </>
                                ) : (
                                    "+ Crear comunidad nueva"
                                )}
                            </button>
                        </div>
                    )}
                </div>
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