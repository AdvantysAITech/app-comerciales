import Link from "next/link";
import { auth } from "@/auth";
import { esSubcuentaValida } from "@/lib/subcuenta";
import { obtenerOportunidad } from "@/lib/ghl/oportunidades";
import { leerPayloadVisita } from "@/lib/documentos/visitaGuardada";
import { presupuestarConAjustes, RutasSinMapearError } from "@/lib/documentos/mapeo-capitulos";
import { leerAjustes } from "@/lib/documentos/ajustes";
import { leerRegistroParaUI } from "@/lib/documentos/estado";
import { construirFilas, type PartidaBuscable } from "@/lib/documentos/revision";
import { listarCapitulos, listarPartidas } from "@/lib/documentos/tarifa";
import { RevisionPresupuesto } from "@/components/RevisionPresupuesto";

/**
 * Pantalla de revisión de un presupuesto. Solo perfil `direccion`.
 *
 * El control de acceso está aquí Y en las dos rutas de API. Ocultar el botón no
 * es control de acceso: un comercial que teclee la URL tiene que rebotar.
 */

export const dynamic = "force-dynamic";

function Aviso({ titulo, detalle, id }: { titulo: string; detalle: string; id?: string }) {
    return (
        <div className="mx-auto max-w-2xl px-6 py-16">
            <h1 className="text-lg font-semibold text-ink">{titulo}</h1>
            <p className="mt-2 whitespace-pre-line text-sm text-muted">{detalle}</p>
            {id && (
                <Link
                    href={`/oportunidades/${id}`}
                    className="mt-6 inline-block rounded-xl border border-hairline px-4 py-2 text-sm font-medium text-ink transition hover:bg-canvas"
                >
                    Volver a la oportunidad
                </Link>
            )}
        </div>
    );
}

export default async function RevisionPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await auth();

    if (!session?.user?.subcuenta || !esSubcuentaValida(session.user.subcuenta)) {
        return <Aviso titulo="Sesión no válida" detalle="No se ha podido determinar tu subcuenta." />;
    }

    if (session.user.rol !== "direccion") {
        return (
            <Aviso
                titulo="Sin acceso"
                detalle="La revisión de presupuestos es del perfil de dirección."
                id={id}
            />
        );
    }

    const subcuenta = session.user.subcuenta;

    const [oportunidad, payload, ajustes, estado] = await Promise.all([
        obtenerOportunidad(subcuenta, id),
        leerPayloadVisita(subcuenta, id),
        leerAjustes(subcuenta, id),
        leerRegistroParaUI(subcuenta, id),
    ]);

    if (!oportunidad) {
        return <Aviso titulo="Oportunidad no encontrada" detalle="Puede que se haya borrado." />;
    }

    if (!payload) {
        return (
            <Aviso
                titulo="Sin datos de visita"
                detalle={
                    "Esta oportunidad no tiene guardado el formulario de la visita, así que no hay " +
                    "presupuesto que revisar. El comercial tiene que capturarla desde la app."
                }
                id={id}
            />
        );
    }

    // El cálculo SIN ajustes es el esqueleto de la tabla: es lo que permite
    // seguir enseñando (y recuperar) las partidas que dirección haya excluido.
    let vista;
    try {
        const base = presupuestarConAjustes(payload, null);
        const actual = presupuestarConAjustes(payload, ajustes);
        vista = construirFilas(base, actual);
    } catch (error) {
        const detalle =
            error instanceof RutasSinMapearError
                ? "Hay trabajos del formulario sin partida en la tarifa 2026, así que el presupuesto " +
                  "no se puede calcular todavía. Avisa a Advantys.\n\n" + error.message
                : error instanceof Error
                  ? error.message
                  : "Error desconocido";

        return <Aviso titulo="No se puede calcular el presupuesto" detalle={detalle} id={id} />;
    }

    // Catálogo para el buscador de partidas. Se envía SIN `precioCype`: es el
    // coste interno y no tiene por qué viajar al navegador.
    const nombreCapitulo = new Map(listarCapitulos().map((c) => [c.codigo, c.nombre]));
    const catalogo: PartidaBuscable[] = listarPartidas().map((p) => ({
        codigo: p.codigo,
        codigoJerarquico: p.codigoJerarquico,
        descripcion: p.descripcionCorta,
        unidad: p.unidad,
        precio: p.tarifaEmpresa,
        capitulo: nombreCapitulo.get(p.capitulo) ?? p.capitulo,
    }));

    return (
        <div className="min-h-screen bg-canvas px-4 pb-28 pt-6 sm:px-8">
            <RevisionPresupuesto
                oportunidadId={id}
                comunidad={oportunidad.comunidadNombre ?? oportunidad.name}
                administrador={oportunidad.administrador.nombre}
                vistaInicial={vista}
                ajustesIniciales={ajustes}
                registroInicial={estado.registro}
                catalogo={catalogo}
            />
        </div>
    );
}