"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { AjustesPresupuesto } from "@/lib/documentos/ajustes";
import type { RegistroDocumento } from "@/lib/documentos/estado";
import type { FilaRevision, PartidaBuscable, VistaRevision } from "@/lib/documentos/revision";

/**
 * Revisión del presupuesto por dirección.
 *
 * El recorrido es: corregir -> generar el documento -> VERLO -> validarlo.
 * Validar NO envía nada a nadie: marca la casilla de la oportunidad, y a partir
 * de ahí el CRM avisa al comercial propietario para que sea él quien haga
 * llegar el presupuesto al administrador.
 *
 * ---------------------------------------------------------------------------
 * LA ARITMÉTICA DE ESTA PANTALLA NO ES LA OFICIAL
 * ---------------------------------------------------------------------------
 * Los totales se recalculan aquí mientras Miguel teclea, en CÉNTIMOS ENTEROS y
 * con las mismas reglas del motor, para que vea el efecto al momento. Pero el
 * importe que vale es el que devuelve el servidor al guardar: la pantalla se
 * repinta con él. Si alguna vez discrepan, manda el servidor, que es quien
 * construye el documento.
 *
 * `motor.ts` no se importa a propósito: arrastra el catálogo de tarifa entero
 * (199 partidas con sus costes internos) al bundle del navegador. Son cuatro
 * líneas de aritmética y así no viaja el precio de coste.
 *
 * ---------------------------------------------------------------------------
 * MÓVIL
 * ---------------------------------------------------------------------------
 * La tabla no se puede pintar como tabla en un teléfono. Cada partida es una
 * tarjeta: descripción arriba, medición y precio en dos columnas, e importe y
 * acción debajo. En pantalla grande, esas mismas piezas se aplanan a una rejilla
 * de cinco columnas con `sm:contents`, sin duplicar el marcado.
 *
 * El PDF embebido solo se pinta en pantalla grande: los visores móviles no
 * renderizan un PDF de otro dominio dentro de un iframe y lo que se ve es un
 * recuadro en blanco. En el teléfono se ofrece abrirlo, que es lo que el
 * navegador sí sabe hacer.
 */

type Props = {
    oportunidadId: string;
    comunidad: string;
    administrador: string | null;
    vistaInicial: VistaRevision;
    ajustesIniciales: AjustesPresupuesto | null;
    registroInicial: RegistroDocumento | null;
    catalogo: PartidaBuscable[];
};

type Borrador = { cantidad: string; precio: string; excluida: boolean };
type Anadida = { codigo: string; descripcion: string; unidad: string; cantidad: string; precio: string };

type RespuestaEstado = {
    requestId?: string;
    estado?: string;
    urlDocumento?: string;
    error?: string;
};

const INTERVALO_MS = 5000;
const INTENTOS_MAXIMOS = 30;

/** Rejilla de la fila en pantalla grande. Cabecera y filas comparten esta clase. */
const REJILLA = "sm:grid sm:grid-cols-[minmax(0,1fr)_6rem_6rem_6.5rem_5rem] sm:items-center sm:gap-3";

// --- Aritmética en céntimos (ver cabecera) ---------------------------------
const aCentimos = (euros: number) => Math.round((euros + Number.EPSILON) * 100);
const aEuros = (centimos: number) => Math.round(centimos) / 100;
const importeDe = (cantidad: number, precio: number) => Math.round(cantidad * aCentimos(precio));

const NF = new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: "always",
} as unknown as Intl.NumberFormatOptions);

const eur = (v: number) => `${NF.format(v)} €`;

/** Acepta coma decimal: en un teclado español nadie escribe el punto. */
function aNumero(valor: string): number {
    const limpio = valor.replace(/\./g, "").replace(",", ".").trim();
    const n = Number(limpio);
    return Number.isFinite(n) ? n : 0;
}

const texto = (v: number) => String(v).replace(".", ",");

export function RevisionPresupuesto({
    oportunidadId,
    comunidad,
    administrador,
    vistaInicial,
    ajustesIniciales,
    registroInicial,
    catalogo,
}: Props) {
    const [vista, setVista] = useState<VistaRevision>(vistaInicial);
    const [borradores, setBorradores] = useState<Record<string, Borrador>>(() => desdeVista(vistaInicial));
    const [anadidas, setAnadidas] = useState<Anadida[]>([]);
    const [ivaTipo, setIvaTipo] = useState<number>(vistaInicial.ivaTipo);
    const [motivo, setMotivo] = useState<string>(ajustesIniciales?.motivo ?? "");

    const [registro, setRegistro] = useState<RespuestaEstado | null>(registroInicial);
    const [trabajando, setTrabajando] = useState<null | "guardando" | "generando" | "validando">(null);
    const [error, setError] = useState<string | null>(null);
    const [validado, setValidado] = useState<{ referencia: string } | null>(null);
    const [buscando, setBuscando] = useState(false);
    const [consulta, setConsulta] = useState("");
    const [sucio, setSucio] = useState(false);

    const guardadoEn = useRef<string | null>(ajustesIniciales?.actualizadoEn ?? null);
    const filas = useMemo(() => vista.capitulos.flatMap((c) => c.filas), [vista]);

    // --- Totales en vivo ---------------------------------------------------
    const totales = useMemo(() => {
        let pem = 0;

        for (const fila of filas) {
            const b = borradores[fila.codigo];
            if (!b || b.excluida) continue;
            pem += importeDe(aNumero(b.cantidad), aNumero(b.precio));
        }
        for (const a of anadidas) {
            pem += importeDe(aNumero(a.cantidad), aNumero(a.precio));
        }

        const iva = Math.round(pem * ivaTipo);
        return { pem: aEuros(pem), iva: aEuros(iva), total: aEuros(pem + iva) };
    }, [filas, borradores, anadidas, ivaTipo]);

    function editar(codigo: string, cambio: Partial<Borrador>) {
        setBorradores((previo) => ({ ...previo, [codigo]: { ...previo[codigo], ...cambio } }));
        setSucio(true);
        setError(null);
    }

    function cuerpoAjustes() {
        const lineas: Record<string, Record<string, unknown>> = {};

        for (const fila of filas) {
            const b = borradores[fila.codigo];
            if (!b) continue;

            const ajuste: Record<string, unknown> = {};
            if (b.excluida) ajuste.excluida = true;

            const cantidad = aNumero(b.cantidad);
            const precio = aNumero(b.precio);
            if (cantidad !== fila.cantidadBase) ajuste.cantidad = cantidad;
            if (precio !== fila.precioBase) ajuste.precioUnitario = precio;

            if (Object.keys(ajuste).length > 0) lineas[fila.codigo] = ajuste;
        }

        return {
            lineas,
            anadidas: anadidas.map((a) => ({
                codigo: a.codigo,
                cantidad: aNumero(a.cantidad),
                precioUnitario: aNumero(a.precio),
            })),
            ivaTipo,
            motivo: motivo.trim() || undefined,
        };
    }

    async function guardar(): Promise<boolean> {
        setTrabajando("guardando");
        setError(null);

        try {
            const respuesta = await fetch(`/api/presupuestos/${oportunidadId}/ajustes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cuerpoAjustes()),
            });

            const datos = await respuesta.json();
            if (!respuesta.ok) throw new Error(datos.error ?? `Error ${respuesta.status}`);

            // Las cifras del servidor sustituyen a las de la pantalla.
            setVista(datos.vista as VistaRevision);
            setBorradores(desdeVista(datos.vista as VistaRevision));
            setAnadidas([]);
            setIvaTipo((datos.vista as VistaRevision).ivaTipo);
            guardadoEn.current = (datos.ajustes as AjustesPresupuesto).actualizadoEn;
            setSucio(false);
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : "No se han podido guardar los ajustes.");
            return false;
        } finally {
            setTrabajando(null);
        }
    }

    async function generar() {
        // Generar con cambios sin guardar produciría un documento que no se
        // corresponde con lo que hay en la oportunidad. Se guarda primero.
        if (sucio) {
            const ok = await guardar();
            if (!ok) return;
        }

        setTrabajando("generando");
        setError(null);

        try {
            const version = registro?.requestId
                ? Number(registro.requestId.match(/-v(\d+)$/)?.[1] ?? 1) + 1
                : 1;

            const respuesta = await fetch("/api/documentos/generar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    oportunidadId,
                    version,
                    // Una corrección es otra versión del MISMO presupuesto.
                    conservarReferencia: true,
                }),
            });

            const datos = (await respuesta.json()) as RespuestaEstado;
            if (!respuesta.ok) throw new Error(datos.error ?? `Error ${respuesta.status}`);

            setRegistro({ ...datos, estado: "generando" });
            if (datos.requestId) await seguir(datos.requestId);
        } catch (e) {
            setError(e instanceof Error ? e.message : "No se ha podido generar el documento.");
        } finally {
            setTrabajando(null);
        }
    }

    async function seguir(requestId: string) {
        for (let i = 0; i < INTENTOS_MAXIMOS; i++) {
            await new Promise((r) => setTimeout(r, INTERVALO_MS));

            let datos: RespuestaEstado;
            try {
                const respuesta = await fetch(`/api/documentos/estado/${requestId}`);
                datos = (await respuesta.json()) as RespuestaEstado;
            } catch {
                continue; // sin cobertura o respuesta no-JSON: siguiente vuelta
            }

            if (datos.error || datos.estado === "fallido") {
                setRegistro({ requestId, estado: "fallido" });
                setError("La generación ha fallado. Avisa a Advantys antes de volver a intentarlo.");
                return;
            }

            setRegistro(datos);
            if (datos.estado !== "generando" && datos.estado !== "solicitado") return;
        }

        setRegistro({ requestId, estado: "fallido" });
        setError("La generación está tardando más de lo normal. Avisa a Advantys.");
    }

    async function validar() {
        setTrabajando("validando");
        setError(null);

        try {
            const respuesta = await fetch(`/api/presupuestos/${oportunidadId}/validar`, { method: "POST" });
            const datos = await respuesta.json();
            if (!respuesta.ok) throw new Error(datos.error ?? `Error ${respuesta.status}`);

            setValidado({ referencia: datos.numeroReferencia });
        } catch (e) {
            setError(e instanceof Error ? e.message : "No se ha podido validar el presupuesto.");
        } finally {
            setTrabajando(null);
        }
    }

    const resultados = useMemo(() => {
        const q = consulta.trim().toLowerCase();
        if (q.length < 2) return [];
        const yaEstan = new Set([...filas.map((f) => f.codigo), ...anadidas.map((a) => a.codigo)]);

        return catalogo
            .filter(
                (p) =>
                    !yaEstan.has(p.codigo) &&
                    (p.descripcion.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q))
            )
            .slice(0, 20);
    }, [consulta, catalogo, filas, anadidas]);

    const publicado = registro?.estado === "publicado" && Boolean(registro.urlDocumento);
    const generando = trabajando === "generando" || registro?.estado === "generando";
    const listoParaValidar = publicado && !sucio;

    if (validado) {
        return (
            <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-2 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-canvas">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                        <path d="M20 6 9 17l-5-5" />
                    </svg>
                </div>
                <h1 className="mt-5 text-xl font-semibold text-ink">Presupuesto validado</h1>
                <p className="mt-2 text-sm text-muted">
                    {validado.referencia} queda marcado como validado en la oportunidad.
                </p>

                <Link
                    href="/"
                    className="mt-8 w-full rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-canvas"
                >
                    Volver al inicio
                </Link>
                <Link
                    href={`/oportunidades/${oportunidadId}`}
                    className="mt-2 w-full rounded-xl border border-hairline px-5 py-3 text-sm font-medium text-ink transition hover:bg-surface"
                >
                    Ver la oportunidad
                </Link>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-5xl">
            {/* Cabecera */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                        Revisión de presupuesto
                    </p>
                    <h1 className="mt-1 text-lg font-semibold leading-snug text-ink sm:text-2xl">
                        {comunidad}
                    </h1>
                    <p className="mt-0.5 text-xs text-muted">
                        {administrador ?? "Sin administrador"}
                        {registroInicial?.numeroReferencia ? ` · ${registroInicial.numeroReferencia}` : ""}
                    </p>
                </div>
                <Link
                    href={`/oportunidades/${oportunidadId}`}
                    className="shrink-0 rounded-xl border border-hairline px-3 py-2 text-xs font-medium text-ink transition hover:bg-surface"
                >
                    Volver
                </Link>
            </div>

            {error && (
                <p className="mt-4 whitespace-pre-line rounded-2xl border border-hairline bg-surface px-4 py-3 text-sm text-ink">
                    {error}
                </p>
            )}

            {/* Capítulos */}
            <div className="mt-5 space-y-4">
                {vista.capitulos.map((capitulo) => (
                    <section key={capitulo.codigo} className="overflow-hidden rounded-2xl border border-hairline bg-surface">
                        <header className="flex items-center justify-between gap-3 border-b border-hairline px-3 py-3 sm:px-4">
                            <h2 className="text-sm font-semibold leading-snug text-ink">
                                {capitulo.codigoJerarquico} {capitulo.nombre}
                            </h2>
                            <span className="shrink-0 text-xs text-muted">{eur(capitulo.total)}</span>
                        </header>

                        {/* Cabecera de columnas: solo en pantalla grande. */}
                        <div
                            className={`hidden border-b border-hairline px-4 py-2 text-[10px] uppercase tracking-wide text-muted ${REJILLA}`}
                        >
                            <span>Partida</span>
                            <span className="text-right">Medición</span>
                            <span className="text-right">Precio</span>
                            <span className="text-right">Importe</span>
                            <span />
                        </div>

                        <div className="divide-y divide-hairline">
                            {capitulo.filas.map((fila) => (
                                <Fila
                                    key={fila.codigo}
                                    fila={fila}
                                    borrador={borradores[fila.codigo]}
                                    onEditar={(cambio) => editar(fila.codigo, cambio)}
                                />
                            ))}
                        </div>
                    </section>
                ))}
            </div>

            {/* Partidas añadidas */}
            {anadidas.length > 0 && (
                <section className="mt-4 overflow-hidden rounded-2xl border border-hairline bg-surface">
                    <header className="border-b border-hairline px-3 py-3 sm:px-4">
                        <h2 className="text-sm font-semibold text-ink">Partidas añadidas</h2>
                    </header>
                    <div className="divide-y divide-hairline">
                        {anadidas.map((a, i) => (
                            <div key={a.codigo} className={`px-3 py-3 sm:px-4 ${REJILLA}`}>
                                <div className="min-w-0">
                                    <p className="text-sm leading-snug text-ink">{a.descripcion}</p>
                                    <p className="mt-0.5 text-[11px] text-muted">{a.codigo} · nueva</p>
                                </div>

                                <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-0 sm:contents">
                                    <Campo
                                        etiqueta={`Medición (${a.unidad})`}
                                        valor={a.cantidad}
                                        onChange={(v) => {
                                            const copia = [...anadidas];
                                            copia[i] = { ...a, cantidad: v };
                                            setAnadidas(copia);
                                            setSucio(true);
                                        }}
                                    />
                                    <Campo
                                        etiqueta="Precio (€)"
                                        valor={a.precio}
                                        onChange={(v) => {
                                            const copia = [...anadidas];
                                            copia[i] = { ...a, precio: v };
                                            setAnadidas(copia);
                                            setSucio(true);
                                        }}
                                    />
                                </div>

                                <div className="mt-2 flex items-center justify-between gap-3 sm:mt-0 sm:contents">
                                    <span className="text-sm font-medium text-ink sm:text-right">
                                        {eur(aEuros(importeDe(aNumero(a.cantidad), aNumero(a.precio))))}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAnadidas(anadidas.filter((_, j) => j !== i));
                                            setSucio(true);
                                        }}
                                        className="rounded-lg border border-hairline px-2.5 py-1.5 text-xs text-ink transition hover:bg-canvas"
                                    >
                                        Quitar
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Añadir partida de tarifa */}
            <section className="mt-4 rounded-2xl border border-dashed border-hairline p-3 sm:p-4">
                {!buscando ? (
                    <button
                        type="button"
                        onClick={() => setBuscando(true)}
                        className="text-sm font-medium text-ink underline underline-offset-4"
                    >
                        Añadir una partida de la tarifa
                    </button>
                ) : (
                    <div>
                        <div className="flex items-center gap-2">
                            <input
                                autoFocus
                                value={consulta}
                                onChange={(e) => setConsulta(e.target.value)}
                                placeholder="Buscar: impermeabilización, andamio, DEM015..."
                                className="w-full min-w-0 rounded-xl border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    setBuscando(false);
                                    setConsulta("");
                                }}
                                className="shrink-0 rounded-xl border border-hairline px-3 py-2 text-xs text-ink transition hover:bg-canvas"
                            >
                                Cerrar
                            </button>
                        </div>

                        <div className="mt-3 max-h-72 overflow-y-auto overscroll-contain">
                            {resultados.map((p) => (
                                <button
                                    key={p.codigo}
                                    type="button"
                                    onClick={() => {
                                        setAnadidas([
                                            ...anadidas,
                                            {
                                                codigo: p.codigo,
                                                descripcion: p.descripcion,
                                                unidad: p.unidad,
                                                cantidad: "1",
                                                precio: texto(p.precio),
                                            },
                                        ]);
                                        setSucio(true);
                                        setConsulta("");
                                        setBuscando(false);
                                    }}
                                    className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-canvas"
                                >
                                    <span className="min-w-0">
                                        <span className="block text-sm leading-snug text-ink">{p.descripcion}</span>
                                        <span className="block text-[11px] text-muted">
                                            {p.codigo} · {p.capitulo}
                                        </span>
                                    </span>
                                    <span className="shrink-0 whitespace-nowrap text-xs text-muted">
                                        {eur(p.precio)}/{p.unidad}
                                    </span>
                                </button>
                            ))}
                            {consulta.trim().length >= 2 && resultados.length === 0 && (
                                <p className="px-3 py-4 text-sm text-muted">Ninguna partida coincide.</p>
                            )}
                        </div>
                    </div>
                )}
            </section>

            {/* Totales */}
            <section className="mt-4 rounded-2xl border border-hairline bg-surface p-3 sm:p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted">Presupuesto de ejecución material</span>
                    <span className="shrink-0 font-medium text-ink">{eur(totales.pem)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                    <label className="flex items-center gap-2 text-muted">
                        IVA
                        <select
                            value={String(ivaTipo)}
                            onChange={(e) => {
                                setIvaTipo(Number(e.target.value));
                                setSucio(true);
                            }}
                            className="cursor-pointer rounded-lg border border-hairline bg-canvas px-2 py-1 text-xs text-ink focus:outline-none"
                        >
                            <option value="0.1">10 %</option>
                            <option value="0.21">21 %</option>
                        </select>
                    </label>
                    <span className="shrink-0 font-medium text-ink">{eur(totales.iva)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-hairline pt-3">
                    <span className="text-sm font-semibold text-ink">Total</span>
                    <span className="shrink-0 text-lg font-semibold text-ink">{eur(totales.total)}</span>
                </div>

                <input
                    value={motivo}
                    onChange={(e) => {
                        setMotivo(e.target.value);
                        setSucio(true);
                    }}
                    placeholder="Motivo del ajuste (interno, no sale en el documento)"
                    className="mt-4 w-full rounded-xl border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none"
                />
            </section>

            {/* Acciones */}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                    type="button"
                    onClick={guardar}
                    disabled={!sucio || trabajando !== null}
                    className={`flex-1 rounded-xl border border-hairline py-3 text-sm font-medium text-ink transition ${
                        !sucio || trabajando !== null ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-surface"
                    }`}
                >
                    {trabajando === "guardando" ? "Guardando..." : "Guardar cambios"}
                </button>
                <button
                    type="button"
                    onClick={generar}
                    disabled={trabajando !== null || generando}
                    className={`flex-1 rounded-xl bg-ink py-3 text-sm font-semibold text-canvas transition ${
                        trabajando !== null || generando ? "cursor-not-allowed opacity-40" : "cursor-pointer"
                    }`}
                >
                    {generando ? "Generando documento..." : "Generar documento"}
                </button>
            </div>

            {/* Documento y validación */}
            <section className="mt-5 rounded-2xl border border-hairline bg-surface p-3 sm:p-4">
                <h2 className="text-sm font-semibold text-ink">Documento</h2>

                {!publicado && (
                    <p className="mt-2 text-sm text-muted">
                        {generando
                            ? "Rehaciendo el presupuesto con tus cambios. Tarda menos de un minuto."
                            : "Genera el documento para ver cómo queda antes de validarlo."}
                    </p>
                )}

                {publicado && (
                    <>
                        {sucio && (
                            <p className="mt-2 text-sm text-ink">
                                Has cambiado cosas después de generar este documento. Vuelve a generarlo
                                para validar la versión que has dejado.
                            </p>
                        )}

                        {/* Solo en pantalla grande: ver la nota de la cabecera. */}
                        <iframe
                            src={registro!.urlDocumento}
                            title="Presupuesto"
                            className="mt-3 hidden h-[70vh] w-full rounded-xl border border-hairline bg-canvas sm:block"
                        />

                        <a
                            href={registro!.urlDocumento}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 block w-full rounded-xl border border-hairline py-3 text-center text-sm font-medium text-ink transition hover:bg-canvas sm:mt-2 sm:border-0 sm:py-0 sm:text-xs sm:text-muted sm:underline sm:underline-offset-4"
                        >
                            Abrir el documento
                        </a>

                        <button
                            type="button"
                            onClick={validar}
                            disabled={!listoParaValidar || trabajando !== null}
                            className={`mt-4 w-full rounded-xl bg-ink py-3 text-sm font-semibold text-canvas transition ${
                                !listoParaValidar || trabajando !== null
                                    ? "cursor-not-allowed opacity-40"
                                    : "cursor-pointer"
                            }`}
                        >
                            {trabajando === "validando" ? "Validando..." : "Validar presupuesto"}
                        </button>
                        <p className="mt-2 text-center text-[11px] leading-relaxed text-muted">
                            Al validarlo, el comercial recibe el aviso para enviárselo al administrador.
                        </p>
                    </>
                )}
            </section>
        </div>
    );
}

// ---------------------------------------------------------------------------

function desdeVista(vista: VistaRevision): Record<string, Borrador> {
    const borradores: Record<string, Borrador> = {};

    for (const capitulo of vista.capitulos) {
        for (const fila of capitulo.filas) {
            borradores[fila.codigo] = {
                cantidad: texto(fila.cantidad),
                precio: texto(fila.precioUnitario),
                excluida: fila.excluida,
            };
        }
    }

    return borradores;
}

function Fila({
    fila,
    borrador,
    onEditar,
}: {
    fila: FilaRevision;
    borrador?: Borrador;
    onEditar: (cambio: Partial<Borrador>) => void;
}) {
    if (!borrador) return null;

    const importe = aEuros(importeDe(aNumero(borrador.cantidad), aNumero(borrador.precio)));
    const precioEditado = fila.precioBase !== aNumero(borrador.precio);

    return (
        <div className={`px-3 py-3 sm:px-4 ${REJILLA} ${borrador.excluida ? "opacity-45" : ""}`}>
            <div className="min-w-0">
                <p className={`text-sm leading-snug text-ink ${borrador.excluida ? "line-through" : ""}`}>
                    {fila.descripcion}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                    {fila.codigoJerarquico} · {fila.codigo}
                    {precioEditado && ` · tarifa ${NF.format(fila.precioBase)} €`}
                </p>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-0 sm:contents">
                <Campo
                    etiqueta={`Medición (${fila.unidad})`}
                    valor={borrador.cantidad}
                    deshabilitado={borrador.excluida}
                    onChange={(v) => onEditar({ cantidad: v })}
                />
                <Campo
                    etiqueta="Precio (€)"
                    valor={borrador.precio}
                    deshabilitado={borrador.excluida}
                    onChange={(v) => onEditar({ precio: v })}
                />
            </div>

            <div className="mt-2 flex items-center justify-between gap-3 sm:mt-0 sm:contents">
                <span className="text-sm font-medium text-ink sm:text-right">
                    {borrador.excluida ? "—" : eur(importe)}
                </span>
                <button
                    type="button"
                    onClick={() => onEditar({ excluida: !borrador.excluida })}
                    className="rounded-lg border border-hairline px-2.5 py-1.5 text-xs text-ink transition hover:bg-canvas"
                >
                    {borrador.excluida ? "Recuperar" : "Quitar"}
                </button>
            </div>
        </div>
    );
}

/**
 * La etiqueta solo se ve en móvil: en pantalla grande la dice la cabecera de
 * columnas, y repetirla en cada fila convertiría la tabla en un muro de texto.
 */
function Campo({
    etiqueta,
    valor,
    onChange,
    deshabilitado = false,
}: {
    etiqueta: string;
    valor: string;
    onChange: (valor: string) => void;
    deshabilitado?: boolean;
}) {
    return (
        <label className="block min-w-0">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted sm:hidden">
                {etiqueta}
            </span>
            <input
                inputMode="decimal"
                value={valor}
                disabled={deshabilitado}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-lg border border-hairline bg-canvas px-2 py-2 text-right text-sm text-ink focus:outline-none disabled:opacity-50"
            />
        </label>
    );
}