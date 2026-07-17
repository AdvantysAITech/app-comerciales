import { auth } from "@/auth";
import { listarOportunidades, ETAPAS_PRESUPUESTO, ETAPA } from "@/lib/ghl/oportunidades";
import { PanelPresupuestos } from "@/components/PanelPresupuesto";

export default async function DashboardPage() {
    const session = await auth();

    if (!session?.user?.subcuenta) {
        return <div className="p-6 text-sm text-muted">No se ha podido determinar la subcuenta del usuario</div>;
    }

    const subcuenta = session.user.subcuenta as "scala-valencia" | "vertical-projects";
    const oportunidades = await listarOportunidades(subcuenta, ETAPAS_PRESUPUESTO);

    const total = oportunidades.length;
    const porRevisar = oportunidades.filter((op) =>
        [ETAPA.PRESUPUESTO_EN_REVISION, ETAPA.PRESUPUESTO_ENVIADO, ETAPA.EN_NEGOCIACION].includes(
            op.pipelineStageId
        )
    ).length;
    const ganados = oportunidades.filter((op) => op.pipelineStageId === ETAPA.GANADA).length;
    const perdidos = oportunidades.filter((op) => op.pipelineStageId === ETAPA.PERDIDA).length;

    return (
        <div className="px-4 py-6 sm:px-10">
            <div className="flex items-center justify-between gap-4">
                <div className="flex-1" />
                <h1 className="flex-1 text-center text-2xl font-semibold tracking-tight text-ink">
                    Tus visitas
                </h1>
                <p className="flex-1 truncate text-right text-sm font-medium text-muted">
                    {session.user.name ?? ""}
                </p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 rounded-3xl border border-hairline bg-surface p-4 sm:grid-cols-4">
                <EstadisticaItem etiqueta="Total" valor={total} />
                <EstadisticaItem etiqueta="Por revisar" valor={porRevisar} />
                <EstadisticaItem etiqueta="Ganados" valor={ganados} />
                <EstadisticaItem etiqueta="Perdidos" valor={perdidos} />
            </div>

            <PanelPresupuestos oportunidades={oportunidades} />

            <footer className="mt-10 flex items-center justify-center gap-1 pb-6 text-xs text-muted">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M14.83 9a3 3 0 1 0 0 6" />
                </svg>
                Powered by AdvantysAI
            </footer>
        </div>
    );
}

function EstadisticaItem({ etiqueta, valor }: { etiqueta: string; valor: number }) {
    return (
        <div className="flex flex-col items-center rounded-2xl bg-canvas px-3 py-4 text-center">
            <span className="text-2xl font-semibold text-ink">{valor}</span>
            <span className="mt-1 text-xs font-medium text-muted">{etiqueta}</span>
        </div>
    );
}