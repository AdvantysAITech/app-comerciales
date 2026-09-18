"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Subida de fotos de un módulo.
 *
 * Las fotos suben a GHL en cuanto se seleccionan y aquí solo se guarda la URL
 * resultante. Eso hace que sobrevivan al borrador: si el navegador se cierra,
 * la foto ya está en el servidor y se recupera con el resto del formulario.
 *
 * Contrapartida asumida: si el comercial abandona la visita, esas fotos quedan
 * huérfanas en la biblioteca de la subcuenta. Es preferible a que se pierdan
 * fotos de una obra a la que hay que volver a desplazarse.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ LAS MINIATURAS SON DE TAMAÑO FIJO (18/09/2026)
 * ---------------------------------------------------------------------------
 * La rejilla era `grid-cols-4`: cuatro columnas SIEMPRE, ocupara lo que
 * ocupara el contenedor. En el móvil quedaba bien, pero Toni trabaja en un Mac
 * a pantalla completa y cuatro columnas son cuadrados de casi 300 px: con diez
 * fotos la pantalla se descuadraba y había que bajar mucho para llegar al
 * resto del formulario. Lo pidió literalmente en la revisión del 18/09:
 * "en pequeñito cuadrado te lo agradezco más".
 *
 * Ahora la rejilla es `auto-fill` con celdas de 84 px mínimo: el navegador mete
 * las columnas que quepan. En un móvil salen tres o cuatro; en un escritorio,
 * diez. La miniatura mide lo mismo en los dos sitios.
 *
 * Para VER la foto está el visor: se pulsa y se abre a pantalla completa, que
 * era la otra mitad de la petición. Antes no había forma de ampliar una foto
 * sin abrirla en otra pestaña.
 */

type Props = {
    fotos: string[];
    onFotosChange: (fotos: string[]) => void;
    /** Mínimo exigido. 0 = sin mínimo. */
    minimo?: number;
};

/**
 * Visor a pantalla completa.
 *
 * Navega entre las fotos del módulo sin cerrarse: al revisar una visita se
 * pasan todas seguidas, y obligar a cerrar y volver a pulsar en cada una es
 * justo la fricción que hace que no se revisen.
 */
function Visor({
    fotos,
    indice,
    onCambiar,
    onCerrar,
}: {
    fotos: string[];
    indice: number;
    onCambiar: (indice: number) => void;
    onCerrar: () => void;
}) {
    const anterior = useCallback(() => {
        onCambiar((indice - 1 + fotos.length) % fotos.length);
    }, [indice, fotos.length, onCambiar]);

    const siguiente = useCallback(() => {
        onCambiar((indice + 1) % fotos.length);
    }, [indice, fotos.length, onCambiar]);

    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") onCerrar();
            if (e.key === "ArrowLeft") anterior();
            if (e.key === "ArrowRight") siguiente();
        }
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [onCerrar, anterior, siguiente]);

    // Sin esto, en móvil el dedo arrastra el formulario de detrás mientras se
    // mira la foto y el comercial pierde el sitio al cerrar.
    useEffect(() => {
        const previo = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previo;
        };
    }, []);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
            onClick={onCerrar}
        >
            <button
                type="button"
                onClick={onCerrar}
                aria-label="Cerrar"
                className="absolute right-4 top-4 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
                    <path d="M18 6 6 18M6 6l12 12" />
                </svg>
            </button>

            {fotos.length > 1 && (
                <span className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs tabular-nums text-white">
                    {indice + 1} de {fotos.length}
                </span>
            )}

            {fotos.length > 1 && (
                <>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            anterior();
                        }}
                        aria-label="Foto anterior"
                        // 44 px de lado: se pulsa en obra, de pie y a veces con guantes.
                        className="absolute left-4 top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                            <path d="m15 18-6-6 6-6" />
                        </svg>
                    </button>

                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            siguiente();
                        }}
                        aria-label="Foto siguiente"
                        className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                            <path d="m9 18 6-6-6-6" />
                        </svg>
                    </button>
                </>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={fotos[indice]}
                alt={`Foto ${indice + 1} de la visita`}
                onClick={(e) => e.stopPropagation()}
                className="max-h-[85vh] max-w-full rounded-xl object-contain"
            />
        </div>
    );
}

export function SubidorFotos({ fotos, onFotosChange, minimo = 0 }: Props) {
    const [subiendo, setSubiendo] = useState(false);
    const [pendientes, setPendientes] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [visor, setVisor] = useState<number | null>(null);

    async function subir(archivos: FileList | null) {
        if (!archivos) return;

        setSubiendo(true);
        setPendientes(archivos.length);
        setError(null);

        const subidas: string[] = [];

        try {
            for (const archivo of Array.from(archivos)) {
                const formData = new FormData();
                formData.append("foto", archivo);

                const response = await fetch("/api/subir-foto", { method: "POST", body: formData });
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error ?? "Fallo al subir una de las fotos");
                }
                subidas.push(data.url);
                setPendientes((n) => Math.max(0, n - 1));
            }
            onFotosChange([...fotos, ...subidas]);
        } catch (e) {
            // Se conservan las que sí subieron: en obra, repetir 8 fotos porque
            // falló la novena es tiempo perdido de verdad.
            if (subidas.length > 0) onFotosChange([...fotos, ...subidas]);
            setError(e instanceof Error ? e.message : "Error desconocido al subir");
        } finally {
            setSubiendo(false);
            setPendientes(0);
        }
    }

    function quitar(url: string) {
        onFotosChange(fotos.filter((f) => f !== url));
    }

    const faltan = Math.max(0, minimo - fotos.length);

    return (
        <div>
            <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Fotos</p>
                <div className="flex items-center gap-2">
                    {fotos.length > 0 && minimo === 0 && (
                        <span className="text-[11px] tabular-nums text-muted">
                            {fotos.length} {fotos.length === 1 ? "foto" : "fotos"}
                        </span>
                    )}
                    {minimo > 0 && (
                        <span
                            className={`text-[11px] font-medium ${faltan === 0 ? "text-muted" : "text-amber-600 dark:text-amber-400"}`}
                        >
                            {fotos.length} de {minimo} mínimo
                        </span>
                    )}
                </div>
            </div>

            {/* auto-fill con celdas de 84 px: tantas columnas como quepan, del
                mismo tamaño en móvil y en escritorio. */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
                {fotos.map((url, i) => (
                    <div key={url} className="group relative aspect-square overflow-hidden rounded-xl bg-canvas">
                        <button
                            type="button"
                            onClick={() => setVisor(i)}
                            aria-label={`Ampliar foto ${i + 1}`}
                            className="h-full w-full cursor-zoom-in"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={url}
                                alt={`Foto ${i + 1} de la visita`}
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-cover transition group-hover:opacity-90"
                            />
                        </button>
                        <button
                            type="button"
                            onClick={() => quitar(url)}
                            aria-label={`Quitar foto ${i + 1}`}
                            className="absolute right-1 top-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-ink/60 text-canvas"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3 w-3">
                                <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                ))}

                {/* Un hueco por foto en cola: con cobertura mala en obra, saber
                    cuántas quedan evita que se vuelva a pulsar el botón y se
                    suban duplicadas. */}
                {Array.from({ length: pendientes }).map((_, i) => (
                    <div
                        key={`pendiente-${i}`}
                        className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-hairline bg-canvas"
                    >
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-hairline border-t-ink" />
                    </div>
                ))}

                <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-hairline text-muted transition hover:border-ink/30 hover:text-ink">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                    </svg>
                    <input
                        type="file"
                        accept="image/*"
                        multiple
                        capture="environment"
                        onChange={(e) => subir(e.target.files)}
                        disabled={subiendo}
                        className="hidden"
                    />
                </label>
            </div>

            {subiendo && (
                <p className="mt-2 text-xs text-muted">
                    Subiendo fotos{pendientes > 0 ? ` (${pendientes} pendiente${pendientes === 1 ? "" : "s"})` : ""}...
                </p>
            )}
            {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

            {visor !== null && fotos[visor] && (
                <Visor fotos={fotos} indice={visor} onCambiar={setVisor} onCerrar={() => setVisor(null)} />
            )}
        </div>
    );
}