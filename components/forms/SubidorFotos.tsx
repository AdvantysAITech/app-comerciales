"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizarFoto } from "@/lib/imagen/normalizar";

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
 *
 * ---------------------------------------------------------------------------
 * GALERÍA Y CÁMARA POR SEPARADO (18/09/2026)
 * ---------------------------------------------------------------------------
 * Había un único input con `capture="environment"`. Ese atributo no es una
 * sugerencia: en Android y en parte de iOS ABRE LA CÁMARA directamente y no
 * deja elegir de la galería. Jose pasa las fotos del móvil al PC por Dropbox y
 * las sube desde el ordenador, así que ese camino estaba cerrado para él.
 *
 * Ahora son dos entradas. La de cámara conserva `capture`; la de galería no lo
 * lleva, que es justo lo que hace que se abra el selector de archivos.
 *
 * Todo lo que entra pasa por `normalizarFoto` antes de subirse: HEIC a JPEG,
 * orientación EXIF aplicada y 1920 px de lado máximo. Ver lib/imagen/normalizar.ts.
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
    const [paso, setPaso] = useState<"preparando" | "subiendo" | null>(null);

    const inputGaleria = useRef<HTMLInputElement>(null);
    const inputCamara = useRef<HTMLInputElement>(null);

    async function subir(archivos: FileList | null) {
        if (!archivos || archivos.length === 0) return;

        setSubiendo(true);
        setPendientes(archivos.length);
        setError(null);

        const subidas: string[] = [];
        const fallos: string[] = [];

        try {
            for (const original of Array.from(archivos)) {
                try {
                    // Normalizar ANTES de subir. Un HEIC de 4 MB sale de aquí
                    // como un JPEG de ~300 KB, con lo que el límite de tamaño
                    // de la petición deja de ser un problema y la subida en
                    // obra con 4G pasa de minutos a segundos.
                    setPaso("preparando");
                    const { archivo } = await normalizarFoto(original);

                    setPaso("subiendo");
                    const formData = new FormData();
                    formData.append("foto", archivo);

                    const response = await fetch("/api/subir-foto", { method: "POST", body: formData });
                    const data = await response.json();

                    if (!response.ok) {
                        throw new Error(data.error ?? "Fallo al subir");
                    }

                    subidas.push(data.url);
                } catch (e) {
                    // Una foto ilegible no puede tumbar las otras nueve: se
                    // anota y se sigue. En obra, repetir la tanda entera por
                    // un archivo malo es tiempo perdido de verdad.
                    fallos.push(`${original.name}: ${e instanceof Error ? e.message : "error"}`);
                } finally {
                    setPendientes((n) => Math.max(0, n - 1));
                }
            }

            if (subidas.length > 0) onFotosChange([...fotos, ...subidas]);
            if (fallos.length > 0) setError(fallos.join(" · "));
        } finally {
            setSubiendo(false);
            setPendientes(0);
            setPaso(null);
            // Sin esto, elegir el mismo archivo dos veces seguidas no dispara
            // `change` y parece que la app se ha quedado colgada.
            if (inputGaleria.current) inputGaleria.current.value = "";
            if (inputCamara.current) inputCamara.current.value = "";
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

                {/* Cámara: conserva `capture`, que es lo que abre el carrete
                    directamente en el móvil. */}
                <label
                    className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-hairline text-muted transition hover:border-ink/30 hover:text-ink ${
                        subiendo ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                    }`}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                    </svg>
                    <span className="text-[10px]">Cámara</span>
                    <input
                        ref={inputCamara}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => subir(e.target.files)}
                        disabled={subiendo}
                        className="hidden"
                    />
                </label>

                {/* Galería: SIN `capture`. Ese atributo es justo lo que impedía
                    a Jose subir desde el ordenador o desde el carrete. Se
                    aceptan .heic/.heif explícitamente porque algunos
                    selectores no los incluyen en `image/*`. */}
                <label
                    className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-hairline text-muted transition hover:border-ink/30 hover:text-ink ${
                        subiendo ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                    }`}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="9" cy="9" r="2" />
                        <path d="m21 15-4.35-4.35a2 2 0 0 0-2.83 0L3 21" />
                    </svg>
                    <span className="text-[10px]">Galería</span>
                    <input
                        ref={inputGaleria}
                        type="file"
                        accept="image/*,.heic,.heif"
                        multiple
                        onChange={(e) => subir(e.target.files)}
                        disabled={subiendo}
                        className="hidden"
                    />
                </label>
            </div>

            {subiendo && (
                <p className="mt-2 text-xs text-muted">
                    {paso === "preparando" ? "Preparando fotos" : "Subiendo fotos"}
                    {pendientes > 0 ? ` (${pendientes} pendiente${pendientes === 1 ? "" : "s"})` : ""}...
                </p>
            )}
            {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

            {visor !== null && fotos[visor] && (
                <Visor fotos={fotos} indice={visor} onCambiar={setVisor} onCerrar={() => setVisor(null)} />
            )}
        </div>
    );
}