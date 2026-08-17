"use client";

import { useMemo, useState } from "react";
import { SelectorArbol } from "@/components/forms/SelectorArbol";
import { getModulos, type ModuloTrabajo } from "@/lib/catalogo";
import { normalizarNombre } from "@/lib/texto";
import {
    alertasActivas,
    contarPorModulo,
    limpiarModulo,
    partidasSeleccionadas,
    seleccionVacia,
    validarSeleccion,
    type SeleccionVisita,
    type Subcuenta,
} from "@/lib/visita/seleccion";

/**
 * Formulario de captura v2.
 *
 * Convive con el formulario actual en una ruta aparte: el flujo antiguo sigue
 * operativo en producción hasta que este esté completo (el envío llega en B4).
 */

type ComunidadListado = {
    id: string;
    nombreDireccion: string;
    administradorId?: string;
};

type AdministradorListado = {
    id: string;
    nombreDespacho?: string;
};

type Props = {
    subcuenta: Subcuenta;
    comunidades: ComunidadListado[];
    administradores: AdministradorListado[];
};

const ESTILO_CAMPO =
    "w-full rounded-xl border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-ink/30 focus:outline-none";
const ESTILO_LABEL = "mb-1.5 block text-xs text-muted";
const ESTILO_SECCION = "rounded-2xl border border-hairline bg-surface p-4";
const ESTILO_TITULO = "mb-3 text-[11px] font-medium uppercase tracking-wide text-muted";

export function FormularioPresupuesto({ subcuenta, comunidades, administradores }: Props) {
    const [nombreComunidad, setNombreComunidad] = useState("");
    const [comunidadElegidaId, setComunidadElegidaId] = useState<string | null>(null);
    const [administradorId, setAdministradorId] = useState("");
    const [contacto, setContacto] = useState("");
    const [telefono, setTelefono] = useState("");
    const [fecha, setFecha] = useState("");
    const [observaciones, setObservaciones] = useState("");
    const [modulosElegidos, setModulosElegidos] = useState<string[]>([]);
    const [seleccion, setSeleccion] = useState<SeleccionVisita>(seleccionVacia);

    const modulos = useMemo(() => getModulos(subcuenta), [subcuenta]);

    // Sugerencias mientras escribe. Coincidencia parcial: la máquina propone,
    // el comercial decide. Nunca se empareja solo (ver nota de B2.1).
    const sugerencias = useMemo(() => {
        const texto = normalizarNombre(nombreComunidad);
        if (texto.length < 2) return [];
        return comunidades
            .filter((c) => normalizarNombre(c.nombreDireccion).includes(texto))
            .slice(0, 5);
    }, [comunidades, nombreComunidad]);

    const comunidadElegida = comunidades.find((c) => c.id === comunidadElegidaId);

    const coincidenciaExacta = useMemo(() => {
        const texto = normalizarNombre(nombreComunidad);
        if (!texto) return undefined;
        return comunidades.find((c) => normalizarNombre(c.nombreDireccion) === texto);
    }, [comunidades, nombreComunidad]);

    const seCrearaComunidad = nombreComunidad.trim() !== "" && !comunidadElegida && !coincidenciaExacta;

    const conteo = useMemo(
        () => contarPorModulo(subcuenta, modulosElegidos, seleccion),
        [subcuenta, modulosElegidos, seleccion]
    );

    const partidas = useMemo(
        () => partidasSeleccionadas(subcuenta, modulosElegidos, seleccion),
        [subcuenta, modulosElegidos, seleccion]
    );

    const errores = useMemo(
        () => validarSeleccion(subcuenta, modulosElegidos, seleccion),
        [subcuenta, modulosElegidos, seleccion]
    );

    const alertas = useMemo(
        () => alertasActivas(subcuenta, modulosElegidos, seleccion),
        [subcuenta, modulosElegidos, seleccion]
    );

    function alternarModulo(modulo: ModuloTrabajo) {
        setModulosElegidos((anterior) => {
            if (anterior.includes(modulo.key)) {
                // Al quitar un módulo se limpian sus partidas: si no, quedarían
                // huérfanas en el estado y viajarían al presupuesto sin que nadie
                // las vea en pantalla.
                setSeleccion((s) => limpiarModulo(s, modulo.key));
                return anterior.filter((k) => k !== modulo.key);
            }
            return [...anterior, modulo.key];
        });
    }

    function elegirSugerencia(comunidad: ComunidadListado) {
        setComunidadElegidaId(comunidad.id);
        setNombreComunidad(comunidad.nombreDireccion);
        if (comunidad.administradorId) setAdministradorId(comunidad.administradorId);
    }

    const faltanDatosGenerales =
        nombreComunidad.trim() === "" || contacto.trim() === "" || telefono.trim() === "" || fecha === "";

    return (
        <div className="px-4 pb-24 pt-6 sm:px-10">
            <h1 className="mb-5 text-xl font-semibold text-ink sm:text-2xl">Nuevo presupuesto</h1>

            <div className="flex flex-col gap-3">
                <section className={ESTILO_SECCION}>
                    <p className={ESTILO_TITULO}>Datos generales</p>

                    <div className="flex flex-col gap-3">
                        <div>
                            <label>
                                <span className={ESTILO_LABEL}>Comunidad</span>
                                <input
                                    type="text"
                                    value={nombreComunidad}
                                    onChange={(e) => {
                                        setNombreComunidad(e.target.value);
                                        setComunidadElegidaId(null);
                                    }}
                                    placeholder="C/ Islas Canarias, 180"
                                    className={ESTILO_CAMPO}
                                />
                            </label>

                            {!comunidadElegida && sugerencias.length > 0 && (
                                <div className="mt-1.5 flex flex-col gap-1">
                                    {sugerencias.map((c) => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => elegirSugerencia(c)}
                                            className="cursor-pointer rounded-lg border border-hairline px-3 py-2 text-left text-sm text-ink transition hover:border-ink/30"
                                        >
                                            {c.nombreDireccion}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {comunidadElegida && (
                                <p className="mt-1.5 text-xs text-muted">Comunidad existente seleccionada</p>
                            )}

                            {seCrearaComunidad && (
                                <p className="mt-1.5 text-xs text-muted">
                                    No consta en la base de datos: se creará al guardar
                                </p>
                            )}
                        </div>

                        <label>
                            <span className={ESTILO_LABEL}>Administrador</span>
                            <select
                                value={administradorId}
                                onChange={(e) => setAdministradorId(e.target.value)}
                                className={`${ESTILO_CAMPO} cursor-pointer`}
                            >
                                <option value="">-- Sin administrador --</option>
                                {administradores.map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.nombreDespacho ?? "(sin nombre)"}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <div className="grid grid-cols-2 gap-3">
                            <label>
                                <span className={ESTILO_LABEL}>Contacto</span>
                                <input
                                    type="text"
                                    value={contacto}
                                    onChange={(e) => setContacto(e.target.value)}
                                    placeholder="Nombre"
                                    className={ESTILO_CAMPO}
                                />
                            </label>

                            <label>
                                <span className={ESTILO_LABEL}>Teléfono</span>
                                <input
                                    type="tel"
                                    inputMode="tel"
                                    value={telefono}
                                    onChange={(e) => setTelefono(e.target.value)}
                                    placeholder="600 000 000"
                                    className={ESTILO_CAMPO}
                                />
                            </label>
                        </div>

                        <label>
                            <span className={ESTILO_LABEL}>Fecha de la visita</span>
                            <input
                                type="date"
                                value={fecha}
                                onChange={(e) => setFecha(e.target.value)}
                                className={`${ESTILO_CAMPO} cursor-pointer`}
                            />
                        </label>

                        <label>
                            <span className={ESTILO_LABEL}>Observaciones</span>
                            <textarea
                                value={observaciones}
                                onChange={(e) => setObservaciones(e.target.value)}
                                rows={3}
                                placeholder="Accesos, incidencias, lo que convenga recordar..."
                                className={`${ESTILO_CAMPO} resize-none`}
                            />
                            <span className="mt-1 block text-[11px] text-muted">
                                El dictado por voz llega en un bloque posterior
                            </span>
                        </label>
                    </div>
                </section>

                <section className={ESTILO_SECCION}>
                    <p className={ESTILO_TITULO}>Tipo de trabajo</p>

                    <div className="flex flex-wrap gap-2">
                        {modulos.map((modulo) => {
                            const elegido = modulosElegidos.includes(modulo.key);
                            const n = conteo[modulo.key] ?? 0;
                            return (
                                <button
                                    key={modulo.key}
                                    type="button"
                                    onClick={() => alternarModulo(modulo)}
                                    aria-pressed={elegido}
                                    className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                                        elegido
                                            ? "border-ink/30 bg-ink/[0.04] font-medium text-ink"
                                            : "border-hairline text-ink hover:border-ink/20"
                                    }`}
                                >
                                    {modulo.label}
                                    {elegido && n > 0 && (
                                        <span className="rounded-full border border-hairline px-1.5 text-[11px] text-muted">
                                            {n}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </section>

                {modulosElegidos.map((key) => {
                    const modulo = modulos.find((m) => m.key === key);
                    if (!modulo) return null;
                    return (
                        <section key={key} className={ESTILO_SECCION}>
                            <p className={ESTILO_TITULO}>{modulo.label}</p>
                            {modulo.captura === "arbol" ? (
                                <SelectorArbol
                                    subcuenta={subcuenta}
                                    modulo={modulo}
                                    seleccion={seleccion}
                                    onSeleccionChange={setSeleccion}
                                />
                            ) : (
                                <p className="rounded-xl border border-dashed border-hairline px-3 py-4 text-center text-xs text-muted">
                                    {modulo.captura === "importacion"
                                        ? "Importación de Excel / BC3 / PDF: pendiente de desarrollo"
                                        : "Módulo sin estructura definida todavía"}
                                </p>
                            )}
                        </section>
                    );
                })}

                {alertas.length > 0 && (
                    <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                        <p className={ESTILO_TITULO}>Requiere atención</p>
                        <ul className="flex flex-col gap-1.5">
                            {alertas.map((a) => (
                                <li key={a.ruta} className="text-xs text-amber-700 dark:text-amber-400">
                                    <span className="font-medium">{a.moduloLabel}:</span> {a.alerta}
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {(partidas.length > 0 || errores.length > 0) && (
                    <section className={ESTILO_SECCION}>
                        <p className={ESTILO_TITULO}>Resumen ({partidas.length} partidas)</p>

                        <div className="flex flex-col gap-1.5">
                            {partidas.map((p) => (
                                <div
                                    key={p.ruta}
                                    className="flex items-baseline justify-between gap-3 border-b border-hairline pb-1.5 last:border-0"
                                >
                                    <span className="text-xs text-ink">
                                        <span className="text-muted">{p.moduloLabel} · </span>
                                        {p.caminoLabels.join(" › ")}
                                    </span>
                                    <span className="shrink-0 text-xs text-muted">
                                        {p.cantidad !== undefined ? `${p.cantidad} ${p.unidad ?? ""}` : "sin medir"}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {errores.length > 0 && (
                            <ul className="mt-3 flex flex-col gap-1 border-t border-hairline pt-3">
                                {errores.map((e) => (
                                    <li key={e.ruta} className="text-xs text-red-600 dark:text-red-400">
                                        {e.mensaje}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                )}
            </div>

            <div className="sticky bottom-24 z-30 mt-4 rounded-2xl border border-hairline bg-canvas/95 p-3 backdrop-blur-md">
                <p className="mb-2 text-center text-xs text-muted">
                    {faltanDatosGenerales
                        ? "Completa comunidad, contacto, teléfono y fecha"
                        : errores.length > 0
                          ? "Hay partidas marcadas sin resolver"
                          : partidas.length === 0
                            ? "Selecciona al menos una partida"
                            : "Envío pendiente de implementar"}
                </p>
                <button
                    type="button"
                    disabled
                    className="w-full cursor-not-allowed rounded-xl bg-ink py-3 text-sm font-semibold text-canvas opacity-40"
                >
                    Enviar presupuesto
                </button>
            </div>
        </div>
    );
}