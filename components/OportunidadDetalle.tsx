import { auth } from "@/auth";
import { obtenerOportunidad, NOMBRE_ETAPA } from "@/lib/ghl/oportunidades";
import { urlContactoSa, urlOportunidadSa } from "@/lib/ghl/urls";
import { documentosDisponibles, leerRegistro } from "@/lib/documentos/estado";
import { DocumentoPresupuesto } from "@/components/DocumentoPresupuesto";

export async function OportunidadDetalle({ id }: { id: string }) {
    const session = await auth();

    if (!session?.user?.subcuenta) {
        return <p className="text-sm text-muted">No se ha podido determinar la subcuenta del usuario.</p>;
    }

    const subcuenta = session.user.subcuenta as "scala-valencia" | "vertical-projects";
    const oportunidad = await obtenerOportunidad(subcuenta, id);

    // El registro se lee en servidor: al reabrir la ficha, el comercial ve en
    // que punto esta el documento sin depender de que el polling siguiera vivo.
    const disponible = documentosDisponibles(subcuenta);
    const registro = disponible ? await leerRegistro(subcuenta, id) : null;

    if (!oportunidad) {
        return <p className="text-sm text-muted">No se ha encontrado esta oportunidad.</p>
    }

    return (
        <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                {oportunidad.comunidadNombre ?? oportunidad.name}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-ink">
                {oportunidad.modeloNegocio ?? "Sin modelo asignado"}
            </h2>

            <div className="mt-3 flex items-center justify-between gap-3">
                <span className="inline-block rounded-full border border-hairline px-3 py-1 text-xs font-medium text-ink">
                    {NOMBRE_ETAPA[oportunidad.pipelineStageId] ?? "Desconocido"}
                </span>
                <a
                    href={urlOportunidadSa(subcuenta, oportunidad.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-hairline px-2.5 py-1.5 text-xs font-medium text-ink transition hover:bg-canvas"
                >
                    Ver oportunidad
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                        <path d="M7 17 17 7M8 7h9v9" />
                    </svg>
                </a>
            </div>

            <div className="mt-4 flex flex-col gap-3.5 border-t border-hairline pt-4">
                <Fila
                    icono={
                        <>
                            <rect x="3" y="4" width="18" height="18" rx="2" />
                            <path d="M3 10h18M8 2v4M16 2v4" />
                        </>
                    }
                    etiqueta="Fecha de visita"
                    valor={oportunidad.fechaVisita ?? "Sin fecha registrada"}
                />

                <div>
                    <div className="mb-2 flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink/5 text-muted">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                                <path d="M14 2v6h6" />
                                <path d="M6 2h8l6 6v14H6z" />
                            </svg>
                        </div>
                        <p className="text-[11px] text-muted">Presupuesto</p>
                    </div>
                    <DocumentoPresupuesto
                        oportunidadId={oportunidad.id}
                        registroInicial={registro}
                        disponible={disponible}
                    />
                </div>

                <div className="flex items-center justify-between gap-3">
                    <Fila
                        icono={
                            <>
                                <circle cx="12" cy="8" r="4" />
                                <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
                            </>
                        }
                        etiqueta="Administrador de la finca"
                        valor={oportunidad.administrador.nombre ?? "Sin identificar"}
                    />
                    {oportunidad.administrador.id && (
                        <a
                            href={urlContactoSa(subcuenta, oportunidad.administrador.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-hairline px-2.5 py-1.5 text-xs font-medium text-ink transition hover:bg-canvas"
                        >
                            CRM
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                                <path d="M7 17 17 7M8 7h9v9" />
                            </svg>
                        </a>
                    )}
                </div>

                {oportunidad.descripcionVisita && (
                    <div>
                        <p className="mb-1.5 text-[11px] text-muted">Descripción de la visita</p>
                        <p className="whitespace-pre-line rounded-2xl bg-canvas p-3 text-xs leading-relaxed text-ink">
                            {oportunidad.descripcionVisita}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

function Fila({
    icono,
    etiqueta,
    valor,
    valorMuted = false,
}: {
    icono: React.ReactNode;
    etiqueta: string;
    valor: string;
    valorMuted?: boolean;
}) {
    return (
        <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink/5 text-muted">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    {icono}
                </svg>
            </div>
            <div className="min-w-0">
                <p className="text-[11px] text-muted">{etiqueta}</p>
                <p className={`truncate text-sm font-medium ${valorMuted ? "text-muted" : "text-ink"}`}>{valor}</p>
            </div>
        </div>
    );
}