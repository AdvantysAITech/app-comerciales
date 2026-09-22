import { sesionApp } from "@/lib/sesion";
import { SUBCUENTAS } from "@/lib/subcuenta";
import { ToggleTema } from "@/components/ToggleTema";
import { SelectorSubcuenta } from "@/components/SelectorSubcuenta";

export default async function AjustesPage() {
    const sesion = await sesionApp();

    return (
        <div className="max-w-xl px-6 py-8 sm:px-10">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Ajustes</h1>
            <p className="mt-1 text-sm text-muted">Información de tu cuenta y preferencias.</p>

            <section className="mt-8 rounded-3xl border border-hairline bg-surface p-6">
                <h2 className="text-sm font-medium text-muted">Cuenta</h2>

                <div className="mt-4 space-y-4">
                    <div>
                        <p className="text-xs font-medium text-muted">Nombre</p>
                        <p className="mt-1 text-sm text-ink">{sesion?.nombre}</p>
                    </div>
                    <div>
                        <p className="text-xs font-medium text-muted">Email</p>
                        <p className="mt-1 text-sm text-ink">{sesion?.email}</p>
                    </div>
                    <div>
                        <p className="text-xs font-medium text-muted">
                            {sesion && sesion.subcuentas.length > 1 ? "Subcuentas" : "Subcuenta"}
                        </p>
                        <p className="mt-1 text-sm text-ink">
                            {sesion?.subcuentas.map((slug) => SUBCUENTAS[slug].nombre).join(" · ")}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs font-medium text-muted">Contraseña</p>
                        <p className="mt-1 text-sm text-muted">Próximamente podrás cambiarla desde aquí.</p>
                    </div>
                </div>
            </section>

            {/* Solo para perfiles multi-subcuenta (DERCAS 9.1). El selector del
                dashboard queda lejos cuando estás en otra pantalla, así que se
                repite aquí: es la pantalla a la que se llega desde cualquier
                sitio con el navbar. */}
            {sesion && sesion.multiSubcuenta && (
                <section className="mt-6 rounded-3xl border border-hairline bg-surface p-6">
                    <h2 className="text-sm font-medium text-muted">Subcuenta activa</h2>
                    <p className="mt-1 text-xs text-muted">
                        Determina qué oportunidades, comunidades y presupuestos ves. Se trabaja en una
                        empresa cada vez.
                    </p>
                    <div className="mt-4">
                        <SelectorSubcuenta subcuentas={sesion.subcuentas} activa={sesion.subcuenta} />
                    </div>
                </section>
            )}

            <section className="mt-6 rounded-3xl border border-hairline bg-surface p-6">
                <h2 className="text-sm font-medium text-muted">Apariencia</h2>

                <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm text-ink">Modo oscuro</span>
                    <ToggleTema />
                </div>
            </section>
        </div>
    );
}