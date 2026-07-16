"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function Loginage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("")
    const [isLoading, setIsLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        const resultado = await signIn("credentials", {
            email,
            password,
            redirect: false,
        });

        setIsLoading(false);

        if (resultado?.error){
            setError("Email o contraseña incorrectos");
            return;
        }

        router.push("/");
    }

    return (
        <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-sky-300 via-sky-100 to-white px-4 py-12">

        <div className="w-full max-w-md rounded-3xl bg-cloud p-8 shadow-xl shadow-sky-500/20 sm:p-10">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100">
            <svg
                className="h-6 w-6 text-navy-900"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <rect x="4" y="2" width="16" height="20" rx="1" />
                <path d="M9 22v-4h6v4" />
                <path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" />
            </svg>
            </div>

            <h1 className="text-2xl font-semibold text-navy-900">Acceso comerciales</h1>
            <p className="mt-2 text-sm text-slate-500">
            Entra para gestionar tus visitas y presupuestos.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-navy-900">
                Email
                </label>
                <div className="relative">
                <svg
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 6-10 7L2 6" />
                </svg>
                <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    className="w-full rounded-xl border border-slate-500/20 bg-sky-100/40 py-2.5 pl-10 pr-3 text-sm text-navy-900 placeholder:text-slate-500/70 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                />
                </div>
            </div>

            <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-navy-900">
                Contraseña
                </label>
                <div className="relative">
                <svg
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <rect x="3" y="11" width="18" height="10" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-500/20 bg-sky-100/40 py-2.5 pl-10 pr-10 text-sm text-navy-900 placeholder:text-slate-500/70 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                />
                <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-navy-900"
                >
                    {showPassword ? (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a13.16 13.16 0 0 1-1.67 2.68" />
                        <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 8 10 8a9.74 9.74 0 0 0 5.39-1.61" />
                        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                        <path d="M1 1l22 22" />
                    </svg>
                    ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s3-8 11-8 11 8 11 8-3 8-11 8-11-8-11-8Z" />
                        <circle cx="12" cy="12" r="3" />
                    </svg>
                    )}
                </button>
                </div>
            </div>

            {error && (
                <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
                </p>
            )}

            <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-xl bg-ink-900 py-3 text-sm font-semibold text-white transition hover:bg-navy-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {isLoading ? "Entrando…" : "Entrar"}
            </button>
            </form>
        </div>

        <p className="mt-8 text-xs text-slate-500">
            © {new Date().getFullYear()} Powered by AvantysAI
        </p>
        </main>
    );
}