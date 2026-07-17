"use client";

import { useState, useEffect } from "react";

export function ToggleTema() {
    const [modoOscuro, setModoOscuro] = useState(() => {
        if (typeof document === "undefined") return false;
        return document.documentElement.classList.contains("dark");
    });

    useEffect(() => {
        const guardado = localStorage.getItem("tema");
        const prefiereOscuro = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const oscuro = guardado === "dark" || (!guardado && prefiereOscuro);
        document.documentElement.classList.toggle("dark", oscuro);
        // Sincroniza el estado de React con localStorage/preferencia del SO al montar: caso legítimo, no un derivado de props/estado.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (oscuro !== modoOscuro) setModoOscuro(oscuro);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function alternar() {
        const nuevo = !modoOscuro;
        setModoOscuro(nuevo);
        document.documentElement.classList.toggle("dark", nuevo);
        localStorage.setItem("tema", nuevo ? "dark" : "light");
    }

    return (
        <button
            onClick={alternar}
            aria-label="Alternar modo oscuro"
            className={`relative h-5 w-9 rounded-full transition ${modoOscuro ? "bg-accent" : "bg-hairline"}`}
        >
            <span
                className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-surface transition-transform ${
                    modoOscuro ? "translate-x-4" : "translate-x-0"
                }`}
            />
        </button>
    );
}