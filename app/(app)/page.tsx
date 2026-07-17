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
        ([ETAPA.PRESUPUESTO_EN_REVISION, ETAPA.PRESUPUESTO_ENVIADO, ETAPA.EN_NEGOCIACION] as string[]).includes(
            op.pipelineStageId
        )
    ).length;
    const ganados = oportunidades.filter((op) => op.pipelineStageId === ETAPA.GANADA).length;
    const perdidos = oportunidades.filter((op) => op.pipelineStageId === ETAPA.PERDIDA).length;

    const nombre = session.user.name ?? "";
    const iniciales =
        nombre
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((parte) => parte[0]?.toUpperCase())
            .join("") || "?";

    return (
        // pb-28: deja hueco para que el navbar flotante fijo no tape la última fila en móvil
        <div className="relative min-h-screen overflow-hidden bg-canvas px-4 pb-28 pt-6 sm:px-10">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-ink/5 blur-3xl sm:h-64 sm:w-64" />

            <div className="relative flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-medium text-canvas">
                    {iniciales}
                </div>
                <div className="min-w-0">
                    <h1 className="truncate text-xl font-semibold text-ink sm:text-2xl">
                        Hola{nombre ? `, ${nombre.split(" ")[0]}` : ""}
                    </h1>
                    <p className="mt-0.5 truncate text-xs text-muted sm:text-sm">
                        Tienes {porRevisar} presupuesto{porRevisar === 1 ? "" : "s"} por revisar
                    </p>
                </div>
            </div>

            <div className="relative mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
                <EstadisticaItem etiqueta="Total" valor={total} icono="lista" />
                <EstadisticaItem etiqueta="Por revisar" valor={porRevisar} icono="reloj" />
                <EstadisticaItem etiqueta="Ganados" valor={ganados} icono="check" />
                <EstadisticaItem etiqueta="Perdidos" valor={perdidos} icono="x" />
            </div>

            <PanelPresupuestos oportunidades={oportunidades} />

            <footer className="relative mt-10 flex items-center justify-center gap-1 text-xs text-muted">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M14.83 9a3 3 0 1 0 0 6" />
                </svg>
                Powered by AdvantysAI
            </footer>
        </div>
    );
}

const ICONOS: Record<string, React.ReactNode> = {
    lista: (
        <>
            <rect x="3" y="4" width="18" height="4" rx="1" />
            <rect x="3" y="10" width="18" height="4" rx="1" />
            <rect x="3" y="16" width="18" height="4" rx="1" />
        </>
    ),
    reloj: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
        </>
    ),
    check: <path d="M20 6 9 17l-5-5" />,
    x: <path d="M18 6 6 18M6 6l12 12" />,
};

function EstadisticaItem({
    etiqueta,
    valor,
    icono,
}: {
    etiqueta: string;
    valor: number;
    icono: keyof typeof ICONOS;
}) {
    return (
        <div className="rounded-2xl border border-hairline bg-surface/55 p-3.5 backdrop-blur-md backdrop-saturate-150 sm:p-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-muted">
                {ICONOS[icono]}
            </svg>
            <p className="mt-2 text-xl font-semibold text-ink sm:text-2xl">{valor}</p>
            <p className="mt-0.5 text-[11px] text-muted sm:text-xs">{etiqueta}</p>
        </div>
    );
}