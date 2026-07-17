"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const ENLACES = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    href: "/visitas/nueva",
    label: "Nuevo presupuesto",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
        <path d="M12 5v14M5 12h14" />
      </svg>
    ),
  },
];

export function Navbar() {
  const pathname = usePathname();
  const [colapsado, setColapsado] = useState(false);

  useEffect(() => {
    const guardadoColapso = localStorage.getItem("navbar-colapsado");
    if (guardadoColapso === "true") setColapsado(true);

    const guardadoTema = localStorage.getItem("tema");
    if (guardadoTema === "dark") {
      document.documentElement.classList.add("dark");
    }
  }, []);

  function alternarColapso() {
    const nuevo = !colapsado;
    setColapsado(nuevo);
    localStorage.setItem("navbar-colapsado", String(nuevo));
  }

  return (
    <nav
      className={`flex h-screen flex-col border-r border-hairline bg-surface transition-all duration-200 ${
        colapsado ? "w-18" : "w-60"
      }`}
    >
      <button
        onClick={alternarColapso}
        aria-label={colapsado ? "Expandir menú" : "Colapsar menú"}
        className="flex h-14 items-center justify-center border-b border-hairline text-muted hover:text-ink"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-5 w-5 transition-transform ${colapsado ? "rotate-180" : ""}`}
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      <div className="flex-1 space-y-1 p-3">
        {ENLACES.map((enlace) => {
          const activo = pathname === enlace.href;
          return (
            <Link
              key={enlace.href}
              href={enlace.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                activo ? "bg-accent/15 text-ink" : "text-muted hover:bg-accent/10 hover:text-ink"
              }`}
            >
              {enlace.icon}
              {!colapsado && <span className="truncate">{enlace.label}</span>}
            </Link>
          );
        })}
      </div>

      <div className="space-y-1 border-t border-hairline p-3">
        <Link
          href="/ajustes"
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
            pathname === "/ajustes" ? "bg-accent/15 text-ink" : "text-muted hover:bg-accent/10 hover:text-ink"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
          </svg>
          {!colapsado && <span className="truncate">Usuario</span>}
        </Link>

        <button
          onClick={() => signOut({ redirectTo: "/login" })}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition hover:bg-red-500/10 hover:text-red-600"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="M16 17l5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
          {!colapsado && <span className="truncate">Cerrar sesión</span>}
        </button>
      </div>
    </nav>
  );
}