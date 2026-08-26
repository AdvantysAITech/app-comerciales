"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SelectorArbol } from "@/components/forms/SelectorArbol";
import { SubidorFotos } from "@/components/forms/SubidorFotos";
<<<<<<< HEAD:components/forms/FormularioPresupuestoV2.tsx
=======
import { SubidorDocumentos } from "@/components/forms/SubidorDocumentos";
import { GrabadorVoz } from "@/components/forms/GrabadorVoz";
>>>>>>> origin/main:components/forms/FormularioPresupuesto.tsx
import { getModulos, type ModuloTrabajo } from "@/lib/catalogo";
import { normalizarNombre } from "@/lib/texto";
import type { DocumentoAdjunto } from "@/lib/documentos/tipos";
import {
    cargarBorrador,
    describirAntiguedad,
    guardarBorrador,
    limpiarBorrador,
    tieneContenido,
    type BorradorPresupuesto,
} from "@/lib/visita/borrador";
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
 * Formulario de captura v2.
 *
<<<<<<< HEAD:components/forms/FormularioPresupuestoV2.tsx
 * Convive con el formulario actual en una ruta aparte: el flujo antiguo sigue
 * operativo en produccion hasta que este esté completo (el envío llega en B4).
=======
 * Convive con el formulario antiguo (/visitas/nueva), que sigue operativo en
 * produccion hasta que este pase la prueba end-to-end real.
>>>>>>> origin/main:components/forms/FormularioPresupuesto.tsx
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

type OportunidadCreada = {
    id: string;
    nombre: string;
    modeloNegocio: string | null;
    bytesJson: number;
};

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

<<<<<<< HEAD:components/forms/FormularioPresupuestoV2.tsx
/** Fotos mínimas cuando el módulo incluye una partida con aviso (amianto). */
const MINIMO_FOTOS_CON_ALERTA = 3;
=======
/** Espera antes de guardar el borrador. Evita escribir en cada tecla. */
const RETARDO_AUTOGUARDADO = 800;
>>>>>>> origin/main:components/forms/FormularioPresupuesto.tsx

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
<<<<<<< HEAD:components/forms/FormularioPresupuestoV2.tsx

    const [borradorRecuperado, setBorradorRecuperado] = useState<string | null>(null);
    // Evita que el autoguardado pise el borrador con el formulario vacío durante
    // el primer render, antes de haber intentado recuperarlo.
    const rehidratado = useRef(false);

    const modulos = useMemo(() => getModulos(subcuenta), [subcuenta]);

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
        ]
    );

    // Recuperación del borrador al montar.
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
            setBorradorRecuperado(borrador.guardadoEn);
        }

        rehidratado.current = true;
    }, [subcuenta]);

    // Autoguardado con retardo: escribir en cada pulsación castiga al móvil sin
    // aportar nada.
    useEffect(() => {
        if (!rehidratado.current) return;
        if (!tieneContenido(datosActuales)) return;

        const id = setTimeout(() => guardarBorrador(subcuenta, datosActuales), 800);
        return () => clearTimeout(id);
    }, [subcuenta, datosActuales]);

=======
    const [documentosPorModulo, setDocumentosPorModulo] = useState<Record<string, DocumentoAdjunto[]>>({});

    const [borradorRecuperable, setBorradorRecuperable] = useState<BorradorPresupuesto | null>(null);
    const [enviando, setEnviando] = useState(false);
    const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
    const [resultado, setResultado] = useState<ResultadoAlta | null>(null);

    // Mientras no se decida sobre el borrador no se autoguarda: si no, el propio
    // formulario vacio sobrescribiria el borrador que estamos ofreciendo.
    const autoguardadoActivo = useRef(false);

    const modulos = useMemo(() => getModulos(subcuenta), [subcuenta]);

    // --- Borrador --------------------------------------------------------

    useEffect(() => {
        const guardado = cargarBorrador(subcuenta);
        if (guardado && tieneContenido(guardado)) {
            setBorradorRecuperable(guardado);
        } else {
            autoguardadoActivo.current = true;
        }
    }, [subcuenta]);

    useEffect(() => {
        if (!autoguardadoActivo.current || resultado) return;

        const datos = {
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
        };

        if (!tieneContenido(datos)) return;

        const temporizador = setTimeout(() => guardarBorrador(subcuenta, datos), RETARDO_AUTOGUARDADO);
        return () => clearTimeout(temporizador);
    }, [
        subcuenta,
        resultado,
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
    ]);

    function recuperarBorrador() {
        const b = borradorRecuperable;
        if (!b) return;

        setNombreComunidad(b.nombreComunidad);
        setComunidadElegidaId(b.comunidadElegidaId);
        setAdministradorId(b.administradorId);
        setContacto(b.contacto);
        setTelefono(b.telefono);
        setFecha(b.fecha);
        setObservaciones(b.observaciones);
        setModulosElegidos(b.modulosElegidos);
        setSeleccion(b.seleccion);
        setFotosPorModulo(b.fotosPorModulo);
        // Sin `?? {}`: cargarBorrador ya rellena el campo en los borradores
        // guardados antes de este cambio, asi que aqui llega siempre definido.
        setDocumentosPorModulo(b.documentosPorModulo);

        setBorradorRecuperable(null);
        autoguardadoActivo.current = true;
    }

    function descartarBorrador() {
        limpiarBorrador(subcuenta);
        setBorradorRecuperable(null);
        autoguardadoActivo.current = true;
    }

    // --- Comunidad -------------------------------------------------------

    // Sugerencias mientras escribe. Coincidencia parcial: la maquina propone,
    // el comercial decide. Nunca se empareja solo.
>>>>>>> origin/main:components/forms/FormularioPresupuesto.tsx
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

    function elegirSugerencia(comunidad: ComunidadListado) {
        setComunidadElegidaId(comunidad.id);
        setNombreComunidad(comunidad.nombreDireccion);
        if (comunidad.administradorId) setAdministradorId(comunidad.administradorId);
    }

    // --- Seleccion -------------------------------------------------------

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

<<<<<<< HEAD:components/forms/FormularioPresupuestoV2.tsx
    const modulosConAlerta = useMemo(
        () => new Set(alertas.map((a) => a.moduloKey)),
        [alertas]
    );

    const modulosSinFotosSuficientes = useMemo(
        () =>
            [...modulosConAlerta].filter(
                (key) => (fotosPorModulo[key]?.length ?? 0) < MINIMO_FOTOS_CON_ALERTA
            ),
        [modulosConAlerta, fotosPorModulo]
    );
=======
    // Modulos que exigen un minimo de fotos y no lo cumplen. El caso real es
    // Gestion de residuos: el DERCAS 6.2 pide 3 fotos minimo para amianto.
    const fotosInsuficientes = useMemo(() => {
        return modulosElegidos
            .map((key) => modulos.find((m) => m.key === key))
            .filter((m): m is ModuloTrabajo => Boolean(m))
            .filter((m) => (m.fotosMinimas ?? 0) > (fotosPorModulo[m.key]?.length ?? 0));
    }, [modulos, modulosElegidos, fotosPorModulo]);
>>>>>>> origin/main:components/forms/FormularioPresupuesto.tsx

    function alternarModulo(modulo: ModuloTrabajo) {
        setModulosElegidos((anterior) => {
            if (anterior.includes(modulo.key)) {
<<<<<<< HEAD:components/forms/FormularioPresupuestoV2.tsx
=======
                // Al quitar un modulo se limpian sus partidas: si no, quedarian
                // huerfanas en el estado y viajarian al presupuesto sin que
                // nadie las vea en pantalla.
>>>>>>> origin/main:components/forms/FormularioPresupuesto.tsx
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

    function fijarFotos(moduloKey: string, fotos: string[]) {
        setFotosPorModulo((anterior) => ({ ...anterior, [moduloKey]: fotos }));
    }

<<<<<<< HEAD:components/forms/FormularioPresupuestoV2.tsx
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
        setBorradorRecuperado(null);
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
              : "Envío pendiente de implementar";
=======
    function fijarDocumentos(moduloKey: string, documentos: DocumentoAdjunto[]) {
        setDocumentosPorModulo((anterior) => ({ ...anterior, [moduloKey]: documentos }));
    }

    // --- Dictado ---------------------------------------------------------

    // La transcripcion se ANADE a lo que ya hubiera escrito, nunca lo sustituye:
    // borrar texto ya tecleado por pulsar un boton seria un fallo grave en obra.
    // Al pasar por setObservaciones entra tambien en el autoguardado.
    function anadirTranscripcion(texto: string) {
        setObservaciones((actual) => (actual.trim() ? `${actual.trim()}\n${texto}` : texto));
    }

    // --- Envio -----------------------------------------------------------

    const faltanDatosGenerales =
        nombreComunidad.trim() === "" || contacto.trim() === "" || telefono.trim() === "" || fecha === "";

    // El modulo Proyectos tiene `estructura: []` y por tanto NUNCA genera
    // partidas: ahi el contenido es la documentacion del arquitecto. Sin esto,
    // un comercial que solo sube un BC3 no podria registrar nada.
    const documentosAdjuntos = useMemo(
        () => modulosElegidos.reduce((total, key) => total + (documentosPorModulo[key]?.length ?? 0), 0),
        [modulosElegidos, documentosPorModulo]
    );

    const hayContenido = partidas.length > 0 || documentosAdjuntos > 0;

    const puedeEnviar =
        !enviando &&
        !faltanDatosGenerales &&
        errores.length === 0 &&
        fotosInsuficientes.length === 0 &&
        hayContenido;

    const motivoBloqueo = enviando
        ? "Registrando el presupuesto..."
        : faltanDatosGenerales
          ? "Completa comunidad, contacto, teléfono y fecha"
          : errores.length > 0
            ? "Hay partidas marcadas sin resolver"
            : fotosInsuficientes.length > 0
              ? `Faltan fotos en: ${fotosInsuficientes.map((m) => m.label).join(", ")}`
              : !hayContenido
                ? "Selecciona al menos una partida o adjunta documentación"
                : partidas.length > 0
                  ? `${partidas.length} partidas listas para registrar`
                  : `${documentosAdjuntos} ${documentosAdjuntos === 1 ? "documento listo" : "documentos listos"} para registrar`;

    async function enviar() {
        if (!puedeEnviar) return;

        setEnviando(true);
        setErrorEnvio(null);

        try {
            const response = await fetch("/api/registrar-presupuesto", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    comunidadNombre: nombreComunidad,
                    administradorId: administradorId || null,
                    contacto,
                    telefono,
                    fechaVisita: fecha,
                    observaciones,
                    modulosElegidos,
                    seleccion,
                    fotosPorModulo,
                    documentosPorModulo,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error ?? "No se ha podido registrar el presupuesto");
            }

            // El borrador se limpia SOLO aqui, con el alta ya confirmada. Si se
            // limpiara antes, un fallo de red dejaria al comercial sin datos y
            // sin oportunidad: la visita habria que repetirla.
            limpiarBorrador(subcuenta);
            setResultado(data as ResultadoAlta);
        } catch (e) {
            setErrorEnvio(e instanceof Error ? e.message : "Error desconocido al registrar");
        } finally {
            setEnviando(false);
        }
    }

    function nuevoPresupuesto() {
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
        setResultado(null);
        setErrorEnvio(null);
        autoguardadoActivo.current = true;
    }

    // --- Pantalla de confirmacion ----------------------------------------

    if (resultado) {
        return (
            <div className="px-4 pb-24 pt-6 sm:px-10">
                <h1 className="mb-5 text-xl font-semibold text-ink sm:text-2xl">Presupuesto registrado</h1>

                <div className="flex flex-col gap-3">
                    <section className={ESTILO_SECCION}>
                        <p className={ESTILO_TITULO}>Comunidad</p>
                        <p className="text-sm text-ink">{resultado.comunidad.nombre}</p>
                        {resultado.comunidad.creada && (
                            <p className="mt-1 text-xs text-muted">Creada nueva en la base de datos</p>
                        )}
                    </section>

                    <section className={ESTILO_SECCION}>
                        <p className={ESTILO_TITULO}>
                            {resultado.oportunidades.length === 1 ? "Oportunidad" : "Oportunidades"}
                        </p>
                        <div className="flex flex-col gap-2">
                            {resultado.oportunidades.map((o) => (
                                <div key={o.id} className="border-b border-hairline pb-2 last:border-0">
                                    <p className="text-sm text-ink">{o.nombre}</p>
                                    <p className="mt-0.5 text-xs text-muted">
                                        {o.modeloNegocio ?? "Sin modelo de negocio"} · {o.bytesJson} bytes de datos
                                    </p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {resultado.avisos.length > 0 && (
                        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                            <p className={ESTILO_TITULO}>Ten en cuenta</p>
                            <ul className="flex flex-col gap-1.5">
                                {resultado.avisos.map((aviso, i) => (
                                    <li key={i} className="text-xs text-amber-700 dark:text-amber-400">
                                        {aviso}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </div>

                <button
                    type="button"
                    onClick={nuevoPresupuesto}
                    className="mt-4 w-full cursor-pointer rounded-xl bg-ink py-3 text-sm font-semibold text-canvas"
                >
                    Registrar otro presupuesto
                </button>
            </div>
        );
    }

    // --- Formulario ------------------------------------------------------
>>>>>>> origin/main:components/forms/FormularioPresupuesto.tsx

    return (
        <div className="px-4 pb-24 pt-6 sm:px-10">
            <h1 className="mb-5 text-xl font-semibold text-ink sm:text-2xl">Nuevo presupuesto</h1>

<<<<<<< HEAD:components/forms/FormularioPresupuestoV2.tsx
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
=======
            {borradorRecuperable && (
                <section className="mb-3 rounded-2xl border border-hairline bg-surface p-4">
                    <p className="text-sm text-ink">
                        Hay una visita sin terminar de {describirAntiguedad(borradorRecuperable.guardadoEn)}
                        {borradorRecuperable.nombreComunidad ? `: ${borradorRecuperable.nombreComunidad}` : ""}.
                    </p>
                    <div className="mt-3 flex gap-2">
                        <button
                            type="button"
                            onClick={recuperarBorrador}
                            className="min-h-11 flex-1 cursor-pointer rounded-xl bg-ink px-3 text-sm font-medium text-canvas"
                        >
                            Continuar
                        </button>
                        <button
                            type="button"
                            onClick={descartarBorrador}
                            className="min-h-11 flex-1 cursor-pointer rounded-xl border border-hairline px-3 text-sm text-ink"
                        >
                            Empezar de cero
                        </button>
                    </div>
                </section>
>>>>>>> origin/main:components/forms/FormularioPresupuesto.tsx
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

                        {/* Ya no envuelve al campo: un boton dentro de una etiqueta
                            reenvia el clic al textarea en algunos navegadores. La
                            asociacion se hace con htmlFor/id, que es equivalente. */}
                        <div>
                            <label className={ESTILO_LABEL} htmlFor="observaciones">
                                Observaciones
                            </label>
                            <textarea
                                id="observaciones"
                                value={observaciones}
                                onChange={(e) => setObservaciones(e.target.value)}
                                rows={3}
                                placeholder="Accesos, incidencias, lo que convenga recordar..."
                                className={`${ESTILO_CAMPO} resize-none`}
                            />
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

                    const minimo = modulosConAlerta.has(key) ? MINIMO_FOTOS_CON_ALERTA : 0;

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
                                    onDocumentosChange={(docs) => fijarDocumentos(key, docs)}
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
<<<<<<< HEAD:components/forms/FormularioPresupuestoV2.tsx
                                    onFotosChange={(fotos) =>
                                        setFotosPorModulo((anterior) => ({ ...anterior, [key]: fotos }))
                                    }
                                    minimo={minimo}
=======
                                    onFotosChange={(fotos) => fijarFotos(key, fotos)}
                                    minimo={modulo.fotosMinimas ?? 0}
>>>>>>> origin/main:components/forms/FormularioPresupuesto.tsx
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
                        <p className={ESTILO_TITULO}>No se ha podido registrar</p>
                        <p className="text-xs text-red-600 dark:text-red-400">{errorEnvio}</p>
                        <p className="mt-2 text-xs text-muted">
                            Los datos siguen guardados en este dispositivo. Puedes reintentarlo.
                        </p>
                    </section>
                )}
            </div>

            <div className="sticky bottom-24 z-30 mt-4 rounded-2xl border border-hairline bg-canvas/95 p-3 backdrop-blur-md">
                <p className="mb-2 text-center text-xs text-muted">{motivoBloqueo}</p>
                <button
                    type="button"
                    onClick={enviar}
                    disabled={!puedeEnviar}
                    className={`w-full rounded-xl bg-ink py-3 text-sm font-semibold text-canvas transition ${
                        puedeEnviar ? "cursor-pointer" : "cursor-not-allowed opacity-40"
                    }`}
                >
                    {enviando ? "Registrando..." : "Registrar presupuesto"}
                </button>
            </div>
        </div>
    );
}