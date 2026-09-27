import { redirect } from "next/navigation";

/**
 * Ruta antigua del formulario. Redirige a /presupuestos/nuevo (27/09/2026).
 *
 * Seguía viva porque el botón "Nuevo presupuesto" de la barra apuntaba aquí, y
 * pintaba el formulario SIN el almacén de borradores: las visitas empezadas
 * desde la barra no llegaban nunca al panel. Se conserva la ruta por si alguien
 * la tiene guardada en favoritos.
 */
export default function VisitasNuevaPage() {
    redirect("/presupuestos/nuevo");
}
