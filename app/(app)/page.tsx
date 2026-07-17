import Link from "next/link";
import { auth } from "@/auth";
import { listarOportunidades, ETAPAS_PRESUPUESTO, NOMBRE_ETAPA } from "@/lib/ghl/oportunidades";

export default async function DashboardPage() {
    const session = await auth();

    if (!session?.user?.subcuenta) {
        return <div className="p-6 text-sm text-muted">No se ha podido determinar la subcuenta del usuario</div>;
    }

    const subcuenta = session.user.subcuenta as "scala-valencia" | "vertical-projects";
    const oportunidades = await listarOportunidades(subcuenta, ETAPAS_PRESUPUESTO);

    return (
        <div className="px-6 py-8 sm:px-10">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Tus visitas</h1>

            <div className="mt-6 space-y-6">
                {ETAPAS_PRESUPUESTO.map((etapaId) => {
                    const deEstaEtapa = oportunidades.filter((op) => op.pipelineStageId === etapaId);

                    return (
                        <section key={etapaId}>
                            <h2 className="mb-2 text-sm font-medium text-muted">{NOMBRE_ETAPA[etapaId]}</h2>

                            {deEstaEtapa.length === 0 ? (
                                <p className="rounded-2xl border border-dashed border-hairline px-4 py-6 text-center text-sm text-muted">
                                    Sin oportunidades en esta etapa
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {deEstaEtapa.map((op) => (
                                        <Link
                                            key={op.id}
                                            href={`/oportunidades/${op.id}`}
                                            className="block rounded-3xl border border-hairline bg-surface p-4 shadow-sm transition hover:border-accent/40"
                                        >
                                            <p className="font-medium text-ink">{op.comunidadNombre ?? op.name}</p>
                                            <p className="text-sm text-muted">{op.modeloNegocio ?? "Sin modelo asignado"}</p>
                                            <p className="mt-1 text-xs text-muted">
                                                {op.administrador.nombre ?? "Administrador sin identificar"}
                                            </p>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>
        </div>
    );
}