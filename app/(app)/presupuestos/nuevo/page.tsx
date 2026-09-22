import { sesionApp } from "@/lib/sesion";
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
            administradores={administradores}
            rol={sesion.rol}
        />
    );
}