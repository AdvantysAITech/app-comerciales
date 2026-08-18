"use client";

import { useRef, useState } from "react";
import {
    ACEPTA_INPUT,
    formatearBytes,
    motivoRechazo,
    normalizarEnlace,
    type DocumentoAdjunto,
} from "@/lib/documentos/tipos";

/**
 * Documentación de proyecto del módulo "Proyectos".
 *
 * Dos vías a propósito:
 *  - Subida directa, para BC3 y Excel de mediciones, que pesan poco.
 *  - Enlace externo, para el PDF del proyecto con planos. Un proyecto completo
 *    ronda los cientos de MB y las funciones serverless de Vercel cortan el
 *    cuerpo de la peticion sobre 4,5 MB: por ahi no entra ni entrara. El
 *    administrador ya manda esos ficheros por Drive o WeTransfer, asi que se
 *    guarda el enlace tal cual.
 *
 * Controlado desde fuera igual que SubidorFotos: el estado vive en el
 * formulario, que es quien lo autoguarda y lo envia.
 */

type Props = {
    documentos: DocumentoAdjunto[];
    onDocumentosChange: (documentos: DocumentoAdjunto[]) => void;
    disabled?: boolean;
};

export function SubidorDocumentos({ documentos, onDocumentosChange, disabled = false }: Props) {
    const [subiendo, setSubiendo] = useState(false);
    const [errores, setErrores] = useState<string[]>([]);
    const [mostrarEnlace, setMostrarEnlace] = useState(false);
    const [enlace, setEnlace] = useState("");
    const [nombreEnlace, setNombreEnlace] = useState("");

    const inputRef = useRef<HTMLInputElement>(null);

    async function elegirArchivos(lista: FileList | null) {
        if (!lista || lista.length === 0) return;

        setErrores([]);
        setSubiendo(true);

        const nuevos: DocumentoAdjunto[] = [];
        const fallos: string[] = [];

        // En serie, no en paralelo: en obra la subida compite con poca cobertura
        // y varias peticiones a la vez hacen que fallen todas en lugar de una.
        for (const archivo of Array.from(lista)) {
            const rechazo = motivoRechazo(archivo.name, archivo.size);
            if (rechazo) {
                fallos.push(rechazo);
                continue;
            }

            try {
                const formData = new FormData();
                formData.append("documento", archivo);

                const respuesta = await fetch("/api/subir-documento", {
                    method: "POST",
                    body: formData,
                });

                const datos = await respuesta.json();
                if (!respuesta.ok) throw new Error(datos?.error ?? "Error al subir");

                nuevos.push(datos as DocumentoAdjunto);
            } catch (e) {
                fallos.push(
                    `"${archivo.name}": ${e instanceof Error ? e.message : "no se ha podido subir"}`
                );
            }
        }

        if (nuevos.length > 0) onDocumentosChange([...documentos, ...nuevos]);
        setErrores(fallos);
        setSubiendo(false);

        // Sin esto, volver a elegir el mismo fichero no dispara el onChange.
        if (inputRef.current) inputRef.current.value = "";
    }

    function anadirEnlace() {
        const url = normalizarEnlace(enlace);

        if (!url) {
            setErrores(["El enlace no es válido. Tiene que empezar por http:// o https://"]);
            return;
        }

        onDocumentosChange([
            ...documentos,
            {
                nombre: nombreEnlace.trim() || "Documentación del proyecto",
                url,
                extension: "enlace",
                origen: "enlace",
            },
        ]);

        setEnlace("");
        setNombreEnlace("");
        setMostrarEnlace(false);
        setErrores([]);
    }

    function quitar(indice: number) {
        onDocumentosChange(documentos.filter((_, i) => i !== indice));
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                    Documentación del proyecto
                </p>
                {documentos.length > 0 && (
                    <span className="text-xs text-muted">{documentos.length}</span>
                )}
            </div>

            <p className="text-xs text-muted">
                Mediciones y presupuesto del arquitecto: .bc3, .xlsx o .pdf. Si el proyecto con planos
                pesa más de {formatearBytes(4 * 1024 * 1024)}, pega el enlace de Drive.
            </p>

            {documentos.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                    {documentos.map((doc, i) => (
                        <li
                            key={`${doc.url}-${i}`}
                            className="flex items-center gap-2 rounded-xl border border-hairline px-3 py-2"
                        >
                            <span className="shrink-0 rounded-md border border-hairline px-1.5 py-0.5 text-[10px] uppercase text-muted">
                                {doc.extension === "enlace" ? "link" : doc.extension}
                            </span>

                            <a
                                href={doc.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 truncate text-sm text-ink underline decoration-hairline underline-offset-2"
                            >
                                {doc.nombre}
                            </a>

                            {doc.bytes !== undefined && (
                                <span className="shrink-0 text-[11px] text-muted">
                                    {formatearBytes(doc.bytes)}
                                </span>
                            )}

                            <button
                                type="button"
                                onClick={() => quitar(i)}
                                disabled={disabled || subiendo}
                                aria-label={`Quitar ${doc.nombre}`}
                                className="shrink-0 cursor-pointer rounded-md p-1 text-muted transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    className="h-4 w-4"
                                >
                                    <path d="M18 6 6 18M6 6l12 12" />
                                </svg>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <div className="flex flex-wrap gap-2">
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={ACEPTA_INPUT}
                    onChange={(e) => elegirArchivos(e.target.files)}
                    className="hidden"
                    id="documentos-proyecto"
                />

                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={disabled || subiendo}
                    className="flex min-h-11 items-center gap-2 rounded-xl border border-hairline px-3 py-2 text-sm text-ink transition hover:border-ink/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {subiendo ? (
                        <>
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-hairline border-t-ink" />
                            Subiendo...
                        </>
                    ) : (
                        "Subir documento"
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setMostrarEnlace((v) => !v)}
                    disabled={disabled || subiendo}
                    className="min-h-11 rounded-xl border border-hairline px-3 py-2 text-sm text-ink transition hover:border-ink/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Pegar enlace
                </button>
            </div>

            {mostrarEnlace && (
                <div className="flex flex-col gap-2 rounded-xl border border-hairline p-3">
                    <input
                        type="text"
                        value={nombreEnlace}
                        onChange={(e) => setNombreEnlace(e.target.value)}
                        placeholder="Nombre (p. ej. Proyecto básico + planos)"
                        className="w-full rounded-xl border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-ink/30 focus:outline-none"
                    />
                    <input
                        type="url"
                        inputMode="url"
                        value={enlace}
                        onChange={(e) => setEnlace(e.target.value)}
                        placeholder="https://drive.google.com/..."
                        className="w-full rounded-xl border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-ink/30 focus:outline-none"
                    />
                    <button
                        type="button"
                        onClick={anadirEnlace}
                        className="min-h-11 cursor-pointer rounded-xl bg-ink px-3 text-sm font-medium text-canvas"
                    >
                        Añadir enlace
                    </button>
                </div>
            )}

            {errores.length > 0 && (
                <ul className="flex flex-col gap-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                    {errores.map((e, i) => (
                        <li key={i} className="text-xs text-amber-700 dark:text-amber-400">
                            {e}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}