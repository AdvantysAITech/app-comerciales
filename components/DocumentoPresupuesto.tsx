"use client";

import { useEffect, useRef, useState } from "react";
import type { RegistroDocumento } from "@/lib/documentos/estado";

/**
 * Generación y seguimiento del presupuesto desde la ficha de la oportunidad.
 *
 * La generación es asíncrona (~40 s) y el comercial puede cerrar la ficha o
 * quedarse sin cobertura en obra. Por eso el estado real vive en GHL y este
 * componente solo lo refleja: al volver a abrir la ficha, el registro se lee del
 * servidor y se ve en qué punto está, sin depender de que el polling siguiera
 * vivo.
 */

type Props = {
    oportunidadId: string;
    /** Registro leído en servidor al montar la ficha. */
    registroInicial: RegistroDocumento | null;
    /** Falso mientras la subcuenta no tenga configurado el campo de estado. */
    disponible: boolean;
};

type Respuesta = {
    requestId?: string;
    /** `false` si el documento se publicó sin la infografía de portada. */
    conPortada?: boolean;
    estado?: string;
    borrador?: boolean;
    urlDocumento?: string;
    tokens?: number;
    errores?: string[];
    aviso?: string;
    avisos?: string[];
    error?: string;
};

const ETIQUETA: Record<string, string> = {
    solicitado: "Solicitado",
    generando: "Generando...",
    recibido: "Generado",
    validado: "Validado",
    publicado: "Disponible",
    fallido: "Falló",
};

const INTERVALO_MS = 5000;
const INTENTOS_MAXIMOS = 30;

export function DocumentoPresupuesto({ oportunidadId, registroInicial, disponible }: Props) {
    const [registro, setRegistro] = useState<Respuesta | null>(registroInicial);
    const [trabajando, setTrabajando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [avisos, setAvisos] = useState<string[]>([]);
    const cancelado = useRef(false);
    const siguiendo = useRef(false);

    async function seguir(requestId: string) {
        if (siguiendo.current) return;
        siguiendo.current = true;

        try {
            await bucleDeSeguimiento(requestId);
        } finally {
            siguiendo.current = false;
        }
    }

    async function bucleDeSeguimiento(requestId: string) {
        for (let i = 0; i < INTENTOS_MAXIMOS; i++) {
            if (cancelado.current) return;

            const respuesta = await fetch(`/api/documentos/estado/${requestId}`);
            const datos = (await respuesta.json()) as Respuesta;

            if (datos.error) {
                setError(datos.error);
                return;
            }

            setRegistro(datos);
            if (datos.avisos?.length) setAvisos(datos.avisos);
            if (datos.estado !== "generando") return;

            await new Promise((r) => setTimeout(r, INTERVALO_MS));
        }

        setError("La generación está tardando más de lo normal. Vuelve a abrir la ficha en unos minutos.");
    }

    /**
     * Reanuda el seguimiento al abrir la ficha.
     *
     * Sin esto, un registro que se quedó en un estado no terminal -- porque la
     * ruta reventó, o porque el comercial cerró la ficha mientras generaba --
     * dejaba la UI en "Generando..." PARA SIEMPRE: el botón queda deshabilitado
     * y nadie vuelve a preguntar por el estado. Ya pasó con una oportunidad
     * atascada en `generando` cuyo documento estaba listo en la app desde hacía
     * rato.
     */
    useEffect(() => {
        const estadoInicial = registroInicial?.estado;
        const enCurso = estadoInicial === "generando" || estadoInicial === "solicitado";

        if (!disponible || !enCurso || !registroInicial?.requestId) return;

        cancelado.current = false;
        void seguir(registroInicial.requestId);

        return () => {
            cancelado.current = true;
        };
        // Solo al montar: el resto del ciclo lo gobierna `generar()`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function generar() {
        setTrabajando(true);
        setError(null);
        setAvisos([]);
        cancelado.current = false;

        try {
            // Si ya hubo un intento, se sube la version: un RequestId nuevo
            // obliga a la app a rehacer el documento. Con el mismo id devolveria
            // `alreadyExisted` y el comercial vería el documento antiguo.
            const version = registro?.requestId
                ? Number(registro.requestId.match(/-v(\d+)$/)?.[1] ?? 1) + 1
                : 1;

            const respuesta = await fetch("/api/documentos/generar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ oportunidadId, version }),
            });

            const datos = (await respuesta.json()) as Respuesta;
            if (!respuesta.ok) throw new Error(datos.error ?? `Error ${respuesta.status}`);

            setAvisos(datos.avisos ?? []);
            setRegistro({ ...datos, estado: "generando" });

            if (datos.requestId) await seguir(datos.requestId);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error desconocido");
        } finally {
            setTrabajando(false);
        }
    }

    if (!disponible) {
        return (
            <p className="rounded-xl border border-dashed border-hairline px-3 py-3 text-center text-xs text-muted">
                La generación de presupuestos no está habilitada todavía en esta subcuenta.
            </p>
        );
    }

    const estado = registro?.estado;
    const enCurso = trabajando || estado === "generando" || estado === "solicitado";

    return (
        <div className="flex flex-col gap-2">
            {estado && (
                <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-ink">
                        {ETIQUETA[estado] ?? estado}
                        {registro?.borrador && (
                            <span className="ml-2 rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                                borrador
                            </span>
                        )}
                    </span>
                    {typeof registro?.tokens === "number" && registro.tokens > 0 && (
                        <span className="shrink-0 text-[11px] text-muted">
                            {registro.tokens.toLocaleString("es-ES")} tokens
                        </span>
                    )}
                </div>
            )}

            {registro?.estado === "publicado" && registro.conPortada === false && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
                    El presupuesto se ha generado sin la infografía de portada.
                </p>
            )}

            {registro?.urlDocumento && (
                <a
                    href={registro.urlDocumento}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full rounded-xl bg-ink py-2.5 text-center text-sm font-semibold text-canvas"
                >
                    Descargar presupuesto
                </a>
            )}

            {/* El borrador NO se publica: sin precios reales no es un
                presupuesto, y ofrecerlo para descarga invitaria a enviarlo. */}
            {registro?.borrador && estado === "recibido" && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
                    Generado sin precios de catálogo. No se puede enviar al administrador.
                </p>
            )}

            {registro?.errores && registro.errores.length > 0 && (
                <ul className="flex flex-col gap-1 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
                    {registro.errores.map((e, i) => (
                        <li key={i} className="text-[11px] text-red-700 dark:text-red-400">
                            {e}
                        </li>
                    ))}
                </ul>
            )}

            {avisos.map((a, i) => (
                <p key={i} className="text-[11px] text-muted">
                    {a}
                </p>
            ))}

            {error && (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-700 dark:text-red-400">
                    {error}
                </p>
            )}

            <button
                type="button"
                onClick={generar}
                disabled={enCurso}
                className={`w-full rounded-xl border border-hairline py-2.5 text-sm font-medium text-ink transition ${
                    enCurso ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-canvas"
                }`}
            >
                {enCurso ? "Generando..." : estado ? "Volver a generar" : "Generar presupuesto"}
            </button>
        </div>
    );
}