import Link from "next/link";
import { sesionApp } from "@/lib/sesion";
import { administradorParaRol, listarAdministradores } from "@/lib/ghl/administradores";
import { listarComunidades } from "@/lib/ghl/comunidades";
import { oportunidadAutorizada } from "@/lib/permisos";
import {
    FormularioPresupuesto,
    type BorradorServidor,
    type OportunidadOrigen,
} from "@/components/forms/FormularioPresupuesto";
import { listarCapitulos, listarPartidas } from "@/lib/documentos/tarifa";
import { iaDisponible } from "@/lib/ia/claude";
import type { CapituloCatalogo, PartidaCatalogo } from "@/lib/propuesta/tipos";
import {
    almacenDisponible,
    borradorDeOportunidad,
    leerBorrador,
    type BorradorGuardado,
} from "@/lib/borradores/almacen";

/**
 * Formulario de toma de datos del flujo v2.
 *
 * Dos entradas (23/09/2026):
 *  - `/presupuestos/nuevo?oportunidad=<id>`: desde la ficha de una oportunidad
 *    en "Visita concertada". El formulario sale precargado con lo que ya hay en
 *    el CRM y, al guardar, esa MISMA oportunidad pasa a "Datos recogidos".
 *  - `/presupuestos/nuevo`: visita sin oportunidad previa. Crea una nueva.
 *  - `/presupuestos/nuevo?borrador=<id>` (27/09/2026): reabre un borrador
 *    guardado en la app. Si el borrador sale de una oportunidad, se trata como
 *    la primera entrada. Abrir una oportunidad que ya tiene borrador lo recupera.
 *
 * /visitas/nueva (el formulario antiguo) redirige aquí desde el 27/09/2026.
 */
export default async function NuevoPresupuestoPage({
    searchParams,
}: {
    searchParams: Promise<{ oportunidad?: string; borrador?: string }>;
}) {
    const sesion = await sesionApp();

    if (!sesion) {
        return <div>No se ha podido determinar la subcuenta del usuario</div>;
    }

    const subcuenta = sesion.subcuenta;
    const parametros = await searchParams;
    const almacen = almacenDisponible();

    // Borrador pedido por id. Un fallo del almacén no bloquea: el comercial
    // puede seguir con la copia de su móvil.
    let borrador: BorradorGuardado | null = null;
    if (parametros.borrador) {
        try {
            borrador = almacen ? await leerBorrador(sesion, parametros.borrador) : null;
        } catch (error) {
            console.error("[nuevo] No se ha podido leer el borrador:", error);
            return <Aviso texto="No se ha podido abrir el borrador. Comprueba la conexión y vuelve a intentarlo." />;
        }
        if (!borrador) {
            return <Aviso texto="Este borrador ya no existe. Puede que ya se creara el presupuesto." />;
        }
    }

    const oportunidadId = borrador ? borrador.oportunidadId ?? undefined : parametros.oportunidad;

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

        // Oportunidad que ya tiene borrador: se retoma, no se empieza otro.
        if (!borrador && almacen) {
            borrador = await borradorDeOportunidad(sesion, oportunidad.id).catch(() => null);
        }
    }

    const borradorServidor: BorradorServidor | null = borrador
        ? { id: borrador.id, datos: borrador.datos, actualizadoEn: borrador.actualizadoEn }
        : null;

    return (
        <FormularioPresupuesto
            // `key`: cambiar de oportunidad debe montar un formulario limpio,
            // no heredar el estado del anterior.
            key={borrador?.id ?? origen?.id ?? "nueva"}
            subcuenta={subcuenta}
            comunidades={comunidades}
            // Sin la comisión pactada si no es dirección: estas props viajan al
            // navegador (DERCAS §3.3).
            administradores={administradores.map((a) => administradorParaRol(a, sesion.rol))}
            rol={sesion.rol}
            oportunidadOrigen={origen}
            borrador={borradorServidor}
            almacenDisponible={almacen}
            catalogo={catalogoParaNavegador()}
            capitulos={listarCapitulos().map((c): CapituloCatalogo => ({ codigo: c.codigo, nombre: c.nombre }))}
            iaDisponible={iaDisponible()}
        />
    );
}

/**
 * Tarifa para buscar y añadir partidas en la revisión. SIN `precioCype`: es el
 * coste interno y estas props viajan al navegador.
 */
function catalogoParaNavegador(): PartidaCatalogo[] {
    return listarPartidas().map((p) => ({
        codigo: p.codigo,
        descripcion: p.descripcionCorta,
        unidad: p.unidad,
        precio: p.tarifaEmpresa,
        capitulo: p.capitulo,
    }));
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
