"use client";

import { useEffect, useRef, useState } from "react";
import { trocearAWav } from "@/lib/audio/wav";

/**
 * Dictado de observaciones (DERCAS §6.2).
 *
 * El componente no escribe en el formulario: devuelve el texto por
 * `onTranscripcion` y quien lo usa decide qué hacer con él. Así se puede
 * reutilizar en el módulo "Varios" o en el reporte de obra de Fase 2 sin tocarlo.
 *
 * La transcripción NO sustituye lo escrito: se añade. Perder texto que el
 * comercial ya había tecleado por pulsar un botón sería un fallo grave en obra.
 */

const SEGUNDOS_MAXIMOS = 180;

/**
 * Segundos por trozo. 30 s son ~960 KB de WAV, muy por debajo del tope de
 * 4,5 MB por petición de Vercel.
 */
const SEGUNDOS_POR_TROZO = 30;

/** Peticiones simultáneas. Más de tres no acelera y castiga la red en obra. */
const CONCURRENCIA = 3;

/**
 * Corte por petición.
 *
 * ES LA PIEZA QUE FALTABA. Sin `AbortController`, un `fetch` que se queda
 * colgado (cobertura mala, función que muere sin responder, pestaña
 * suspendida por el móvil) no rechaza NUNCA: el estado se quedaba en
 * "procesando" y el spinner giraba indefinidamente. Es literalmente lo que
 * describió Jose el 18/09: "a la hora y pico seguía dándole vueltas".
 * No era Gemini tardando una hora, era la interfaz sin salida.
 */
const TIEMPO_MAXIMO_MS = 45000;

type Estado = "inactivo" | "grabando" | "procesando";

type Props = {
    onTranscripcion: (texto: string) => void;
    disabled?: boolean;
};

export function GrabadorVoz({ onTranscripcion, disabled = false }: Props) {
    const [estado, setEstado] = useState<Estado>("inactivo");
    const [segundos, setSegundos] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [total, setTotal] = useState(0);
    const [listos, setListos] = useState(0);

    const grabadorRef = useRef<MediaRecorder | null>(null);
    const trozosRef = useRef<Blob[]>([]);
    const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Si el comercial navega fuera con la grabación abierta, hay que soltar el
    // micrófono. Si no, Android deja el indicador encendido indefinidamente.
    useEffect(() => {
        return () => {
            if (intervaloRef.current) clearInterval(intervaloRef.current);
            const grabador = grabadorRef.current;
            if (grabador && grabador.state !== "inactive") {
                grabador.stop();
            }
            grabador?.stream.getTracks().forEach((pista) => pista.stop());
        };
    }, []);

    async function empezar() {
        setError(null);

        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
            setError("Este navegador no permite grabar audio. Escribe las observaciones a mano.");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            // Sin `mimeType`: cada navegador graba en lo que sabe (webm en
            // Chrome, mp4 en Safari) y la conversión a WAV lo unifica después.
            const grabador = new MediaRecorder(stream);
            trozosRef.current = [];

            grabador.ondataavailable = (evento) => {
                if (evento.data.size > 0) trozosRef.current.push(evento.data);
            };

            grabador.onstop = async () => {
                stream.getTracks().forEach((pista) => pista.stop());
                await procesar(new Blob(trozosRef.current, { type: grabador.mimeType }));
            };

            grabador.start();
            grabadorRef.current = grabador;
            setEstado("grabando");
            setSegundos(0);

            intervaloRef.current = setInterval(() => {
                setSegundos((valor) => {
                    if (valor + 1 >= SEGUNDOS_MAXIMOS) parar();
                    return valor + 1;
                });
            }, 1000);
        } catch {
            setError("No se ha podido acceder al micrófono. Revisa los permisos del navegador.");
        }
    }

    function parar() {
        if (intervaloRef.current) {
            clearInterval(intervaloRef.current);
            intervaloRef.current = null;
        }
        const grabador = grabadorRef.current;
        if (grabador && grabador.state !== "inactive") {
            grabador.stop();
        }
        setEstado("procesando");
    }

    /** Una petición, con corte por tiempo y un reintento. */
    async function transcribirTrozo(trozo: File, reintentos = 1): Promise<string> {
        const controlador = new AbortController();
        const corte = setTimeout(() => controlador.abort(), TIEMPO_MAXIMO_MS);

        try {
            const formData = new FormData();
            formData.append("audio", trozo);

            const respuesta = await fetch("/api/transcribir-audio", {
                method: "POST",
                body: formData,
                signal: controlador.signal,
            });

            // Un 413 o un 504 de la plataforma no devuelven JSON, así que
            // `json()` reventaría con un error de parseo que no dice nada.
            if (!respuesta.ok) {
                const cuerpo = await respuesta.text();
                let mensaje = `Error ${respuesta.status}`;
                try {
                    mensaje = JSON.parse(cuerpo)?.error ?? mensaje;
                } catch {
                    if (respuesta.status === 413) mensaje = "El fragmento de audio es demasiado grande";
                    if (respuesta.status === 504) mensaje = "El servidor ha tardado demasiado";
                }
                throw new Error(mensaje);
            }

            const datos = await respuesta.json();
            return (datos.texto as string) ?? "";
        } catch (e) {
            // Un corte de red en obra es lo normal, no la excepción: se
            // reintenta una vez antes de darlo por perdido.
            if (reintentos > 0) return transcribirTrozo(trozo, reintentos - 1);

            if (e instanceof DOMException && e.name === "AbortError") {
                throw new Error("La transcripción ha tardado demasiado");
            }
            throw e;
        } finally {
            clearTimeout(corte);
        }
    }

    async function procesar(blob: Blob) {
        try {
            const trozos = await trocearAWav(blob, SEGUNDOS_POR_TROZO);

            if (trozos.length === 0) throw new Error("La grabación está vacía");

            setTotal(trozos.length);
            setListos(0);

            /**
             * Los trozos se lanzan en paralelo pero el resultado se guarda POR
             * ÍNDICE. Con `push` el orden dependería de cuál conteste antes y
             * la observación saldría desordenada, que es peor que no tenerla.
             */
            const textos: (string | null)[] = new Array(trozos.length).fill(null);
            const fallos: number[] = [];
            let siguiente = 0;

            async function trabajador() {
                while (siguiente < trozos.length) {
                    const i = siguiente++;
                    try {
                        textos[i] = await transcribirTrozo(trozos[i]);
                    } catch {
                        fallos.push(i + 1);
                        textos[i] = "";
                    } finally {
                        setListos((n) => n + 1);
                    }
                }
            }

            await Promise.all(
                Array.from({ length: Math.min(CONCURRENCIA, trozos.length) }, trabajador)
            );

            const texto = textos.map((t) => t ?? "").join(" ").replace(/\s+/g, " ").trim();

            if (fallos.length > 0) {
                // Se entrega lo que sí ha llegado: media observación es mejor
                // que ninguna cuando ya se ha salido de la comunidad.
                setError(
                    `No se han podido transcribir ${fallos.length} de ${trozos.length} fragmentos. ` +
                        `Revisa el texto y completa lo que falte.`
                );
            }

            if (texto === "") {
                if (fallos.length === 0) {
                    setError("No se ha entendido nada en la grabación. Prueba otra vez.");
                }
            } else {
                onTranscripcion(texto);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error al transcribir el audio");
        } finally {
            setEstado("inactivo");
            setSegundos(0);
            setTotal(0);
            setListos(0);
            grabadorRef.current = null;
            trozosRef.current = [];
        }
    }

    const bloqueado = disabled || estado === "procesando";

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={estado === "grabando" ? parar : empezar}
                    disabled={bloqueado}
                    // min-h-11: se pulsa en obra, de pie y con guantes.
                    className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        estado === "grabando"
                            ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
                            : "border-hairline text-ink hover:border-ink/20"
                    }`}
                >
                    {estado === "grabando" ? (
                        <>
                            <span className="h-2.5 w-2.5 animate-pulse rounded-sm bg-red-500" />
                            Parar y transcribir
                        </>
                    ) : estado === "procesando" ? (
                        <>
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-hairline border-t-ink" />
                            {total > 1 ? `Transcribiendo ${listos} de ${total}...` : "Transcribiendo..."}
                        </>
                    ) : (
                        <>
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-4 w-4"
                            >
                                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                <path d="M12 19v3" />
                            </svg>
                            Dictar observaciones
                        </>
                    )}
                </button>

                {estado === "grabando" && (
                    <span className="text-xs tabular-nums text-muted">
                        {formatearTiempo(segundos)} / {formatearTiempo(SEGUNDOS_MAXIMOS)}
                    </span>
                )}
            </div>

            {error && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    {error}
                </p>
            )}
        </div>
    );
}

function formatearTiempo(total: number): string {
    const minutos = Math.floor(total / 60);
    const restantes = total % 60;
    return `${minutos}:${String(restantes).padStart(2, "0")}`;
}