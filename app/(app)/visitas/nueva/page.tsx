import { sesionApp } from "@/lib/sesion";
import { administradorParaRol, listarAdministradores } from "@/lib/ghl/administradores";
import { listarComunidades } from "@/lib/ghl/comunidades";
import { FormularioPresupuesto } from "@/components/forms/FormularioPresupuesto";

export default async function VisitasPage(){
    const sesion = await sesionApp();

    if (!sesion) {
        return <div>No se ha podido determinar la subcuenta del usuario</div>;
    }

    const subcuenta = sesion.subcuenta;

    const [comunidades, administradores] = await Promise.all([
        listarComunidades(subcuenta),
        listarAdministradores(subcuenta),
    ]);

    return (
        <FormularioPresupuesto
            subcuenta={subcuenta}
            comunidades={comunidades}
            // Sin la comisión pactada si no es dirección: estas props viajan al
            // navegador (DERCAS §3.3).
            administradores={administradores.map((a) => administradorParaRol(a, sesion.rol))}
            rol={sesion.rol}
        />
    );
}