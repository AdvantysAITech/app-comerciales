"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cerrarSesion } from "@/app/actions/auth";

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
  {
    href: "/ajustes",
    label: "Ajustes",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
];

export function Navbar() {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const guardado = localStorage.getItem("navbar-abierto");
    if (guardado === "true") setAbierto(true);
  }, []);

  function alternar() {
    const nuevo = !abierto;
    setAbierto(nuevo);
    localStorage.setItem("navbar-abierto", String(nuevo));
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-1 rounded-full border border-hairline bg-surface p-1.5 shadow-lg">
        {abierto && (
          <>
            {ENLACES.map((enlace) => {
              const activo = pathname === enlace.href;
              return (
                <Link
                  key={enlace.href}
                  href={enlace.href}
                  aria-label={enlace.label}
                  className={`flex h-11 w-11 items-center justify-center rounded-full transition ${
                    activo ? "bg-accent/15 text-ink" : "text-muted hover:bg-accent/10 hover:text-ink"
                  }`}
                >
                  {enlace.icon}
                </Link>
              );
            })}
            <button
              onClick={() => cerrarSesion()}
              aria-label="Cerrar sesión"
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-muted transition hover:bg-red-500/10 hover:text-red-600"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </button>
          </>
        )}

        <button
          onClick={alternar}
          aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
          className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-accent text-canvas shadow-md transition hover:brightness-105"
        >
          {abierto ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}