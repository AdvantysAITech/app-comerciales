"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SelectorArbol } from "@/components/forms/SelectorArbol";
import { SubidorFotos } from "@/components/forms/SubidorFotos";
import { SubidorDocumentos } from "@/components/forms/SubidorDocumentos";
import { GrabadorVoz } from "@/components/forms/GrabadorVoz";
import { getModulos, type ModuloTrabajo } from "@/lib/catalogo";
import type { DocumentoAdjunto } from "@/lib/documentos/tipos";
import { normalizarNombre } from "@/lib/texto";
import {
    cargarBorrador,
    describirAntiguedad,
    guardarBorrador,
    limpiarBorrador,
    tieneContenido,
    type DatosBorrador,
} from "@/lib/visita/borrador";
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
 * Formulario de captura de presupuesto (flujo v2).
 *
 * Envia a /api/registrar-presupuesto, que crea comunidad, contacto y
 * oportunidad(es) en GHL con el payload canonico de la visita. Ese payload es
 * despues la entrada del generador de documentos.
 */

type ComunidadListado = { id: string; nombreDireccion: string; administradorId?: string };
type AdministradorListado = { id: string; nombreDespacho?: string };

type Props = {
    subcuenta: Subcuenta;
    comunidades: ComunidadListado[];
    administradores: AdministradorListado[];
};

type OportunidadCreada = { id: string; nombre: string; modeloNegocio: string | null };

type ResultadoAlta = {
    comunidad: { id: string; nombre: string; creada: boolean };
    oportunidades: OportunidadCreada[];
    avisos: string[];
};

const ESTILO_CAMPO =
    "w-full rounded-xl border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-ink/30 focus:outline-none";
const ESTILO_LABEL = "mb-1.5 block text-xs text-muted";
const ESTILO_SECCION = "rounded-2xl border border-hairline bg-surface p-4";
const ESTILO_TITULO = "mb-3 text-[11px] font-medium uppercase tracking-wide text-muted";

/** Fotos minimas cuando el modulo incluye una partida con aviso (amianto). */
const MINIMO_FOTOS_CON_ALERTA = 3;

/** Espera del autoguardado. Escribir en cada pulsacion castiga al movil. */
const RETARDO_AUTOGUARDADO = 800;

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
    const [fotosPorModulo, setFotosPorModulo] = useState<Record<string, string[]>>({});
    const [documentosPorModulo, setDocumentosPorModulo] = useState<Record<string, DocumentoAdjunto[]>>({});

    const [borradorRecuperado, setBorradorRecuperado] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);
    const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
    const [resultado, setResultado] = useState<ResultadoAlta | null>(null);

    // Evita que el autoguardado pise el borrador con el formulario vacio durante
    // el primer render, antes de haber intentado recuperarlo.
    const rehidratado = useRef(false);

    const modulos = useMemo(() => getModulos(subcuenta), [subcuenta]);

    // Las dependencias son TODOS los campos. Con el array vacio, `datosActuales`
    // se congela en el primer render y el autoguardado acaba escribiendo el
    // formulario vacio encima del borrador en cada pulsacion.
    const datosActuales: DatosBorrador = useMemo(
        () => ({
            nombreComunidad,
            comunidadElegidaId,
            administradorId,
            contacto,
            telefono,
            fecha,
            observaciones,
            modulosElegidos,
            seleccion,
            fotosPorModulo,
            documentosPorModulo,
        }),
        [
            nombreComunidad,
            comunidadElegidaId,
            administradorId,
            contacto,
            telefono,
            fecha,
            observaciones,
            modulosElegidos,
            seleccion,
            fotosPorModulo,
            documentosPorModulo,
        ]
    );

    useEffect(() => {
        const borrador = cargarBorrador(subcuenta);

        if (borrador && tieneContenido(borrador)) {
            setNombreComunidad(borrador.nombreComunidad);
            setComunidadElegidaId(borrador.comunidadElegidaId);
            setAdministradorId(borrador.administradorId);
            setContacto(borrador.contacto);
            setTelefono(borrador.telefono);
            setFecha(borrador.fecha);
            setObservaciones(borrador.observaciones);
            setModulosElegidos(borrador.modulosElegidos);
            setSeleccion(borrador.seleccion);
            setFotosPorModulo(borrador.fotosPorModulo);
            setDocumentosPorModulo(borrador.documentosPorModulo ?? {});
            setBorradorRecuperado(borrador.guardadoEn);
        }

        rehidratado.current = true;
    }, [subcuenta]);

    useEffect(() => {
        if (!rehidratado.current) return;
        if (!tieneContenido(datosActuales)) return;

        const id = setTimeout(() => guardarBorrador(subcuenta, datosActuales), RETARDO_AUTOGUARDADO);
        return () => clearTimeout(id);
    }, [subcuenta, datosActuales]);

    const sugerencias = useMemo(() => {
        const texto = normalizarNombre(nombreComunidad);
        if (texto.length < 2) return [];
        return comunidades.filter((c) => normalizarNombre(c.nombreDireccion).includes(texto)).slice(0, 5);
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

    const modulosConAlerta = useMemo(() => new Set(alertas.map((a) => a.moduloKey)), [alertas]);

    /** Minimo de fotos de un modulo: el del catalogo, o el de alerta si es mayor. */
    const minimoFotos = useCallback(
        (key: string) => {
            const delCatalogo = modulos.find((m) => m.key === key)?.fotosMinimas ?? 0;
            return modulosConAlerta.has(key) ? Math.max(delCatalogo, MINIMO_FOTOS_CON_ALERTA) : delCatalogo;
        },
        [modulos, modulosConAlerta]
    );

    const modulosSinFotosSuficientes = useMemo(
        () => modulosElegidos.filter((key) => (fotosPorModulo[key]?.length ?? 0) < minimoFotos(key)),
        [modulosElegidos, fotosPorModulo, minimoFotos]
    );

    function alternarModulo(modulo: ModuloTrabajo) {
        setModulosElegidos((anterior) => {
            if (anterior.includes(modulo.key)) {
                // Al quitar un modulo se limpian sus partidas: si no, quedarian
                // huerfanas en el estado y viajarian al presupuesto sin que
                // nadie las vea en pantalla.
                setSeleccion((s) => limpiarModulo(s, modulo.key));
                setFotosPorModulo((f) => {
                    const siguiente = { ...f };
                    delete siguiente[modulo.key];
                    return siguiente;
                });
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

    function descartarBorrador() {
        limpiarBorrador(subcuenta);
        setNombreComunidad("");
        setComunidadElegidaId(null);
        setAdministradorId("");
        setContacto("");
        setTelefono("");
        setFecha("");
        setObservaciones("");
        setModulosElegidos([]);
        setSeleccion(seleccionVacia);
        setFotosPorModulo({});
        setDocumentosPorModulo({});
        setBorradorRecuperado(null);
    }

    // La transcripcion se ANADE a lo ya escrito, nunca lo sustituye: borrar
    // texto tecleado al pulsar un boton seria un fallo grave estando en obra.
    function anadirTranscripcion(texto: string) {
        setObservaciones((actual) => (actual.trim() ? `${actual.trim()}\n${texto}` : texto));
    }

    const faltanDatosGenerales =
        nombreComunidad.trim() === "" || contacto.trim() === "" || telefono.trim() === "" || fecha === "";

    const motivoBloqueo = faltanDatosGenerales
        ? "Completa comunidad, contacto, teléfono y fecha"
        : errores.length > 0
          ? "Hay partidas marcadas sin resolver"
          : partidas.length === 0
            ? "Selecciona al menos una partida"
            : modulosSinFotosSuficientes.length > 0
              ? `Faltan fotos en: ${modulosSinFotosSuficientes
                    .map((k) => modulos.find((m) => m.key === k)?.label ?? k)
                    .join(", ")}`
              : null;

    const puedeEnviar = motivoBloqueo === null && !enviando;

    async function enviar() {
        if (!puedeEnviar) return;

        setEnviando(true);
        setErrorEnvio(null);

        try {
            // La subcuenta, la empresa y el comercial NO se mandan: los resuelve
            // el servidor desde la sesion. Un formulario no decide en que
            // subcuenta escribe.
            const respuesta = await fetch("/api/registrar-presupuesto", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    comunidadNombre: nombreComunidad.trim(),
                    administradorId: administradorId || null,
                    contacto: contacto.trim(),
                    telefono: telefono.trim(),
                    fechaVisita: fecha,
                    observaciones: observaciones.trim(),
                    modulosElegidos,
                    seleccion,
                    fotosPorModulo,
                }),
            });

            const datos = await respuesta.json();
            if (!respuesta.ok) throw new Error(datos.error ?? `Error ${respuesta.status}`);

            // Solo se limpia el borrador con el alta CONFIRMADA. Si falla, el
            // comercial conserva la visita y puede reintentar sin recapturar.
            limpiarBorrador(subcuenta);
            setResultado(datos as ResultadoAlta);
        } catch (error) {
            setErrorEnvio(error instanceof Error ? error.message : "Error desconocido");
        } finally {
            setEnviando(false);
        }
    }

    if (resultado) {
        return (
            <div className="px-4 pb-24 pt-6 sm:px-10">
                <h1 className="mb-5 text-xl font-semibold text-ink sm:text-2xl">Presupuesto registrado</h1>

                <section className={ESTILO_SECCION}>
                    <p className={ESTILO_TITULO}>Comunidad</p>
                    <p className="text-sm text-ink">{resultado.comunidad.nombre}</p>

                    <p className={`${ESTILO_TITULO} mt-4`}>
                        Oportunidades ({resultado.oportunidades.length})
                    </p>
                    <div className="flex flex-col gap-1.5">
                        {resultado.oportunidades.map((o) => (
                            <div key={o.id} className="border-b border-hairline pb-1.5 text-xs last:border-0">
                                <span className="text-ink">{o.nombre}</span>
                                <span className="ml-2 text-muted">{o.id}</span>
                            </div>
                        ))}
                    </div>

                    {resultado.avisos.length > 0 && (
                        <ul className="mt-4 flex flex-col gap-1 border-t border-hairline pt-3">
                            {resultado.avisos.map((a, i) => (
                                <li key={i} className="text-xs text-amber-700 dark:text-amber-400">
                                    {a}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <button
                    type="button"
                    onClick={() => {
                        setResultado(null);
                        descartarBorrador();
                    }}
                    className="mt-4 w-full cursor-pointer rounded-xl bg-ink py-3 text-sm font-semibold text-canvas"
                >
                    Registrar otro presupuesto
                </button>
            </div>
        );
    }

    return (
        <div className="px-4 pb-24 pt-6 sm:px-10">
            <h1 className="mb-5 text-xl font-semibold text-ink sm:text-2xl">Nuevo presupuesto</h1>

            {borradorRecuperado && (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-hairline bg-ink/[0.04] px-4 py-3">
                    <p className="text-xs text-muted">
                        Borrador recuperado ({describirAntiguedad(borradorRecuperado)})
                    </p>
                    <button
                        type="button"
                        onClick={descartarBorrador}
                        className="shrink-0 cursor-pointer rounded-lg border border-hairline px-2.5 py-1.5 text-xs font-medium text-ink transition hover:bg-canvas"
                    >
                        Empezar de cero
                    </button>
                </div>
            )}

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

                        <div>
                            <label>
                                <span className={ESTILO_LABEL}>Observaciones</span>
                                <textarea
                                    value={observaciones}
                                    onChange={(e) => setObservaciones(e.target.value)}
                                    rows={3}
                                    placeholder="Accesos, incidencias, lo que convenga recordar..."
                                    className={`${ESTILO_CAMPO} resize-none`}
                                    disabled={enviando}
                                />
                            </label>
                            <div className="mt-2">
                                <GrabadorVoz onTranscripcion={anadirTranscripcion} disabled={enviando} />
                            </div>
                        </div>
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
                            ) : modulo.captura === "importacion" ? (
                                <SubidorDocumentos
                                    documentos={documentosPorModulo[key] ?? []}
                                    onDocumentosChange={(docs) =>
                                        setDocumentosPorModulo((anterior) => ({ ...anterior, [key]: docs }))
                                    }
                                    disabled={enviando}
                                />
                            ) : (
                                <p className="rounded-xl border border-dashed border-hairline px-3 py-4 text-center text-xs text-muted">
                                    Módulo sin estructura definida todavía
                                </p>
                            )}

                            <div className="mt-4 border-t border-hairline pt-4">
                                <SubidorFotos
                                    fotos={fotosPorModulo[key] ?? []}
                                    onFotosChange={(fotos) =>
                                        setFotosPorModulo((anterior) => ({ ...anterior, [key]: fotos }))
                                    }
                                    minimo={minimoFotos(key)}
                                />
                            </div>
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

                {errorEnvio && (
                    <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
                        <p className="text-xs text-red-700 dark:text-red-400">{errorEnvio}</p>
                        <p className="mt-1 text-[11px] text-muted">
                            La visita sigue guardada en el borrador: puedes reintentar sin recapturar nada.
                        </p>
                    </section>
                )}
            </div>

            <div className="sticky bottom-24 z-30 mt-4 rounded-2xl border border-hairline bg-canvas/95 p-3 backdrop-blur-md">
                {motivoBloqueo && <p className="mb-2 text-center text-xs text-muted">{motivoBloqueo}</p>}
                <button
                    type="button"
                    onClick={enviar}
                    disabled={!puedeEnviar}
                    className={`w-full rounded-xl bg-ink py-3 text-sm font-semibold text-canvas transition ${
                        puedeEnviar ? "cursor-pointer" : "cursor-not-allowed opacity-40"
                    }`}
                >
                    {enviando ? "Enviando..." : "Enviar presupuesto"}
                </button>
            </div>
        </div>
    );
}