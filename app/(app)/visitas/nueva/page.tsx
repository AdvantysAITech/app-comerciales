import { auth } from "@/auth";
import { listarAdministradores } from "@/lib/ghl/administradores";
import { listarComunidades } from "@/lib/ghl/comunidades";
import { FormularioPresupuesto } from "@/components/forms/FormularioPresupuesto";

export default async function VisitasPage(){
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