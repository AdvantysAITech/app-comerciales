"use client";

import { useRouter } from "next/navigation";
import { useEffect, useCallback } from "react";

/**
 * Modal de la ficha de oportunidad.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ EL SCROLL VIVE EN EL FONDO Y NO EN EL PANEL
 * ---------------------------------------------------------------------------
 * La primera versión centraba el panel con `flex items-center` sobre un fondo
 * `fixed` sin desbordamiento. Con una visita de diez módulos, la descripción
 * hace crecer el panel más que la pantalla, y al estar centrado se sale por
 * ARRIBA y por abajo a la vez: el comercial veía la franja del medio y no podía
 * llegar ni al botón de cerrar ni al de generar presupuesto.
 *
 * La solución es el patrón habitual: el desbordamiento lo lleva la capa de
 * fondo, y dentro va un contenedor con `min-h-full` que centra. Contenido
 * corto -> centrado; contenido largo -> se desplaza. Sin alturas máximas
 * calculadas a mano, que en móvil fallan por la barra del navegador.
 */
export function Modal({ children }: { children: React.ReactNode }) {
    const router = useRouter();

    const cerrar = useCallback(() => {
        router.back();
    }, [router]);

    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") cerrar();
        }
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [cerrar]);

    // Se bloquea el scroll del documento mientras el modal está abierto. Si no,
    // en móvil el dedo arrastra la lista de detrás en cuanto el modal llega a su
    // tope, y el comercial pierde el sitio.
    useEffect(() => {
        const previo = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previo;
        };
    }, []);

    return (
        <div
            className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/50 backdrop-blur-sm"
            onClick={cerrar}
        >
            <div className="flex min-h-full items-center justify-center p-4">
                <div
                    className="w-full max-w-lg rounded-3xl border border-hairline bg-surface p-6 shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* `sticky` para que el botón de cerrar siga accesible al
                        bajar por una ficha larga. Funciona porque el scroll lo
                        lleva el fondo, no este panel. */}
                    <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-3 flex justify-end rounded-t-3xl bg-surface px-6 pt-6">
                        <button
                            onClick={cerrar}
                            aria-label="Cerrar"
                            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-accent/10 hover:text-ink"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
                                <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    {children}
                </div>
            </div>
        </div>
    );
}