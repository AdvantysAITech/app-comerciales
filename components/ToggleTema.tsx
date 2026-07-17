"use client";

import { useState, useEffect } from "react";

export function ToggleTema() {
    const [modoOscuro, setModoOscuro] = useState(false);

    useEffect(() => {
        setModoOscuro(document.documentElement.classList.contains("dark"));
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