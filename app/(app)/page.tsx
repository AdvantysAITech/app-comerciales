import Link from "next/link";
import { auth } from "@/auth";
import { listarOportunidadesAbiertas, ETAPA, NOMBRE_ETAPA } from "@/lib/ghl/oportunidades";

const ORDEN_ETAPAS = [
    ETAPA.VISITA_CONCERTADA,
    ETAPA.DATOS_RECOGIDOS,
    ETAPA.PRESUPUESTO_EN_REVISION,
];

export default async function DashboardPage() {
    const session = await auth();

    if (!session?.user?.subcuenta) {
        return <div className="p-6 text-sm text-slate-500">No se ha podido determinar la subcuenta del usuario</div>;
    }

    const subcuenta = session.user.subcuenta as "scala-valencia" | "vertical-projects";
    const oportunidades = await listarOportunidadesAbiertas(subcuenta);

    return (
        <div className="min-h-screen bg-gradient-to-b from-sky-200 via-sky-100 to-white">
            <header className="sticky top-0 z-10 border-b border-sky-100/60 bg-white/70 px-4 py-4 backdrop-blur-xl sm:px-6">
                <div className="mx-auto flex max-w-xl items-center justify-between">
                    <span className="text-sm font-semibold tracking-tight text-[#15375A]">Sistema Advantys</span>
                    <span className="text-sm text-slate-500">{session.user.name}</span>
                </div>
            </header>

            <main className="mx-auto max-w-1 px-4 pb-28 pt-6 sm:px-6">
                <h1 className="text-2x1 font-semibold tracking-tight text-[#15375A]">Tus visitas</h1>

                <div className="mt-6 space-y-6">
                    {ORDEN_ETAPAS.map((etapaId) => {
                        const deEstaEtapa = oportunidades.filter((op) => op.pipelineStageId === etapaId);

                        return (
                            <section key={etapaId}>
                                <h2 className="mb-2text-sm font-medium text-slate-500">{NOMBRE_ETAPA[etapaId]}</h2>
                                
                                {deEstaEtapa.length === 0 ? (
                                    <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
                                        Sin oportnidades en esta etapa
                                    </p>
                                ) : (
                                    <div className="space-y-3">
                                        {deEstaEtapa.map((op) => (
                                            <div
                                                key={op.id}
                                                className="rounded-3xl border border-white/60 bg-white/60 p-4 shadow-sm backdrop-blur-xl"
                                            >
                                                <p className="font-medium text-slate-900">{op.name}</p>
                                                <p className="text-sm text-slate-500">{op.modeloNegocio ?? "Sin modelo asignado"}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>
            </main>

            <div className="fixed inset-x-0 bottom-0 border-t border-sky-100/60 bg-white/70 p-4 backdrop-blur-xl">
                <Link
                    href="/visita/nueva"
                    className="mx-auto flex max-w-xl items-center justify-center rounded-full bg-[#15375A] px-6 py-3.5 text-base font-semibold text-white transition hover:bg-[#0f2942]"
                >
                    + Nueva visita
                </Link>
            </div>
        </div>
    );
}