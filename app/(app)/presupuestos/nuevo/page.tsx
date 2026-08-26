import { auth } from "@/auth";
import { listarAdministradores } from "@/lib/ghl/administradores";
import { listarComunidades } from "@/lib/ghl/comunidades";
import { FormularioPresupuesto } from "@/components/forms/FormularioPresupuesto";

/**
 * Ruta paralela del flujo nuevo de presupuestos.
 *
 * El formulario antiguo (/visitas/nueva) sigue operativo en produccion: los
 * comerciales no pueden quedarse sin poder registrar visitas mientras esto se
 * termina. La sustitucion se hara cuando el envio este cerrado (B4).
 */
export default async function NuevoPresupuestoPage() {
    const session = await auth();

    if (!session?.user?.subcuenta) {
        return <div>No se ha podido determinar la subcuenta del usuario</div>;
    }

    const subcuenta = session.user.subcuenta as "scala-valencia" | "vertical-projects";

    const [comunidades, administradores] = await Promise.all([
        listarComunidades(subcuenta),
        listarAdministradores(subcuenta),
    ]);

    return (
        <FormularioPresupuesto
            subcuenta={subcuenta}
            comunidades={comunidades}
            administradores={administradores}
        />
    );
}