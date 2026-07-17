import { auth } from "@/auth";
import { ToggleTema } from "@/components/ToggleTema";

export default async function AjustesPage() {
    const session = await auth();

    return (
        <div className="max-w-xl px-6 py-8 sm:px-10">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Ajustes</h1>
            <p className="mt-1 text-sm text-muted">Información de tu cuenta y preferencias.</p>

            <section className="mt-8 rounded-3xl border border-hairline bg-surface p-6">
                <h2 className="text-sm font-medium text-muted">Cuenta</h2>

                <div className="mt-4 space-y-4">
                    <div>
                        <p className="text-xs font-medium text-muted">Nombre</p>
                        <p className="mt-1 text-sm text-ink">{session?.user?.name}</p>
                    </div>
                    <div>
                        <p className="text-xs font-medium text-muted">Email</p>
                        <p className="mt-1 text-sm text-ink">{session?.user?.email}</p>
                    </div>
                    <div>
                        <p className="text-xs font-medium text-muted">Contraseña</p>
                        <p className="mt-1 text-sm text-muted">Próximamente podrás cambiarla desde aquí.</p>
                    </div>
                </div>
            </section>

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