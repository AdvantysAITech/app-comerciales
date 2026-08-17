"use client";

import { useState } from "react";

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
 */

type Props = {
    fotos: string[];
    onFotosChange: (fotos: string[]) => void;
    /** Mínimo exigido. 0 = sin mínimo. */
    minimo?: number;
};

export function SubidorFotos({ fotos, onFotosChange, minimo = 0 }: Props) {
    const [subiendo, setSubiendo] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function subir(archivos: FileList | null) {
        if (!archivos) return;

        setSubiendo(true);
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
            }
            onFotosChange([...fotos, ...subidas]);
        } catch (e) {
            // Se conservan las que sí subieron: en obra, repetir 8 fotos porque
            // falló la novena es tiempo perdido de verdad.
            if (subidas.length > 0) onFotosChange([...fotos, ...subidas]);
            setError(e instanceof Error ? e.message : "Error desconocido al subir");
        } finally {
            setSubiendo(false);
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
                {minimo > 0 && (
                    <span
                        className={`text-[11px] font-medium ${faltan === 0 ? "text-muted" : "text-amber-600 dark:text-amber-400"}`}
                    >
                        {fotos.length} de {minimo} mínimo
                    </span>
                )}
            </div>

            <div className="grid grid-cols-4 gap-2">
                {fotos.map((url) => (
                    <div key={url} className="group relative aspect-square overflow-hidden rounded-xl bg-canvas">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="Foto de la visita" className="h-full w-full object-cover" />
                        <button
                            type="button"
                            onClick={() => quitar(url)}
                            aria-label="Quitar foto"
                            className="absolute right-1 top-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-ink/60 text-canvas"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3 w-3">
                                <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                        </button>
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

            {subiendo && <p className="mt-2 text-xs text-muted">Subiendo fotos...</p>}
            {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
    );
}