import Link from "next/link";
import { sesionApp } from "@/lib/sesion";
import { administradorParaRol, listarAdministradores } from "@/lib/ghl/administradores";
import { listarComunidades } from "@/lib/ghl/comunidades";
import { oportunidadAutorizada } from "@/lib/permisos";
import { FormularioPresupuesto, type OportunidadOrigen } from "@/components/forms/FormularioPresupuesto";

/**
 * Formulario de toma de datos del flujo v2.
 *
 * Dos entradas (23/09/2026):
 *  - `/presupuestos/nuevo?oportunidad=<id>`: desde la ficha de una oportunidad
 *    en "Visita concertada". El formulario sale precargado con lo que ya hay en
 *    el CRM y, al guardar, esa MISMA oportunidad pasa a "Datos recogidos".
 *  - `/presupuestos/nuevo`: visita sin oportunidad previa. Crea una nueva.
 *
 * El formulario antiguo (/visitas/nueva) sigue operativo en produccion.
 */
export default async function NuevoPresupuestoPage({
    searchParams,
}: {
    searchParams: Promise<{ oportunidad?: string }>;
}) {
    const sesion = await sesionApp();

    if (!sesion) {
        return <div>No se ha podido determinar la subcuenta del usuario</div>;
    }

    const subcuenta = sesion.subcuenta;
    const { oportunidad: oportunidadId } = await searchParams;

    const [comunidades, administradores, oportunidad] = await Promise.all([
        listarComunidades(subcuenta),
        listarAdministradores(subcuenta),
        // Un fallo de GHL aquí cuenta como "no encontrada": no hay nada que
        // escribir todavía, y reabrir desde la ficha lo resuelve.
        oportunidadId ? oportunidadAutorizada(sesion, oportunidadId).catch(() => null) : Promise.resolve(null),
    ]);

    let origen: OportunidadOrigen | null = null;

    if (oportunidadId) {
        // Misma respuesta si no existe o si es de otro comercial: no se le
        // confirma que esta ahi.
        if (!oportunidad) {
            return <Aviso texto="No se ha encontrado esta oportunidad." />;
        }
        if (oportunidad.etapa !== "VISITA_CONCERTADA") {
            return (
                <Aviso texto="Los datos de esta oportunidad ya se tomaron. Ábrela desde el panel para ver en qué punto está." />
            );
        }

        origen = {
            id: oportunidad.id,
            nombre: oportunidad.comunidadNombre ?? oportunidad.name,
            comunidadNombre: oportunidad.comunidadNombre ?? "",
            contacto: oportunidad.contacto.nombre ?? "",
            telefono: oportunidad.contacto.telefono ?? "",
            fecha: fechaParaInput(oportunidad.fechaVisita),
        };
    }

    return (
        <FormularioPresupuesto
            // `key`: cambiar de oportunidad debe montar un formulario limpio,
            // no heredar el estado del anterior.
            key={origen?.id ?? "nueva"}
            subcuenta={subcuenta}
            comunidades={comunidades}
            // Sin la comisión pactada si no es dirección: estas props viajan al
            // navegador (DERCAS §3.3).
            administradores={administradores.map((a) => administradorParaRol(a, sesion.rol))}
            rol={sesion.rol}
            oportunidadOrigen={origen}
        />
    );
}

/** "dd/mm/aaaa" (como la lee `valorFecha`) -> "aaaa-mm-dd" (lo que pide `<input type="date">`). */
function fechaParaInput(fecha: string | null): string {
    const partes = fecha?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return partes ? `${partes[3]}-${partes[2]}-${partes[1]}` : "";
}

function Aviso({ texto }: { texto: string }) {
    return (
        <div className="px-4 pb-24 pt-6 sm:px-10">
            <p className="rounded-2xl border border-dashed border-hairline px-4 py-10 text-center text-sm text-muted">
                {texto}
            </p>
            <Link
                href="/"
                className="mt-4 block w-full rounded-xl bg-ink py-3 text-center text-sm font-semibold text-canvas"
            >
                Volver al panel
            </Link>
        </div>
    );
}
