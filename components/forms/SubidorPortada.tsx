"use client";

import { useRef, useState } from "react";
import { normalizarFoto } from "@/lib/imagen/normalizar";

/**
 * Imagen de portada del presupuesto (29/09/2026).
 *
 * Una sola foto: la que ocupa la parte de arriba de la infografía de portada.
 * Sube a GHL en cuanto se elige, igual que las fotos de los trabajos, y aquí
 * solo se guarda la URL (sobrevive al borrador).
 *
 * La miniatura tiene proporción apaisada y recorta igual que el documento,
 * así el comercial ve qué parte de la foto va a salir. Si no sube ninguna,
 * el documento usa la primera foto de los trabajos.
 *
 * Mismo criterio que `SubidorFotos`: cámara y galería por separado (`capture`
 * abre la cámara sin dejar elegir de la galería) y todo pasa por
 * `normalizarFoto` antes de subir (HEIC a JPEG, orientación aplicada, 1920 px).
 */

type Props = {
    imagen: string | null;
    onImagenChange: (url: string | null) => void;
    disabled?: boolean;
};

export function SubidorPortada({ imagen, onImagenChange, disabled = false }: Props) {
    const [paso, setPaso] = useState<"preparando" | "subiendo" | null>(null);
    const [error, setError] = useState<string | null>(null);

    const inputGaleria = useRef<HTMLInputElement>(null);
    const inputCamara = useRef<HTMLInputElement>(null);

    const ocupado = paso !== null || disabled;

    async function subir(archivos: FileList | null) {
        const original = archivos?.[0];
        if (!original) return;

        setError(null);
        try {
            setPaso("preparando");
            const { archivo } = await normalizarFoto(original);

            setPaso("subiendo");
            const formData = new FormData();
            formData.append("foto", archivo);

            const respuesta = await fetch("/api/subir-foto", { method: "POST", body: formData });
            const datos = await respuesta.json().catch(() => ({}));
            if (!respuesta.ok || typeof datos.url !== "string") {
                throw new Error(datos.error ?? `Error ${respuesta.status}`);
            }

            onImagenChange(datos.url);
        } catch (e) {
            setError(e instanceof Error ? e.message : "No se ha podido subir la imagen");
        } finally {
            setPaso(null);
            // Sin esto, elegir el mismo archivo dos veces seguidas no dispara `change`.
            if (inputGaleria.current) inputGaleria.current.value = "";
            if (inputCamara.current) inputCamara.current.value = "";
        }
    }

    const boton = `flex items-center justify-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-xs text-ink transition hover:border-ink/30 ${
        ocupado ? "cursor-not-allowed opacity-50" : "cursor-pointer"
    }`;

    // Recuadro pequeño (29/09/2026): miniatura de ancho fijo con la
    // proporción del hueco de la portada y los botones al lado. A ancho
    // completo, en escritorio ocupaba la pantalla entera.
    return (
        <div>
            <div className="flex items-center gap-3">
                <div className="relative aspect-[16/9] w-36 shrink-0 overflow-hidden rounded-xl border border-hairline bg-canvas sm:w-44">
                    {imagen ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imagen} alt="Imagen de portada" className="h-full w-full object-cover" />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <circle cx="9" cy="9" r="2" />
                                <path d="m21 15-4.35-4.35a2 2 0 0 0-2.83 0L3 21" />
                            </svg>
                        </div>
                    )}

                    {paso && (
                        <div className="absolute inset-0 flex items-center justify-center bg-canvas/80">
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-hairline border-t-ink" />
                        </div>
                    )}

                    {imagen && !paso && (
                        <button
                            type="button"
                            onClick={() => onImagenChange(null)}
                            disabled={disabled}
                            aria-label="Quitar imagen de portada"
                            className="absolute right-1 top-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-ink/60 text-canvas disabled:opacity-50"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
                                <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    <p className="text-xs text-ink">
                        {paso === "preparando"
                            ? "Preparando imagen..."
                            : paso === "subiendo"
                              ? "Subiendo imagen..."
                              : imagen
                                ? "Imagen de portada elegida"
                                : "Sin imagen de portada"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                        {imagen ? "Sale arriba en la portada del presupuesto." : "Se usará la primera foto de los trabajos."}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                        <label className={boton}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                <circle cx="12" cy="13" r="4" />
                            </svg>
                            Cámara
                            <input
                                ref={inputCamara}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={(e) => subir(e.target.files)}
                                disabled={ocupado}
                                className="hidden"
                            />
                        </label>
                        <label className={boton}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <circle cx="9" cy="9" r="2" />
                                <path d="m21 15-4.35-4.35a2 2 0 0 0-2.83 0L3 21" />
                            </svg>
                            {imagen ? "Cambiar" : "Galería"}
                            <input
                                ref={inputGaleria}
                                type="file"
                                accept="image/*,.heic,.heif"
                                onChange={(e) => subir(e.target.files)}
                                disabled={ocupado}
                                className="hidden"
                            />
                        </label>
                    </div>
                </div>
            </div>

            {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
    );
}