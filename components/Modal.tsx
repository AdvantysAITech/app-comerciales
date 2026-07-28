"use client";

import { useRouter } from "next/navigation";
import { useEffect, useCallback } from "react";

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

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={cerrar}
        >
            <div
                className="w-full max-w-lg rounded-3xl border border-hairline bg-surface p-6 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={cerrar}
                    aria-label="Cerrar"
                    className="mb-3 ml-auto flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-accent/10 hover:text-ink"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
                        <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                </button>
                {children}
            </div>
        </div>
    );
}