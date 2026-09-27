"use client";

import { useMemo, useState } from "react";
import { desviacion, leerDecimal, UMBRAL_DESVIACION_PRECIO } from "@/lib/numero";
import {
    UNIDADES_PROPUESTA,
    type CapituloCatalogo,
    type LineaPropuesta,
    type PartidaCatalogo,
    type Propuesta,
} from "@/lib/propuesta/tipos";

/**
 * Revisión de la propuesta por IA, por el comercial (27/09/2026).
 *
 * Es la pantalla de Miguel adaptada a la toma de datos: el comercial comprueba
 * que están todas las partidas que dictó, corrige medición, unidad y precio,
 * quita lo que sobra y añade lo que falte (de la tarifa o a mano).
 *
 * Los totales son orientativos, en céntimos enteros como el motor. El importe
 * que vale es el que calcula el servidor al generar el documento.
 *
 * Unidad: solo etiqueta impresa (decisión de Jacob). Cambiar 12 m² por 1 ud es
 * legítimo; el comercial ajusta cantidad y precio a mano.
 */

type Props = {
    propuesta: Propuesta;
    modulos: { key: string; label: string }[];
    catalogo: PartidaCatalogo[];
    capitulos: CapituloCatalogo[];
    onCambiar: (propuesta: Propuesta) => void;
    onReintentarCype: (lineaId: string) => void;
    deshabilitado?: boolean;
};

const aCentimos = (euros: number) => Math.round((euros + Number.EPSILON) * 100);
const importeCent = (cantidad: number | null, precio: number | null) =>
    cantidad !== null && precio !== null ? Math.round(cantidad * aCentimos(precio)) : 0;

const NF = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur = (centimos: number) => `${NF.format(centimos / 100)} €`;
const aTexto = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
const nuevoId = () => Math.random().toString(36).slice(2, 10);

const ETIQUETA_ORIGEN: Record<LineaPropuesta["origen"], string> = {
    tarifa: "Tarifa",
    cype: "CYPE",
    manual: "Manual",
};

/** Lo que falta para poder crear el presupuesto. Lo usa también el formulario. */
export function problemasDeLinea(l: LineaPropuesta): string[] {
    const p: string[] = [];
    if (l.pendienteCype) p.push("buscando en CYPE");
    else if (!l.codigo) p.push("sin partida: pon precio o elige una de la tarifa");
    if (l.cantidad === null || l.cantidad <= 0) p.push("falta la medición");
    if (!l.pendienteCype && (l.precioUnitario === null || l.precioUnitario < 0)) p.push("falta el precio");
    if (!l.descripcionCorta.trim()) p.push("falta la descripción");
    return p;
}

export function RevisionPropuesta({
    propuesta,
    modulos,
    catalogo,
    capitulos,
    onCambiar,
    onReintentarCype,
    deshabilitado = false,
}: Props) {
    /** Texto de los campos numéricos mientras se escribe ("12," no es un número todavía). */
    const [textos, setTextos] = useState<Record<string, string>>({});
    /** Buscador abierto: para añadir a un módulo o para sustituir una línea. */
    const [buscador, setBuscador] = useState<{ modulo: string; sustituir: string | null } | null>(null);
    const [consulta, setConsulta] = useState("");

    const lineas = propuesta.lineas;

    function cambiarLineas(nuevas: LineaPropuesta[]) {
        onCambiar({ ...propuesta, lineas: nuevas });
    }

    function editar(id: string, cambio: Partial<LineaPropuesta>) {
        cambiarLineas(lineas.map((l) => (l.id === id ? { ...l, ...cambio } : l)));
    }

    function editarNumero(l: LineaPropuesta, campo: "cantidad" | "precioUnitario", valor: string) {
        setTextos((t) => ({ ...t, [`${l.id}:${campo}`]: valor }));
        const numero = leerDecimal(valor);
        const cambio: Partial<LineaPropuesta> = { [campo]: numero };
        // Una línea que CYPE no encontró pasa a "manual" en cuanto tiene precio:
        // el comercial la ha valorado él.
        if (campo === "precioUnitario" && !l.codigo && !l.pendienteCype) {
            cambio.origen = "manual";
            cambio.codigo = `MAN-${l.id.slice(0, 4).toUpperCase()}`;
            cambio.aviso = null;
        }
        editar(l.id, cambio);
    }

    function valorCampo(l: LineaPropuesta, campo: "cantidad" | "precioUnitario") {
        return textos[`${l.id}:${campo}`] ?? aTexto(l[campo]);
    }

    function elegirDeTarifa(p: PartidaCatalogo) {
        if (!buscador) return;
        if (buscador.sustituir) {
            editar(buscador.sustituir, {
                codigo: p.codigo,
                origen: "tarifa",
                descripcionCorta: p.descripcion,
                descripcionLarga: null,
                precioUnitario: p.precio,
                precioReferencia: p.precio,
                precioCype: null,
                capitulo: p.capitulo,
                url: null,
                aviso: null,
                pendienteCype: false,
            });
            setTextos((t) => {
                const siguiente = { ...t };
                delete siguiente[`${buscador.sustituir}:precioUnitario`];
                return siguiente;
            });
        } else {
            cambiarLineas([
                ...lineas,
                {
                    id: nuevoId(),
                    moduloKey: buscador.modulo,
                    textoOriginal: "",
                    codigo: p.codigo,
                    origen: "tarifa",
                    descripcionCorta: p.descripcion,
                    descripcionLarga: null,
                    unidad: p.unidad,
                    cantidad: null,
                    precioUnitario: p.precio,
                    precioReferencia: p.precio,
                    precioCype: null,
                    capitulo: p.capitulo,
                    url: null,
                    aviso: "Añadida a mano: pon la medición",
                },
            ]);
        }
        setBuscador(null);
        setConsulta("");
    }

    function anadirManual(moduloKey: string) {
        const delModulo = lineas.filter((l) => l.moduloKey === moduloKey);
        const id = nuevoId();
        cambiarLineas([
            ...lineas,
            {
                id,
                moduloKey,
                textoOriginal: "",
                codigo: `MAN-${id.slice(0, 4).toUpperCase()}`,
                origen: "manual",
                descripcionCorta: "",
                descripcionLarga: null,
                unidad: "ud",
                cantidad: null,
                precioUnitario: null,
                precioReferencia: null,
                precioCype: null,
                capitulo: delModulo[0]?.capitulo ?? capitulos[0]?.codigo ?? "01",
                url: null,
                aviso: null,
            },
        ]);
    }

    const resultados = useMemo(() => {
        const q = consulta
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "");
        if (q.length < 2) return [];
        const terminos = q.split(/\s+/);
        return catalogo
            .filter((p) => {
                const heno = `${p.codigo} ${p.descripcion}`.toLowerCase();
                return terminos.every((t) => heno.includes(t));
            })
            .slice(0, 25);
    }, [consulta, catalogo]);

    const total = lineas.reduce((s, l) => s + importeCent(l.cantidad, l.precioUnitario), 0);
    const iva = Math.round(total * 0.1);
    const conProblemas = lineas.filter((l) => problemasDeLinea(l).length > 0).length;

    return (
        <div className="flex flex-col gap-3">
            {(propuesta.observaciones.length > 0 || propuesta.sugerencias.length > 0) && (
                <section className="rounded-2xl border border-hairline bg-surface p-4 text-xs">
                    {propuesta.sugerencias.length > 0 && (
                        <>
                            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
                                ¿Falta algo? La IA sugiere revisar
                            </p>
                            <ul className="mb-3 list-disc pl-4 text-ink">
                                {propuesta.sugerencias.map((s) => (
                                    <li key={s}>{s}</li>
                                ))}
                            </ul>
                        </>
                    )}
                    {propuesta.observaciones.length > 0 && (
                        <>
                            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
                                Del dictado, no son partidas
                            </p>
                            <ul className="list-disc pl-4 text-muted">
                                {propuesta.observaciones.map((s) => (
                                    <li key={s}>{s}</li>
                                ))}
                            </ul>
                        </>
                    )}
                </section>
            )}

            {modulos.map((m) => {
                const delModulo = lineas.filter((l) => l.moduloKey === m.key);
                const subtotal = delModulo.reduce((s, l) => s + importeCent(l.cantidad, l.precioUnitario), 0);
                return (
                    <section key={m.key} className="overflow-hidden rounded-2xl border border-hairline bg-surface">
                        <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
                            <h2 className="text-sm font-semibold text-ink">{m.label}</h2>
                            <span className="shrink-0 text-xs text-muted">{eur(subtotal)}</span>
                        </header>

                        {delModulo.length === 0 && (
                            <p className="px-4 py-4 text-xs text-muted">Sin partidas en este tipo de trabajo.</p>
                        )}

                        <div className="divide-y divide-hairline">
                            {delModulo.map((l) => (
                                <Linea
                                    key={l.id}
                                    linea={l}
                                    capitulos={capitulos}
                                    valorCampo={(c) => valorCampo(l, c)}
                                    onNumero={(c, v) => editarNumero(l, c, v)}
                                    onEditar={(cambio) => editar(l.id, cambio)}
                                    onQuitar={() => cambiarLineas(lineas.filter((x) => x.id !== l.id))}
                                    onSustituir={() => setBuscador({ modulo: m.key, sustituir: l.id })}
                                    onReintentar={() => onReintentarCype(l.id)}
                                    deshabilitado={deshabilitado}
                                />
                            ))}
                        </div>

                        <div className="flex flex-wrap gap-2 border-t border-hairline px-4 py-3">
                            <button
                                type="button"
                                disabled={deshabilitado}
                                onClick={() => setBuscador({ modulo: m.key, sustituir: null })}
                                className="cursor-pointer rounded-lg border border-hairline px-2.5 py-1.5 text-xs text-ink transition hover:border-ink/30 disabled:opacity-40"
                            >
                                + Partida de la tarifa
                            </button>
                            <button
                                type="button"
                                disabled={deshabilitado}
                                onClick={() => anadirManual(m.key)}
                                className="cursor-pointer rounded-lg border border-hairline px-2.5 py-1.5 text-xs text-ink transition hover:border-ink/30 disabled:opacity-40"
                            >
                                + Partida a mano
                            </button>
                        </div>
                    </section>
                );
            })}

            <section className="rounded-2xl border border-hairline bg-surface p-4">
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Ejecución material</span>
                    <span className="font-medium text-ink">{eur(total)}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-sm">
                    <span className="text-muted">IVA 10 %</span>
                    <span className="font-medium text-ink">{eur(iva)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2">
                    <span className="text-sm font-semibold text-ink">Total orientativo</span>
                    <span className="text-lg font-semibold text-ink">{eur(total + iva)}</span>
                </div>
                {conProblemas > 0 && (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                        {conProblemas === 1 ? "1 partida necesita" : `${conProblemas} partidas necesitan`} que la
                        completes antes de crear el presupuesto.
                    </p>
                )}
            </section>

            {buscador && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
                    <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-t-2xl bg-canvas p-4 sm:rounded-2xl">
                        <div className="flex items-center gap-2">
                            <input
                                autoFocus
                                value={consulta}
                                onChange={(e) => setConsulta(e.target.value)}
                                placeholder="Buscar en la tarifa: bajante, pintura, IMP003..."
                                aria-label="Buscar en la tarifa"
                                className="w-full min-w-0 rounded-xl border border-hairline bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    setBuscador(null);
                                    setConsulta("");
                                }}
                                className="shrink-0 cursor-pointer rounded-xl border border-hairline px-3 py-2.5 text-xs text-ink"
                            >
                                Cerrar
                            </button>
                        </div>
                        <div className="mt-3 max-h-[60vh] overflow-y-auto overscroll-contain">
                            {resultados.map((p) => (
                                <button
                                    key={p.codigo}
                                    type="button"
                                    onClick={() => elegirDeTarifa(p)}
                                    className="flex w-full cursor-pointer items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-surface"
                                >
                                    <span className="min-w-0">
                                        <span className="block text-sm leading-snug text-ink">{p.descripcion}</span>
                                        <span className="block text-[11px] text-muted">{p.codigo}</span>
                                    </span>
                                    <span className="shrink-0 whitespace-nowrap text-xs text-muted">
                                        {NF.format(p.precio)} €/{p.unidad}
                                    </span>
                                </button>
                            ))}
                            {consulta.trim().length >= 2 && resultados.length === 0 && (
                                <p className="px-3 py-4 text-sm text-muted">Ninguna partida coincide.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Linea({
    linea: l,
    capitulos,
    valorCampo,
    onNumero,
    onEditar,
    onQuitar,
    onSustituir,
    onReintentar,
    deshabilitado,
}: {
    linea: LineaPropuesta;
    capitulos: CapituloCatalogo[];
    valorCampo: (campo: "cantidad" | "precioUnitario") => string;
    onNumero: (campo: "cantidad" | "precioUnitario", valor: string) => void;
    onEditar: (cambio: Partial<LineaPropuesta>) => void;
    onQuitar: () => void;
    onSustituir: () => void;
    onReintentar: () => void;
    deshabilitado: boolean;
}) {
    const problemas = problemasDeLinea(l);
    const sinEncontrar = !l.pendienteCype && !l.codigo;
    const editableTexto = l.origen === "manual";
    const d =
        l.precioUnitario !== null && l.precioReferencia !== null && l.precioReferencia > 0
            ? desviacion(l.precioUnitario, l.precioReferencia)
            : null;

    return (
        <div className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    {editableTexto ? (
                        <input
                            value={l.descripcionCorta}
                            disabled={deshabilitado}
                            onChange={(e) => onEditar({ descripcionCorta: e.target.value })}
                            placeholder="Descripción de la partida"
                            aria-label="Descripción de la partida"
                            className={`w-full rounded-lg border bg-canvas px-2 py-1.5 text-sm text-ink focus:outline-none ${
                                l.descripcionCorta.trim() ? "border-hairline" : "border-red-500"
                            }`}
                        />
                    ) : (
                        <p className="text-sm leading-snug text-ink">{l.descripcionCorta}</p>
                    )}
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                        {l.pendienteCype ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-hairline px-2 py-0.5">
                                <span className="h-2 w-2 animate-pulse rounded-full bg-ink/40" />
                                Buscando en CYPE…
                            </span>
                        ) : sinEncontrar ? (
                            <span className="rounded-full border border-amber-500/50 px-2 py-0.5 text-amber-700 dark:text-amber-400">
                                Sin precio
                            </span>
                        ) : (
                            <span className="rounded-full border border-hairline px-2 py-0.5">
                                {ETIQUETA_ORIGEN[l.origen]}
                            </span>
                        )}
                        {l.codigo && <span>{l.codigo}</span>}
                        {l.url && (
                            <a href={l.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                                ver en CYPE
                            </a>
                        )}
                        {editableTexto && (
                            <select
                                value={l.capitulo}
                                disabled={deshabilitado}
                                onChange={(e) => onEditar({ capitulo: e.target.value })}
                                aria-label="Capítulo"
                                className="max-w-[12rem] cursor-pointer rounded border border-hairline bg-canvas px-1 py-0.5 text-[11px] text-ink"
                            >
                                {capitulos.map((c) => (
                                    <option key={c.codigo} value={c.codigo}>
                                        {c.codigo} {c.nombre.toLowerCase()}
                                    </option>
                                ))}
                            </select>
                        )}
                    </p>
                    {l.textoOriginal && <p className="mt-1 text-[11px] italic text-muted">«{l.textoOriginal}»</p>}
                </div>
                <button
                    type="button"
                    disabled={deshabilitado}
                    onClick={onQuitar}
                    className="shrink-0 cursor-pointer rounded-lg border border-hairline px-2.5 py-1.5 text-xs text-ink transition hover:bg-canvas disabled:opacity-40"
                >
                    Quitar
                </button>
            </div>

            <div className="mt-2.5 grid grid-cols-[1fr_5.5rem_1fr] gap-2 sm:grid-cols-[8rem_6rem_8rem_1fr]">
                <Numero
                    etiqueta="Medición"
                    valor={valorCampo("cantidad")}
                    invalido={l.cantidad === null || l.cantidad <= 0}
                    deshabilitado={deshabilitado}
                    onChange={(v) => onNumero("cantidad", v)}
                />
                <label className="block min-w-0">
                    <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted">Unidad</span>
                    <select
                        value={l.unidad}
                        disabled={deshabilitado}
                        onChange={(e) => onEditar({ unidad: e.target.value as LineaPropuesta["unidad"] })}
                        className="w-full cursor-pointer rounded-lg border border-hairline bg-canvas px-2 py-2 text-sm text-ink focus:outline-none"
                    >
                        {UNIDADES_PROPUESTA.map((u) => (
                            <option key={u} value={u}>
                                {u}
                            </option>
                        ))}
                    </select>
                </label>
                <Numero
                    etiqueta="Precio €"
                    valor={valorCampo("precioUnitario")}
                    invalido={!l.pendienteCype && (l.precioUnitario === null || l.precioUnitario < 0)}
                    deshabilitado={deshabilitado || Boolean(l.pendienteCype)}
                    onChange={(v) => onNumero("precioUnitario", v)}
                />
                <div className="col-span-3 flex items-end justify-end sm:col-span-1">
                    <span className="text-sm font-medium text-ink">
                        {eur(importeCent(l.cantidad, l.precioUnitario))}
                    </span>
                </div>
            </div>

            {d !== null && d > UMBRAL_DESVIACION_PRECIO && (
                <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                    Precio muy {l.precioUnitario! > l.precioReferencia! ? "por encima" : "por debajo"} de la referencia (
                    {NF.format(l.precioReferencia!)} €). Comprueba que es correcto.
                </p>
            )}
            {l.aviso && <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-400">{l.aviso}</p>}
            {problemas.length > 0 && !l.pendienteCype && (
                <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">Falta: {problemas.join(", ")}</p>
            )}

            {sinEncontrar && (
                <div className="mt-2 flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={deshabilitado}
                        onClick={onSustituir}
                        className="cursor-pointer rounded-lg border border-hairline px-2.5 py-1.5 text-xs text-ink disabled:opacity-40"
                    >
                        Elegir de la tarifa
                    </button>
                    {l.consulta && (
                        <button
                            type="button"
                            disabled={deshabilitado}
                            onClick={onReintentar}
                            className="cursor-pointer rounded-lg border border-hairline px-2.5 py-1.5 text-xs text-ink disabled:opacity-40"
                        >
                            Buscar otra vez en CYPE
                        </button>
                    )}
                </div>
            )}
            {!sinEncontrar && !l.pendienteCype && l.origen !== "manual" && (
                <button
                    type="button"
                    disabled={deshabilitado}
                    onClick={onSustituir}
                    className="mt-2 cursor-pointer text-[11px] text-muted underline underline-offset-2 disabled:opacity-40"
                >
                    Cambiar por otra partida de la tarifa
                </button>
            )}
        </div>
    );
}

function Numero({
    etiqueta,
    valor,
    onChange,
    invalido,
    deshabilitado,
}: {
    etiqueta: string;
    valor: string;
    onChange: (v: string) => void;
    invalido: boolean;
    deshabilitado: boolean;
}) {
    return (
        <label className="block min-w-0">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted">{etiqueta}</span>
            <input
                inputMode="decimal"
                value={valor}
                disabled={deshabilitado}
                onChange={(e) => onChange(e.target.value)}
                aria-invalid={invalido}
                aria-label={etiqueta}
                className={`w-full rounded-lg border bg-canvas px-2 py-2 text-right text-sm text-ink focus:outline-none disabled:opacity-50 ${
                    invalido ? "border-red-500" : "border-hairline"
                }`}
            />
        </label>
    );
}
