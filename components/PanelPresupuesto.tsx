"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { OportunidadListado } from "@/lib/ghl/oportunidades";
import { ETAPAS_PRESUPUESTO, NOMBRE_ETAPA } from "@/lib/ghl/ids";
import { clasificar, type Clasificacion, type Columna, type TonoEtiqueta } from "@/lib/panel";
import type { ResumenBorrador } from "@/lib/borradores/almacen";
import { describirAntiguedad } from "@/lib/visita/borrador";

/**
 * Panel de presupuestos en dos columnas (27/09/2026): borradores a la izquierda,
 * documentos generados a la derecha con su etiqueta "Por revisar" / "Revisado".
 * El reparto vive en lib/panel.ts.
 *
 * En el teléfono dos columnas no caben: se ve una y se cambia con el selector
 * de arriba. Desde `lg` se ven las dos a la vez y el selector desaparece.
 *
 * Borradores de la app (27/09/2026): viven en Upstash, no en GHL, y se pintan
 * en la columna Borradores junto a las oportunidades en "Visita concertada".
 * Si un borrador sale de una de esas oportunidades, se ve el borrador y no la
 * oportunidad: son la misma visita.
 */

type Props = {
    oportunidades: OportunidadListado[];
    borradores?: ResumenBorrador[];
    /** Dirección ve los borradores de todos: se indica de quién es cada uno. */
    mostrarAutor?: boolean;
};

type Clasificada = OportunidadListado & { clasificacion: Clasificacion };

type Elemento =
    | { tipo: "oportunidad"; op: Clasificada; fecha: string }
    | { tipo: "borrador"; borrador: ResumenBorrador; fecha: string };

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

export function PanelPresupuestos({ oportunidades, borradores = [], mostrarAutor = false }: Props) {
    const [busqueda, setBusqueda] = useState("");
    const [etapa, setEtapa] = useState("todas");
    const [periodo, setPeriodo] = useState("todos");
    // Solo manda en móvil: en pantalla grande se ven las dos columnas.
    const [columnaMovil, setColumnaMovil] = useState<Columna>("borrador");

    const porColumna = useMemo(() => {
        const texto = busqueda.trim().toLowerCase();
        const grupos: Record<Columna, Elemento[]> = { borrador: [], generado: [] };
        const conBorrador = new Set(borradores.map((b) => b.oportunidadId).filter(Boolean));

        // Los borradores de la app no tienen etapa: solo salen sin filtro de etapa.
        if (etapa === "todas") {
            for (const b of borradores) {
                const coincideTexto =
                    texto === "" ||
                    b.resumen.comunidad.toLowerCase().includes(texto) ||
                    (b.resumen.administrador ?? "").toLowerCase().includes(texto);
                if (!coincideTexto || !coincidePeriodo(b.creadoEn, periodo)) continue;
                grupos.borrador.push({ tipo: "borrador", borrador: b, fecha: b.actualizadoEn });
            }
        }

        for (const op of oportunidades) {
            // Ya tiene borrador empezado: se ve el borrador (arriba), no la visita.
            if (conBorrador.has(op.id) && op.etapa === "VISITA_CONCERTADA") continue;

            const coincideTexto =
                texto === "" ||
                (op.comunidadNombre ?? op.name).toLowerCase().includes(texto) ||
                (op.administrador.nombre ?? "").toLowerCase().includes(texto);
            const coincideEtapa = etapa === "todas" || op.etapa === etapa;
            if (!coincideTexto || !coincideEtapa || !coincidePeriodo(op.createdAt, periodo)) continue;

            const clasificacion = clasificar(op);
            grupos[clasificacion.columna].push({ tipo: "oportunidad", op: { ...op, clasificacion }, fecha: op.createdAt });
        }

        // Borradores: lo último que se ha tocado, primero. Las visitas pendientes
        // (sin empezar) van detrás.
        const peso = (e: Elemento) => (e.tipo === "borrador" ? 1 : 0);
        grupos.borrador.sort((a, b) => peso(b) - peso(a) || b.fecha.localeCompare(a.fecha));

        // Dentro de generados, lo que hay que revisar va primero: es lo que el
        // comercial viene a buscar.
        const porRevisar = (e: Elemento) => (e.tipo === "oportunidad" && e.op.clasificacion.porRevisar ? 1 : 0);
        grupos.generado.sort((a, b) => porRevisar(b) - porRevisar(a));

        return grupos;
    }, [oportunidades, borradores, busqueda, etapa, periodo]);

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
                                {porColumna[c.clave].map((e) =>
                                    e.tipo === "borrador" ? (
                                        <TarjetaBorrador key={`b-${e.borrador.id}`} borrador={e.borrador} mostrarAutor={mostrarAutor} />
                                    ) : (
                                        <Tarjeta key={e.op.id} op={e.op} />
                                    )
                                )}
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

/**
 * Borrador de la app. `<a>` y no `<Link>`: el formulario lee el borrador en
 * servidor al cargar, y una navegación de cliente podía servir una versión en
 * caché de la página con los datos de la visita anterior.
 */
function TarjetaBorrador({ borrador, mostrarAutor }: { borrador: ResumenBorrador; mostrarAutor: boolean }) {
    return (
        <a
            href={`/presupuestos/nuevo?borrador=${borrador.id}`}
            className="group rounded-2xl border border-hairline bg-surface p-4 transition hover:border-ink/20"
        >
            <p className="line-clamp-2 font-medium text-ink">{borrador.resumen.comunidad}</p>
            <p className="mt-1 text-xs text-muted">
                {borrador.resumen.administrador ?? "Sin administrador"}
                {mostrarAutor && borrador.autor ? ` · ${borrador.autor}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-medium ${ESTILO_TONO.borde}`}>
                    Borrador
                </span>
                <span suppressHydrationWarning className="text-[11px] text-muted">Editado {describirAntiguedad(borrador.actualizadoEn)}</span>
            </div>
        </a>
    );
}
