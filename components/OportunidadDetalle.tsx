import { auth } from "@/auth";
import { obtenerOportunidad, NOMBRE_ETAPA } from "@/lib/ghl/oportunidades";
import { urlContactoSa, urlOportunidadSa } from "@/lib/ghl/urls";

export async function OportunidadDetalle({ id }: { id: string }) {
    const session = await auth();

    if (!session?.user?.subcuenta) {
        return <p className="text-sm text-muted">No se ha podido determinar la subcuenta del usuario.</p>;
    }

    const subcuenta = session.user.subcuenta as "scala-valencia" | "vertical-projects";
    const oportunidad = await obtenerOportunidad(subcuenta, id);

    if (!oportunidad) {
        return <p className="text-sm text-muted">No se ha encontrado esta oportunidad.</p>
    }

    return (
        <div className="space-y-5">
            <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    {oportunidad.comunidadNombre ?? oportunidad.name}
                </p>
                <h2 className="text-lg font-semibold text-ink">
                    {oportunidad.modeloNegocio ?? "Sin modelo asignado"}
                </h2>
            </div>

            <dl className="space-y-4 text-sm">
                <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted">Fecha de visita</dt>
                    <dd className="font-medium text-ink">
                        {oportunidad.fechaVisita ?? "Sin fecha registrada"}
                    </dd>
                </div>

                <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted">Presupuesto generado</dt>
                    <dd className="font-medium text-muted">Pendiente (Fase 7)</dd>
                </div>

                <div className="flex items-start justify-between gap-4">
                    <dt className="text-muted">Administrador de la finca</dt>
                    <dd className="text-right font-medium text-ink">
                        <div>{oportunidad.administrador.nombre ?? "Sin identificar"}</div>
                        {oportunidad.administrador.id && (
                            <a
                                href={urlContactoSa(subcuenta, oportunidad.administrador.id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-normal text-accent hover:underline"
                            >
                                Ver ficha en GHL ↗
                            </a>
                        )}
                    </dd>
                </div>

                <div className="flex items-start justify-between gap-4">
                    <dt className="text-muted">Estado de la oportunidad</dt>
                    <dd className="text-right font-medium text-ink">
                        <div>{NOMBRE_ETAPA[oportunidad.pipelineStageId] ?? "Desconocido"}</div>
                        <a
                            href={urlOportunidadSa(subcuenta, oportunidad.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-normal text-accent hover:underline"
                        >
                            Ver en GHL ↗
                        </a>
                    </dd>
                </div>

                {oportunidad.descripcionVisita && (
                    <div>
                        <dt className="mb-1.5 text-muted">Descripción de la visita</dt>
                        <dd className="whitespace-pre-line rounded-2xl bg-canvas p-3 text-xs leading-relaxed text-ink">
                            {oportunidad.descripcionVisita}
                        </dd>
                    </div>
                )}
            </dl>
        </div>
    );
}