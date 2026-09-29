"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { problemasDeLinea, RevisionPropuesta } from "@/components/forms/RevisionPropuesta";
import type {
    CapituloCatalogo,
    LineaPropuesta,
    PartidaCatalogo,
    Propuesta,
} from "@/lib/propuesta/tipos";
import { SubidorFotos } from "@/components/forms/SubidorFotos";
import { SubidorDocumentos } from "@/components/forms/SubidorDocumentos";
import { SubidorPortada } from "@/components/forms/SubidorPortada";
import { PestanasTrabajos, type EstadoTrabajo } from "@/components/forms/PestanasTrabajos";
import { AltaAdministrador, AltaComunidad } from "@/components/forms/AltaRapida";
import { PasoFinca } from "@/components/forms/PasoFinca";
import type { Rol } from "@/lib/roles";
import { getModulos, type ModuloTrabajo } from "@/lib/catalogo";
import {
    ALERTA_AMIANTO_PROPUESTA,
    esPartidaAmianto,
    MOTIVO_SIN_LICENCIA,
    partidaPermitida,
} from "@/lib/catalogo/licencias";
import { conflictosDeCodigo } from "@/lib/propuesta/conflictos";
import { filtrarSinPrecio } from "@/lib/catalogo/disponibilidad";
import type { DocumentoAdjunto } from "@/lib/documentos/tipos";
import { normalizarNombre } from "@/lib/texto";
import {
    cargarBorrador,
    describirAntiguedad,
    guardarBorrador,
    limpiarBorrador,
    normalizarDatos,
    tieneContenido,
    type DatosBorrador,
} from "@/lib/visita/borrador";
import {
    alertasActivas,
    limpiarModulo,
    seleccionVacia,
    type SeleccionVisita,
    type Subcuenta,
} from "@/lib/visita/seleccion";

/**
 * Formulario de captura de presupuesto (flujo v2).
 *
 * Flujo con IA (27/09/2026): por cada tipo de trabajo, fotos + dictado de
 * trabajos y medidas (micrófono del teclado). "Generar propuesta" manda el
 * dictado a la IA (lib/propuesta/generar.ts), que devuelve partidas de la
 * tarifa o de CYPE; el comercial las revisa en `RevisionPropuesta` y "Crear
 * presupuesto" registra en GHL y genera el documento. Todo queda en el borrador
 * de la app mientras tanto.
 *
 * Envia a /api/registrar-presupuesto, que crea comunidad, contacto y
 * oportunidad(es) en GHL con el payload canonico de la visita. Ese payload es
 * despues la entrada del generador de documentos.
 *
 * Con `oportunidadOrigen` (23/09/2026) el formulario toma los datos de una
 * oportunidad en "Visita concertada": sale precargado con lo que ya hay en el
 * CRM y, al guardar, esa oportunidad pasa a "Datos recogidos" en vez de crearse
 * otra.
 */

/** Oportunidad en "Visita concertada" de la que se toman los datos. */
export type OportunidadOrigen = {
    id: string;
    /** Para el titulo. */
    nombre: string;
    comunidadNombre: string;
    contacto: string;
    telefono: string;
    /** "aaaa-mm-dd" o vacio. */
    fecha: string;
};

/** Borrador guardado en la app (lib/borradores/almacen.ts), tal como llega de la página. */
export type BorradorServidor = {
    id: string;
    datos: DatosBorrador;
    actualizadoEn: string;
};

type ComunidadListado = { id: string; nombreDireccion: string; administradorId?: string };
type AdministradorListado = { id: string; nombreDespacho?: string };

type Props = {
    subcuenta: Subcuenta;
    comunidades: ComunidadListado[];
    administradores: AdministradorListado[];
    /**
     * Solo decide si el alta rápida pinta el campo de comisión pactada, que es
     * dato interno de dirección (DERCAS §3.3). No es un control de acceso: la
     * ruta `/api/administradores` descarta la comisión igual si llega desde un
     * perfil comercial. Por defecto `comercial`, que es el caso restrictivo.
     */
    rol?: Rol;
    /** Oportunidad de la que se toman los datos. `null` = visita nueva. */
    oportunidadOrigen?: OportunidadOrigen | null;
    /** Borrador de la app que se retoma. `null` = todavía no hay. */
    borrador?: BorradorServidor | null;
    /**
     * Hay almacén de borradores. Sin él (Upstash sin configurar) el formulario
     * funciona como antes: solo con la copia del móvil.
     */
    almacenDisponible?: boolean;
    /** Tarifa sin costes internos, para añadir o sustituir partidas en la revisión. */
    catalogo?: PartidaCatalogo[];
    capitulos?: CapituloCatalogo[];
    /** Hay ANTHROPIC_API_KEY. Sin ella no se puede generar la propuesta. */
    iaDisponible?: boolean;
};

type Generacion = { fase: "extrayendo" } | { fase: "cype"; hechas: number; total: number } | { fase: "creando" };

/** Respuesta de error del servidor, para distinguirla de un fallo de red. */
class ErrorServidor extends Error {
    constructor(
        readonly status: number,
        mensaje?: string
    ) {
        super(mensaje ?? `Error ${status}`);
        this.name = "ErrorServidor";
    }
}

/** Búsquedas en CYPE a la vez. Más satura la API y no acaba antes. */
const CYPE_EN_PARALELO = 4;

type EstadoNube =
    | { estado: "sin-guardar" }
    | { estado: "guardando" }
    | { estado: "guardado"; en: string }
    | { estado: "error"; mensaje: string };

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

/**
 * Espera del guardado en la app. Más larga que la del móvil: cada guardado es
 * una petición, y en obra la cobertura va y viene.
 */
const RETARDO_NUBE = 2500;

/** Tras un fallo de red, cada cuánto se reintenta aunque no haya cambios. */
const REINTENTO_NUBE = 15000;

export function FormularioPresupuesto({
    subcuenta,
    comunidades,
    administradores,
    rol = "comercial",
    oportunidadOrigen = null,
    borrador = null,
    almacenDisponible = false,
    catalogo = [],
    capitulos = [],
    iaDisponible = false,
}: Props) {
    /**
     * Clave de la copia local. Con borrador de la app, una por borrador. Con
     * oportunidad de origen, una por oportunidad: el borrador de la visita de
     * ayer no puede aparecer al abrir la de hoy. Sin nada, la de siempre (visita
     * nueva que todavía no ha llegado al servidor, p. ej. sin cobertura).
     *
     * Es estado porque cambia cuando la visita nueva recibe su id de borrador:
     * la copia local se muda a la clave del borrador (ver `sincronizar`).
     */
    const [claveLocal, setClaveLocal] = useState(() =>
        borrador
            ? `${subcuenta}:borrador:${borrador.id}`
            : oportunidadOrigen
              ? `${subcuenta}:oportunidad:${oportunidadOrigen.id}`
              : subcuenta
    );

    /** Datos del borrador de la app con los que arranca, si se retoma uno. */
    const base = borrador?.datos ?? null;

    /** Valores con los que arranca (y a los que vuelve "Empezar de cero"). */
    const inicial = {
        nombreComunidad: oportunidadOrigen?.comunidadNombre ?? "",
        contacto: oportunidadOrigen?.contacto ?? "",
        telefono: oportunidadOrigen?.telefono ?? "",
        fecha: oportunidadOrigen?.fecha ?? "",
    };

    /**
     * Las listas llegan del servidor pero viven en estado local: cuando el
     * comercial crea un administrador o una comunidad desde el modal, el
     * registro nuevo tiene que aparecer en el desplegable SIN recargar. Un
     * `router.refresh()` volvería a montar el formulario y se perdería lo que
     * ya lleva escrito, que en obra es inaceptable.
     */
    const [listaComunidades, setListaComunidades] = useState<ComunidadListado[]>(comunidades);
    const [listaAdministradores, setListaAdministradores] = useState<AdministradorListado[]>(administradores);
    const [alta, setAlta] = useState<"administrador" | "comunidad" | null>(null);
    /** Lo tecleado en el buscador del paso de la finca, para no reescribirlo en el alta. */
    const [nombreAlta, setNombreAlta] = useState("");
    /**
     * Paso previo "¿Qué finca vas a visitar?". Visita nueva: se empieza por ahí.
     * Desde una oportunidad en "Visita concertada" la finca ya viene del CRM y
     * se salta (con "Cambiar" para volver).
     */
    const [eligiendoFinca, setEligiendoFinca] = useState(
        !oportunidadOrigen && !(base?.nombreComunidad.trim())
    );

    const [nombreComunidad, setNombreComunidad] = useState(base?.nombreComunidad ?? inicial.nombreComunidad);
    const [comunidadElegidaId, setComunidadElegidaId] = useState<string | null>(base?.comunidadElegidaId ?? null);
    const [administradorId, setAdministradorId] = useState(base?.administradorId ?? "");
    const [contacto, setContacto] = useState(base?.contacto ?? inicial.contacto);
    const [telefono, setTelefono] = useState(base?.telefono ?? inicial.telefono);
    const [fecha, setFecha] = useState(base?.fecha ?? inicial.fecha);
    const [observaciones, setObservaciones] = useState(base?.observaciones ?? "");
    const [modulosElegidos, setModulosElegidos] = useState<string[]>(base?.modulosElegidos ?? []);
    const [seleccion, setSeleccion] = useState<SeleccionVisita>(base?.seleccion ?? seleccionVacia);
    const [fotosPorModulo, setFotosPorModulo] = useState<Record<string, string[]>>(base?.fotosPorModulo ?? {});
    const [documentosPorModulo, setDocumentosPorModulo] = useState<Record<string, DocumentoAdjunto[]>>(
        base?.documentosPorModulo ?? {}
    );
    /** Foto de la portada del presupuesto (29/09/2026). */
    const [imagenPortada, setImagenPortada] = useState<string | null>(base?.imagenPortada ?? null);

    // --- Dictado y propuesta por IA -----------------------------------------
    const [dictadoPorModulo, setDictadoPorModulo] = useState<Record<string, string>>(base?.dictadoPorModulo ?? {});
    const [propuesta, setPropuesta] = useState<Propuesta | null>(base?.propuesta ?? null);
    /** En la pantalla de revisión. Un borrador que ya tiene propuesta se abre ahí. */
    const [revisando, setRevisando] = useState(Boolean(base?.propuesta));
    const [generacion, setGeneracion] = useState<Generacion | null>(null);
    const [errorPropuesta, setErrorPropuesta] = useState<string | null>(null);
    const [confirmandoRehacer, setConfirmandoRehacer] = useState(false);
    /** Tipo de trabajo con contenido que el comercial quiere quitar: se confirma. */
    const [quitandoModulo, setQuitandoModulo] = useState<ModuloTrabajo | null>(null);
    /**
     * Tipo de trabajo que se está rellenando (29/09/2026). Solo se ve uno a la
     * vez, en pestañas: antes se apilaban todos y había que bajar y bajar.
     */
    const [moduloActivo, setModuloActivo] = useState<string | null>(null);

    // --- Borrador en la app ------------------------------------------------
    const [borradorId, setBorradorId] = useState<string | null>(borrador?.id ?? null);
    const [nube, setNube] = useState<EstadoNube>(
        borrador ? { estado: "guardado", en: borrador.actualizadoEn } : { estado: "sin-guardar" }
    );
    /** Sube tras un fallo de red para reintentar aunque el comercial no toque nada. */
    const [reintento, setReintento] = useState(0);
    const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
    /** Lo último que el servidor tiene guardado, serializado. Evita guardados vacíos. */
    // Normalizado, con la misma forma que `datosActuales`: un borrador guardado
    // antes de añadir un campo (p. ej. `imagenPortada`) no lo trae, el
    // serializado no coincidía y se reenviaba nada más abrirlo, subiendo en el
    // panel como si se hubiera tocado (29/09/2026).
    const ultimoEnviado = useRef<string | null>(borrador ? JSON.stringify(normalizarDatos(borrador.datos)) : null);
    const creando = useRef(false);
    /** Una vez enviado el presupuesto, el borrador no se vuelve a escribir. */
    const enviado = useRef(false);
    /** El borrador ha desaparecido del servidor (enviado o eliminado desde otro sitio). */
    const perdido = useRef(false);

    const [borradorRecuperado, setBorradorRecuperado] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);
    const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
    const [resultado, setResultado] = useState<ResultadoAlta | null>(null);

    // Evita que el autoguardado pise el borrador con el formulario vacio durante
    // el primer render, antes de haber intentado recuperarlo.
    const rehidratado = useRef(false);

    // `filtrarSinPrecio` esconde las opciones que la tarifa 2026 no sabe valorar.
    // Si el comercial no las ve, no puede marcarlas, y el 422 al generar deja de
    // ocurrir. Lo que se salga del catálogo va al nodo "Varios" como texto libre.
    // Es temporal: en cuanto Miguel decida esas partidas, vuelven solas.
    const modulos = useMemo(() => getModulos(subcuenta).map(filtrarSinPrecio), [subcuenta]);

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
            dictadoPorModulo,
            propuesta,
            imagenPortada,
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
            dictadoPorModulo,
            propuesta,
            imagenPortada,
        ]
    );

    // Recuperación de la copia local. Solo al montar: `claveLocal` cambia cuando
    // la visita recibe su id de borrador y eso no es "abrir otra visita".
    useEffect(() => {
        if (rehidratado.current) return;
        const local = cargarBorrador(claveLocal);

        // Con borrador de la app, la copia local solo gana si es MÁS NUEVA: es la
        // que se quedó sin subir por falta de cobertura.
        const localGana =
            local &&
            tieneContenido(local) &&
            (!borrador || new Date(local.guardadoEn).getTime() > new Date(borrador.actualizadoEn).getTime());

        if (local && localGana) {
            setNombreComunidad(local.nombreComunidad);
            setComunidadElegidaId(local.comunidadElegidaId);
            setAdministradorId(local.administradorId);
            setContacto(local.contacto);
            setTelefono(local.telefono);
            setFecha(local.fecha);
            setObservaciones(local.observaciones);
            setModulosElegidos(local.modulosElegidos);
            setSeleccion(local.seleccion);
            setFotosPorModulo(local.fotosPorModulo);
            setDocumentosPorModulo(local.documentosPorModulo ?? {});
            setDictadoPorModulo(local.dictadoPorModulo ?? {});
            setPropuesta(local.propuesta ?? null);
            setImagenPortada(local.imagenPortada ?? null);
            setRevisando(Boolean(local.propuesta));
            setBorradorRecuperado(local.guardadoEn);
            // Un borrador con finca ya elegida vuelve directo al formulario.
            if (local.nombreComunidad.trim() !== "") setEligiendoFinca(false);
        } else if (oportunidadOrigen && !borrador) {
            // Abrir una visita concertada no crea borrador: lo precargado del CRM
            // no es trabajo del comercial. Se crea con el primer cambio real.
            ultimoEnviado.current = JSON.stringify(datosActuales);
        }

        rehidratado.current = true;

        // Búsquedas en CYPE que se quedaron a medias (28/09/2026): el
        // autoguardado recoge las líneas "buscando" y, si el comercial bloqueó
        // el móvil o recargó, nadie las relanzaba. Se quedaban en "Buscando en
        // CYPE…" para siempre y el presupuesto no se podía crear.
        const propuestaInicial = local && localGana ? local.propuesta : base?.propuesta;
        const aMedias = (propuestaInicial?.lineas ?? []).filter((l) => l.pendienteCype);
        if (aMedias.length > 0) void completarCype(aMedias);
        // Solo al montar, a propósito (ver comentario de arriba).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!rehidratado.current) return;
        if (!tieneContenido(datosActuales)) return;

        const id = setTimeout(() => guardarBorrador(claveLocal, datosActuales), RETARDO_AUTOGUARDADO);
        return () => clearTimeout(id);
    }, [claveLocal, datosActuales]);

    // Guardado en la app (27/09/2026). En cuanto hay comunidad, el borrador
    // existe en el servidor y aparece en la columna Borradores del panel.
    useEffect(() => {
        if (!almacenDisponible || !rehidratado.current || enviado.current || perdido.current) return;
        if (datosActuales.nombreComunidad.trim() === "") return;

        const serial = JSON.stringify(datosActuales);
        if (serial === ultimoEnviado.current) return;

        const datos = datosActuales;
        const temporizador = setTimeout(async () => {
            if (creando.current) return; // la creación en curso relanza este efecto al acabar
            const administrador = listaAdministradores.find((a) => a.id === datos.administradorId)?.nombreDespacho ?? null;

            setNube({ estado: "guardando" });
            try {
                if (!borradorId) {
                    creando.current = true;
                    const respuesta = await fetch("/api/borradores", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ datos, oportunidadId: oportunidadOrigen?.id ?? null, administrador }),
                    });
                    const cuerpo = await respuesta.json().catch(() => ({}));
                    if (!respuesta.ok) throw new ErrorServidor(respuesta.status, cuerpo.error);

                    // Se envió el presupuesto mientras se creaba: el borrador sobra.
                    if (enviado.current) {
                        void fetch(`/api/borradores/${cuerpo.id}`, { method: "DELETE" });
                        return;
                    }

                    // La copia local se muda a la clave del borrador. Si no, la
                    // próxima visita nueva la "recuperaría" como si fuera suya.
                    const nuevaClave = `${subcuenta}:borrador:${cuerpo.id}`;
                    guardarBorrador(nuevaClave, datos);
                    if (nuevaClave !== claveLocal) limpiarBorrador(claveLocal);
                    setClaveLocal(nuevaClave);
                    setBorradorId(cuerpo.id);
                    // Recargar ahora abre ESTE borrador, no un formulario vacío.
                    window.history.replaceState(null, "", `/presupuestos/nuevo?borrador=${cuerpo.id}`);
                    ultimoEnviado.current = serial;
                    setNube({ estado: "guardado", en: cuerpo.actualizadoEn });
                } else {
                    const respuesta = await fetch(`/api/borradores/${borradorId}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ datos, administrador }),
                    });
                    const cuerpo = await respuesta.json().catch(() => ({}));
                    if (respuesta.status === 404) {
                        perdido.current = true;
                        setNube({
                            estado: "error",
                            mensaje: "Este borrador ya no existe (se creó el presupuesto o se eliminó en otro dispositivo).",
                        });
                        return;
                    }
                    if (!respuesta.ok) throw new ErrorServidor(respuesta.status, cuerpo.error);
                    ultimoEnviado.current = serial;
                    setNube({ estado: "guardado", en: cuerpo.actualizadoEn });
                }
            } catch (error) {
                // Un rechazo del servidor (413, 400...) no se arregla reintentando:
                // antes se decía "Sin conexión" y se reintentaba cada 15 s para
                // siempre (28/09/2026). Se reintenta solo sin red o con 5xx; si
                // no, se dice el motivo y se vuelve a probar con el siguiente cambio.
                // 408 y 429 son transitorios: se reintentan como un fallo de red.
                const rechazo =
                    error instanceof ErrorServidor &&
                    error.status < 500 &&
                    error.status !== 408 &&
                    error.status !== 429;
                setNube({
                    estado: "error",
                    mensaje: rechazo
                        ? `No se ha podido guardar el borrador en la app: ${error.message}. Sigue guardado en este dispositivo.`
                        : "Sin conexión: guardado solo en este dispositivo. Se reintentará.",
                });
                if (!rechazo) setTimeout(() => setReintento((n) => n + 1), REINTENTO_NUBE);
            } finally {
                creando.current = false;
            }
        }, RETARDO_NUBE);

        return () => clearTimeout(temporizador);
    }, [
        almacenDisponible,
        datosActuales,
        borradorId,
        reintento,
        claveLocal,
        subcuenta,
        oportunidadOrigen,
        listaAdministradores,
    ]);

    async function eliminarBorradorApp() {
        if (!borradorId) return;
        try {
            const respuesta = await fetch(`/api/borradores/${borradorId}`, { method: "DELETE" });
            if (!respuesta.ok && respuesta.status !== 404) {
                const cuerpo = await respuesta.json().catch(() => ({}));
                throw new Error(cuerpo.error ?? `Error ${respuesta.status}`);
            }
            perdido.current = true;
            limpiarBorrador(claveLocal);
            // Navegación completa: el panel tiene que volver a leer los borradores.
            window.location.href = "/";
        } catch (error) {
            setConfirmandoEliminar(false);
            setNube({
                estado: "error",
                mensaje: `No se ha podido eliminar: ${error instanceof Error ? error.message : "error desconocido"}`,
            });
        }
    }

    const comunidadElegida = listaComunidades.find((c) => c.id === comunidadElegidaId);

    const coincidenciaExacta = useMemo(() => {
        const texto = normalizarNombre(nombreComunidad);
        if (!texto) return undefined;
        return listaComunidades.find((c) => normalizarNombre(c.nombreDireccion) === texto);
    }, [listaComunidades, nombreComunidad]);

    const seCrearaComunidad = nombreComunidad.trim() !== "" && !comunidadElegida && !coincidenciaExacta;

    /** Partidas de la propuesta por tipo de trabajo, para el contador de los botones. */
    const conteo = useMemo(() => {
        const cuenta: Record<string, number> = {};
        for (const l of propuesta?.lineas ?? []) cuenta[l.moduloKey] = (cuenta[l.moduloKey] ?? 0) + 1;
        return cuenta;
    }, [propuesta]);
    const alertas = useMemo(
        () => alertasActivas(subcuenta, modulosElegidos, seleccion),
        [subcuenta, modulosElegidos, seleccion]
    );

    /**
     * Aviso de amianto de la propuesta por IA (28/09/2026). El de `alertas` sale
     * del árbol de partidas, que el flujo con IA ya no rellena: sin esto no
     * saltaba nunca, ni tampoco el mínimo de 3 fotos.
     */
    const alertasPropuesta = useMemo(() => {
        const keys = new Set((propuesta?.lineas ?? []).filter(esPartidaAmianto).map((l) => l.moduloKey));
        return modulosElegidos
            .filter((k) => keys.has(k))
            .map((k) => ({
                ruta: `ia:${k}`,
                moduloKey: k,
                moduloLabel: modulos.find((m) => m.key === k)?.label ?? k,
                alerta: ALERTA_AMIANTO_PROPUESTA,
            }));
    }, [propuesta, modulosElegidos, modulos]);

    const todasLasAlertas = useMemo(() => [...alertas, ...alertasPropuesta], [alertas, alertasPropuesta]);

    const modulosConAlerta = useMemo(() => new Set(todasLasAlertas.map((a) => a.moduloKey)), [todasLasAlertas]);

    /** Minimo de fotos de un modulo: el del catalogo, o el de alerta si es mayor. */
    const minimoFotos = useCallback(
        (key: string) => {
            const delCatalogo = modulos.find((m) => m.key === key)?.fotosMinimas ?? 0;
            return modulosConAlerta.has(key) ? Math.max(delCatalogo, MINIMO_FOTOS_CON_ALERTA) : delCatalogo;
        },
        [modulos, modulosConAlerta]
    );

    /** Pestaña visible: la elegida si sigue en la lista; si no, la primera. */
    const activo =
        moduloActivo && modulosElegidos.includes(moduloActivo) ? moduloActivo : (modulosElegidos[0] ?? null);

    const modulosSinFotosSuficientes = useMemo(
        () => modulosElegidos.filter((key) => (fotosPorModulo[key]?.length ?? 0) < minimoFotos(key)),
        [modulosElegidos, fotosPorModulo, minimoFotos]
    );

    /** Estado de cada pestaña: lo que le falta se ve sin abrirla. */
    const estadoTrabajos: EstadoTrabajo[] = modulosElegidos.map((key) => {
        const label = modulos.find((m) => m.key === key)?.label ?? key;
        const fotos = fotosPorModulo[key]?.length ?? 0;
        const minimo = minimoFotos(key);
        const conDictado = (dictadoPorModulo[key] ?? "").trim() !== "";
        const detalle = !conDictado
            ? "Falta el dictado"
            : fotos < minimo
              ? `Faltan fotos (${fotos} de ${minimo})`
              : fotos === 0
                ? "Sin fotos"
                : `${fotos} ${fotos === 1 ? "foto" : "fotos"}`;
        return { key, label, completo: conDictado && fotos >= minimo, detalle };
    });

    /**
     * Quitar un tipo de trabajo borra su dictado, sus fotos y sus partidas
     * revisadas. Con algo dentro se pide confirmación (28/09/2026): un toque
     * accidental en obra se llevaba todo eso sin aviso.
     */
    function pedirAlternarModulo(modulo: ModuloTrabajo) {
        const elegido = modulosElegidos.includes(modulo.key);
        const tieneAlgo =
            (dictadoPorModulo[modulo.key] ?? "").trim() !== "" ||
            (fotosPorModulo[modulo.key]?.length ?? 0) > 0 ||
            (documentosPorModulo[modulo.key]?.length ?? 0) > 0 ||
            (propuesta?.lineas ?? []).some((l) => l.moduloKey === modulo.key);
        if (elegido && tieneAlgo) {
            setQuitandoModulo(modulo);
            return;
        }
        alternarModulo(modulo);
    }

    function alternarModulo(modulo: ModuloTrabajo) {
        setModulosElegidos((anterior) => {
            if (anterior.includes(modulo.key)) {
                // Al quitar un modulo se limpian sus partidas: si no, quedarian
                // huerfanas en el estado y viajarian al presupuesto sin que
                // nadie las vea en pantalla.
                setSeleccion((s) => limpiarModulo(s, modulo.key));
                setDictadoPorModulo((d) => {
                    const siguiente = { ...d };
                    delete siguiente[modulo.key];
                    return siguiente;
                });
                setPropuesta((p) => (p ? { ...p, lineas: p.lineas.filter((l) => l.moduloKey !== modulo.key) } : p));
                setFotosPorModulo((f) => {
                    const siguiente = { ...f };
                    delete siguiente[modulo.key];
                    return siguiente;
                });
                setDocumentosPorModulo((d) => {
                    const siguiente = { ...d };
                    delete siguiente[modulo.key];
                    return siguiente;
                });
                return anterior.filter((k) => k !== modulo.key);
            }
            return [...anterior, modulo.key];
        });
        // Al añadir un trabajo se abre su pestaña: es lo siguiente que va a
        // rellenar. Al quitarlo, `activo` cae solo en el primero que quede.
        if (!modulosElegidos.includes(modulo.key)) setModuloActivo(modulo.key);
    }

    function elegirComunidad(comunidad: ComunidadListado) {
        setComunidadElegidaId(comunidad.id);
        setNombreComunidad(comunidad.nombreDireccion);
        // Siempre el de la comunidad elegida, también vacío (28/09/2026): al
        // cambiar de finca se quedaba el administrador de la anterior.
        setAdministradorId(comunidad.administradorId ?? "");
        setEligiendoFinca(false);
    }

    /**
     * El modal puede devolver un registro RECIÉN CREADO o uno EXISTENTE: el
     * servidor reutiliza si el nombre normalizado ya estaba, y el aviso de
     * parecidos deja elegir uno de la lista. En los dos casos hay que
     * incorporarlo sin duplicar, de ahí el `some` por id.
     */
    function trasAltaAdministrador(administrador: AdministradorListado) {
        setListaAdministradores((anterior) =>
            anterior.some((a) => a.id === administrador.id) ? anterior : [...anterior, administrador]
        );
        setAdministradorId(administrador.id);
        setAlta(null);
    }

    function trasAltaComunidad(comunidad: ComunidadListado) {
        setListaComunidades((anterior) =>
            anterior.some((c) => c.id === comunidad.id) ? anterior : [...anterior, comunidad]
        );
        elegirComunidad(comunidad);
        setAlta(null);
    }

    function descartarBorrador() {
        limpiarBorrador(claveLocal);
        setNombreComunidad(inicial.nombreComunidad);
        setComunidadElegidaId(null);
        setAdministradorId("");
        setContacto(inicial.contacto);
        setTelefono(inicial.telefono);
        setFecha(inicial.fecha);
        setObservaciones("");
        setModulosElegidos([]);
        setSeleccion(seleccionVacia);
        setFotosPorModulo({});
        setDocumentosPorModulo({});
        setDictadoPorModulo({});
        setPropuesta(null);
        setImagenPortada(null);
        setRevisando(false);
        setQuitandoModulo(null);
        setBorradorRecuperado(null);
        setEligiendoFinca(!oportunidadOrigen);
    }

    // La transcripcion se ANADE a lo ya escrito, nunca lo sustituye: borrar
    // texto tecleado al pulsar un boton seria un fallo grave estando en obra.
    const faltanDatosGenerales =
        nombreComunidad.trim() === "" || contacto.trim() === "" || telefono.trim() === "" || fecha === "";

    const etiqueta = (k: string) => modulos.find((m) => m.key === k)?.label ?? k;
    const modulosSinDictado = modulosElegidos.filter((k) => !(dictadoPorModulo[k] ?? "").trim());

    /** Qué falta para pedir la propuesta a la IA. */
    const motivoNoPropuesta = !iaDisponible
        ? "La IA no está configurada (falta ANTHROPIC_API_KEY)"
        : faltanDatosGenerales
          ? "Completa comunidad, contacto, teléfono y fecha"
          : modulosElegidos.length === 0
            ? "Elige al menos un tipo de trabajo"
            : modulosSinDictado.length > 0
              ? `Dicta los trabajos de: ${modulosSinDictado.map(etiqueta).join(", ")}`
              : modulosSinFotosSuficientes.length > 0
                ? `Faltan fotos en: ${modulosSinFotosSuficientes.map(etiqueta).join(", ")}`
                : null;

    const lineasConProblemas = (propuesta?.lineas ?? []).filter((l) => problemasDeLinea(l).length > 0);
    const buscandoCype = (propuesta?.lineas ?? []).some((l) => l.pendienteCype);
    const conflictos = useMemo(() => conflictosDeCodigo(propuesta?.lineas ?? []), [propuesta]);
    /** Misma regla que el servidor: sin esto el comercial solo se enteraba al pulsar "Crear". */
    const sinLicencia = (propuesta?.lineas ?? []).filter((l) => !partidaPermitida(subcuenta, l));

    /** Qué falta para crear el presupuesto desde la revisión. */
    const motivoBloqueo = faltanDatosGenerales
        ? "Completa comunidad, contacto, teléfono y fecha"
        : !propuesta || propuesta.lineas.length === 0
          ? "No hay ninguna partida"
          : buscandoCype
            ? "Espera a que termine la búsqueda en CYPE"
            : lineasConProblemas.length > 0
              ? `Completa ${lineasConProblemas.length === 1 ? "1 partida" : `${lineasConProblemas.length} partidas`} (medición, precio o descripción)`
              : sinLicencia.length > 0
                ? `Quita «${sinLicencia[0].descripcionCorta || sinLicencia[0].codigo}»: ${MOTIVO_SIN_LICENCIA}`
                : conflictos.length > 0
                ? conflictos[0].mensaje
                : modulosSinFotosSuficientes.length > 0
                ? `Faltan fotos en: ${modulosSinFotosSuficientes.map(etiqueta).join(", ")}`
                : null;

    const puedeEnviar = motivoBloqueo === null && !enviando && generacion === null;

    /** Busca en CYPE las líneas indicadas, de `CYPE_EN_PARALELO` en `CYPE_EN_PARALELO`. */
    async function completarCype(pendientes: LineaPropuesta[]) {
        if (pendientes.length === 0) return;
        let hechas = 0;
        setGeneracion({ fase: "cype", hechas, total: pendientes.length });

        const actualizar = (id: string, cambio: Partial<LineaPropuesta>) =>
            setPropuesta((p) =>
                p ? { ...p, lineas: p.lineas.map((l) => (l.id === id ? { ...l, ...cambio } : l)) } : p
            );

        const cola = [...pendientes];
        const trabajador = async () => {
            for (let l = cola.shift(); l; l = cola.shift()) {
                try {
                    const respuesta = await fetch("/api/propuesta/cype", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ consulta: l.consulta, capitulo: l.capitulo }),
                    });
                    const cuerpo = await respuesta.json();
                    if (!respuesta.ok) throw new Error(cuerpo.error ?? `Error ${respuesta.status}`);

                    const r = cuerpo.resultado;
                    const avisoPrevio = l.aviso ? [l.aviso] : [];
                    if (r?.encontrado) {
                        actualizar(l.id, {
                            pendienteCype: false,
                            codigo: r.codigo,
                            origen: "cype",
                            descripcionCorta: r.descripcionCorta,
                            descripcionLarga: r.descripcionLarga,
                            unidad: r.unidad,
                            precioUnitario: r.precioVenta,
                            precioReferencia: r.precioVenta,
                            precioCype: r.precioCype,
                            capitulo: r.capitulo,
                            url: r.url,
                            aviso: [...avisoPrevio, r.aviso].filter(Boolean).join(" · ") || null,
                        });
                    } else {
                        actualizar(l.id, {
                            pendienteCype: false,
                            codigo: "",
                            aviso: [...avisoPrevio, `CYPE: ${r?.motivo ?? "no encontrado"}`].join(" · "),
                        });
                    }
                } catch (error) {
                    actualizar(l.id, {
                        pendienteCype: false,
                        codigo: "",
                        aviso: `No se ha podido consultar CYPE (${error instanceof Error ? error.message : "sin conexión"}).`,
                    });
                } finally {
                    hechas += 1;
                    setGeneracion({ fase: "cype", hechas, total: pendientes.length });
                }
            }
        };

        await Promise.all(Array.from({ length: Math.min(CYPE_EN_PARALELO, pendientes.length) }, trabajador));
        setGeneracion(null);
    }

    async function generarPropuestaIA() {
        if (motivoNoPropuesta || generacion) return;
        setConfirmandoRehacer(false);
        setErrorPropuesta(null);
        setGeneracion({ fase: "extrayendo" });

        try {
            const respuesta = await fetch("/api/propuesta/extraer", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    modulos: modulosElegidos.map((key) => ({
                        key,
                        dictado: dictadoPorModulo[key] ?? "",
                        fotos: fotosPorModulo[key] ?? [],
                    })),
                }),
            });
            const cuerpo = await respuesta.json();
            if (!respuesta.ok) throw new Error(cuerpo.error ?? `Error ${respuesta.status}`);

            const nueva = cuerpo.propuesta as Propuesta;
            setPropuesta(nueva);
            setRevisando(true);
            window.scrollTo({ top: 0 });
            setGeneracion(null);
            await completarCype(nueva.lineas.filter((l) => l.pendienteCype));
        } catch (error) {
            setGeneracion(null);
            setErrorPropuesta(error instanceof Error ? error.message : "No se ha podido generar la propuesta.");
        }
    }

    function reintentarCype(id: string) {
        const linea = propuesta?.lineas.find((l) => l.id === id);
        if (!linea?.consulta || generacion) return;
        const pendiente = { ...linea, pendienteCype: true, aviso: null };
        setPropuesta((p) => (p ? { ...p, lineas: p.lineas.map((l) => (l.id === id ? pendiente : l)) } : p));
        void completarCype([pendiente]);
    }

    async function enviar() {
        if (!puedeEnviar) return;

        setEnviando(true);
        setErrorEnvio(null);
        enviado.current = true;

        try {
            // La subcuenta, la empresa y el comercial NO se mandan: los resuelve
            // el servidor desde la sesion. Un formulario no decide en que
            // subcuenta escribe.
            const respuesta = await fetch("/api/registrar-presupuesto", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    oportunidadId: oportunidadOrigen?.id ?? null,
                    borradorId,
                    comunidadNombre: nombreComunidad.trim(),
                    administradorId: administradorId || null,
                    contacto: contacto.trim(),
                    telefono: telefono.trim(),
                    fechaVisita: fecha,
                    observaciones: observaciones.trim(),
                    modulosElegidos,
                    seleccion,
                    fotosPorModulo,
                    propuesta,
                    dictadoPorModulo,
                    imagenPortada,
                }),
            });

            const datos = await respuesta.json();
            if (!respuesta.ok) throw new Error(datos.error ?? `Error ${respuesta.status}`);

            // Solo se limpia el borrador con el alta CONFIRMADA. Si falla, el
            // comercial conserva la visita y puede reintentar sin recapturar.
            limpiarBorrador(claveLocal);

            // Flujo con IA: el presupuesto ya está revisado, así que se genera el
            // documento sin pasar por la ficha. La ficha sigue la generación.
            const oportunidadId = (datos as ResultadoAlta).oportunidades[0]?.id;
            if (propuesta && oportunidadId) {
                setGeneracion({ fase: "creando" });
                try {
                    const gen = await fetch("/api/documentos/generar", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ oportunidadId, version: 1 }),
                    });
                    if (gen.ok) {
                        window.location.href = `/oportunidades/${oportunidadId}`;
                        return;
                    }
                    const cuerpoGen = await gen.json().catch(() => ({}));
                    (datos as ResultadoAlta).avisos.push(
                        `El presupuesto está creado pero el documento no se ha podido generar: ${
                            cuerpoGen.error ?? `error ${gen.status}`
                        }. Ábrelo desde la oportunidad para reintentarlo.`
                    );
                } catch {
                    (datos as ResultadoAlta).avisos.push(
                        "El presupuesto está creado pero no se ha podido pedir el documento. Ábrelo desde la oportunidad."
                    );
                } finally {
                    setGeneracion(null);
                }
            }
            setResultado(datos as ResultadoAlta);
        } catch (error) {
            // No se ha creado: el borrador sigue vivo y se sigue guardando.
            enviado.current = false;
            setErrorEnvio(error instanceof Error ? error.message : "Error desconocido");
        } finally {
            setEnviando(false);
        }
    }

    if (resultado) {
        return (
            <div className="px-4 pb-24 pt-6 sm:px-10">
                <h1 className="mb-5 text-xl font-semibold text-ink sm:text-2xl">
                    {oportunidadOrigen ? "Datos de la visita guardados" : "Presupuesto registrado"}
                </h1>

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

                {oportunidadOrigen ? (
                    // La oportunidad ya está en "Datos recogidos": desde su
                    // ficha se genera el presupuesto. `<a>` y no `<Link>` por
                    // el mismo motivo que en OportunidadDetalle (modal @modal).
                    <a
                        href={`/oportunidades/${oportunidadOrigen.id}`}
                        className="mt-4 block w-full rounded-xl bg-ink py-3 text-center text-sm font-semibold text-canvas"
                    >
                        Ir a la oportunidad para generar el presupuesto
                    </a>
                ) : (
                    <>
                    {/* Flujo con IA sin documento (falló la generación): el aviso
                        dice "ábrelo desde la oportunidad", así que se da el enlace
                        (28/09/2026). */}
                    {propuesta && resultado.oportunidades[0] && (
                        <a
                            href={`/oportunidades/${resultado.oportunidades[0].id}`}
                            className="mt-4 block w-full rounded-xl bg-ink py-3 text-center text-sm font-semibold text-canvas"
                        >
                            Ir a la oportunidad
                        </a>
                    )}
                    <button
                        type="button"
                        // Recarga completa: la visita nueva no hereda el id del
                        // borrador que se acaba de enviar.
                        onClick={() => {
                            window.location.href = "/presupuestos/nuevo";
                        }}
                        className="mt-4 w-full cursor-pointer rounded-xl bg-ink py-3 text-sm font-semibold text-canvas"
                    >
                        Registrar otro presupuesto
                    </button>
                    </>
                )}
            </div>
        );
    }

    return (
        <div className="px-4 pb-24 pt-6 sm:px-10">
            {oportunidadOrigen ? (
                <div className="mb-5">
                    <h1 className="text-xl font-semibold text-ink sm:text-2xl">Datos de la visita</h1>
                    <p className="mt-1 text-xs text-muted">
                        {oportunidadOrigen.nombre} · al guardar pasa a Datos recogidos
                    </p>
                </div>
            ) : (
                <h1 className="mb-5 text-xl font-semibold text-ink sm:text-2xl">Nuevo presupuesto</h1>
            )}

            {eligiendoFinca ? (
                <PasoFinca
                    comunidades={listaComunidades}
                    administradores={listaAdministradores}
                    actual={nombreComunidad.trim() || null}
                    onElegir={elegirComunidad}
                    onCrearComunidad={(nombre) => {
                        setNombreAlta(nombre);
                        setAlta("comunidad");
                    }}
                    onCrearAdministrador={() => setAlta("administrador")}
                    onCancelar={() => setEligiendoFinca(false)}
                />
            ) : (
                <>
                {!eligiendoFinca && !almacenDisponible && (
                // Sin base de datos de borradores (variables de Upstash sin
                // cargar): antes no se avisaba y el borrador "no aparecía" en el
                // panel sin explicación.
                <p className="mb-3 px-1 text-xs text-amber-700 dark:text-amber-400">
                    Borradores no conectados: esta visita solo se guarda en este dispositivo y no
                    aparecerá en el panel.
                </p>
            )}

            {!eligiendoFinca && (borradorId || nube.estado === "error") && (
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                    <p
                        className={`text-xs ${
                            nube.estado === "error" ? "text-amber-700 dark:text-amber-400" : "text-muted"
                        }`}
                    >
                        {nube.estado === "guardando"
                            ? "Guardando borrador..."
                            : nube.estado === "guardado"
                              ? `Borrador guardado · ${describirAntiguedad(nube.en)}`
                              : nube.estado === "error"
                                ? nube.mensaje
                                : "Borrador sin guardar"}
                    </p>
                    {borradorId &&
                        (confirmandoEliminar ? (
                            <span className="flex shrink-0 gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setConfirmandoEliminar(false)}
                                    className="cursor-pointer rounded-lg border border-hairline px-2.5 py-1.5 text-xs text-ink"
                                >
                                    No
                                </button>
                                <button
                                    type="button"
                                    onClick={eliminarBorradorApp}
                                    className="cursor-pointer rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white"
                                >
                                    Sí, eliminar
                                </button>
                            </span>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setConfirmandoEliminar(true)}
                                className="shrink-0 cursor-pointer rounded-lg border border-hairline px-2.5 py-1.5 text-xs text-ink transition hover:bg-surface"
                            >
                                Eliminar borrador
                            </button>
                        ))}
                </div>
            )}

            {borradorRecuperado && !borradorId && (
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

                {revisando && propuesta ? (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                                    Revisa la propuesta
                                </p>
                                <p className="truncate text-sm text-ink">{nombreComunidad}</p>
                            </div>
                            <button
                                type="button"
                                disabled={generacion !== null || enviando}
                                onClick={() => setRevisando(false)}
                                className="shrink-0 cursor-pointer rounded-lg border border-hairline px-2.5 py-1.5 text-xs text-ink transition hover:bg-surface disabled:opacity-40"
                            >
                                Volver al dictado
                            </button>
                        </div>

                        {generacion?.fase === "cype" && (
                            <p className="rounded-xl border border-hairline bg-ink/[0.04] px-3 py-2 text-xs text-muted">
                                Buscando en CYPE las partidas que no están en la tarifa ({generacion.hechas}/
                                {generacion.total})…
                            </p>
                        )}

                        {alertasPropuesta.length > 0 && (
                            <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                                <p className={ESTILO_TITULO}>Requiere atención</p>
                                <ul className="flex flex-col gap-1.5">
                                    {alertasPropuesta.map((a) => (
                                        <li key={a.ruta} className="text-xs text-amber-700 dark:text-amber-400">
                                            <span className="font-medium">{a.moduloLabel}:</span> {a.alerta}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        <RevisionPropuesta
                            propuesta={propuesta}
                            modulos={modulosElegidos.map((k) => ({ key: k, label: etiqueta(k) }))}
                            catalogo={catalogo}
                            capitulos={capitulos}
                            onCambiar={setPropuesta}
                            onReintentarCype={reintentarCype}
                            conflictos={conflictos}
                            deshabilitado={enviando || generacion?.fase === "creando"}
                        />

                        {errorEnvio && (
                            <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
                                <p className="text-xs text-red-700 dark:text-red-400">{errorEnvio}</p>
                                <p className="mt-1 text-[11px] text-muted">
                                    La visita sigue guardada en el borrador: puedes reintentar sin recapturar nada.
                                </p>
                            </section>
                        )}
                    </div>
                ) : (
                <div className="flex flex-col gap-3">
                    <section className={ESTILO_SECCION}>
                        <p className={ESTILO_TITULO}>Datos generales</p>

                        <div className="flex flex-col gap-3">
                            {/* La comunidad ya no se teclea aquí: se elige o se crea en el
                                paso previo (PasoFinca). Aquí solo se ve y se puede cambiar. */}
                            <div className="flex items-start justify-between gap-3 rounded-xl border border-hairline bg-canvas px-3 py-2.5">
                                <div className="min-w-0">
                                    <span className="block text-xs text-muted">Comunidad</span>
                                    <span className="mt-0.5 block text-sm text-ink">{nombreComunidad}</span>
                                    <span className="mt-0.5 block text-[11px] text-muted">
                                        {seCrearaComunidad
                                            ? "No consta en el CRM: se creará al guardar"
                                            : "Comunidad del CRM"}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setEligiendoFinca(true)}
                                    className="shrink-0 cursor-pointer rounded-lg border border-hairline px-2 py-1 text-[11px] text-ink transition hover:border-ink/30"
                                >
                                    Cambiar
                                </button>
                            </div>

                            <div>
                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                    <span className="text-xs text-muted">Administrador</span>
                                    <button
                                        type="button"
                                        onClick={() => setAlta("administrador")}
                                        className="cursor-pointer rounded-lg border border-hairline px-2 py-1 text-[11px] text-ink transition hover:border-ink/30"
                                    >
                                        + Nuevo
                                    </button>
                                </div>
                                <select
                                    aria-label="Administrador"
                                    value={administradorId}
                                    onChange={(e) => setAdministradorId(e.target.value)}
                                    className={`${ESTILO_CAMPO} cursor-pointer`}
                                >
                                    <option value="">-- Sin administrador --</option>
                                    {listaAdministradores.map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.nombreDespacho ?? "(sin nombre)"}
                                        </option>
                                    ))}
                                </select>
                            </div>

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

                            {/* Observaciones a teclado.
                                La grabadora de voz (GrabadorVoz + Gemini) está
                                RETIRADA de la interfaz desde el 21/09/2026 por los
                                problemas de lentitud y de errores sin mensaje. El
                                componente y la ruta /api/transcribir-audio siguen en
                                el repo para poder volver a enchufarlos, pero hoy no
                                los usa nadie.

                                El dictado sigue estando disponible: es el del
                                teclado del móvil, que transcribe sobre el propio
                                campo mientras el comercial habla, sin subida de
                                audio ni espera. `rows` sube a 5 porque ahora todo se
                                escribe aquí. */}
                            <div>
                                <label>
                                    <span className={ESTILO_LABEL}>Observaciones</span>
                                    <textarea
                                        value={observaciones}
                                        onChange={(e) => setObservaciones(e.target.value)}
                                        rows={5}
                                        placeholder="Accesos, incidencias, lo que convenga recordar..."
                                        className={`${ESTILO_CAMPO} resize-none`}
                                        disabled={enviando}
                                    />
                                </label>
                                <p className="mt-1.5 text-xs text-muted">
                                    Puedes dictarlo con el micrófono del teclado del móvil.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Imagen de portada (29/09/2026): es la foto que ocupa la parte
                        de arriba de la infografía de portada del presupuesto. */}
                    <section className={ESTILO_SECCION}>
                        <p className={ESTILO_TITULO}>Imagen de portada</p>
                        <SubidorPortada
                            imagen={imagenPortada}
                            onImagenChange={setImagenPortada}
                            disabled={enviando}
                        />
                        <p className="mt-1.5 text-xs text-muted">
                            Sale a sangre arriba de la portada del presupuesto. Mejor una foto apaisada de la
                            fachada o de la zona de la obra.
                        </p>
                    </section>

                    <section className={ESTILO_SECCION}>
                        <p className={ESTILO_TITULO}>Tipo de trabajo</p>

                        {/* Tocar un trabajo sin elegir lo añade y abre su pestaña.
                            Tocar uno ya elegido lo abre (antes lo quitaba: un toque
                            de más en obra se llevaba el dictado y las fotos). Para
                            quitarlo está la ✕, que sigue pidiendo confirmación. */}
                        <div className="flex flex-wrap gap-2">
                            {modulos.map((modulo) => {
                                const elegido = modulosElegidos.includes(modulo.key);
                                const n = conteo[modulo.key] ?? 0;
                                if (!elegido) {
                                    return (
                                        <button
                                            key={modulo.key}
                                            type="button"
                                            onClick={() => alternarModulo(modulo)}
                                            aria-pressed={false}
                                            className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-hairline px-3 py-2 text-sm text-ink transition hover:border-ink/20"
                                        >
                                            <span className="text-muted">+</span>
                                            {modulo.label}
                                        </button>
                                    );
                                }
                                return (
                                    <span
                                        key={modulo.key}
                                        className={`flex min-h-11 items-center rounded-xl border text-sm transition ${
                                            modulo.key === activo
                                                ? "border-ink/40 bg-ink/[0.08]"
                                                : "border-ink/25 bg-ink/[0.04]"
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => setModuloActivo(modulo.key)}
                                            aria-label={`Abrir ${modulo.label}`}
                                            className="flex cursor-pointer items-center gap-2 py-2 pl-3 pr-1 font-medium text-ink"
                                        >
                                            <span aria-hidden="true">✓</span>
                                            {modulo.label}
                                            {n > 0 && (
                                                <span className="rounded-full border border-hairline px-1.5 text-[11px] font-normal text-muted">
                                                    {n}
                                                </span>
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => pedirAlternarModulo(modulo)}
                                            aria-label={`Quitar ${modulo.label}`}
                                            className="flex h-11 w-9 cursor-pointer items-center justify-center rounded-r-xl text-muted transition hover:text-ink"
                                        >
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
                                                <path d="M18 6 6 18M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </span>
                                );
                            })}
                        </div>

                        {quitandoModulo && (
                            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                                <p className="text-xs text-amber-700 dark:text-amber-400">
                                    Si quitas «{quitandoModulo.label}» se borran su dictado, sus fotos y sus partidas de
                                    la propuesta.
                                </p>
                                <div className="mt-2 flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setQuitandoModulo(null)}
                                        className="cursor-pointer rounded-lg border border-hairline px-2.5 py-1.5 text-xs text-ink"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            // Solo quita: si entretanto ya no está elegido
                                            // (p. ej. "Empezar de cero"), no se vuelve a añadir.
                                            if (modulosElegidos.includes(quitandoModulo.key)) {
                                                alternarModulo(quitandoModulo);
                                            }
                                            setQuitandoModulo(null);
                                        }}
                                        className="cursor-pointer rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white"
                                    >
                                        Sí, quitar
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>

                    {activo && (
                        <section className={ESTILO_SECCION}>
                            <p className={ESTILO_TITULO}>Trabajos seleccionados ({modulosElegidos.length})</p>
                            <PestanasTrabajos trabajos={estadoTrabajos} activo={activo} onCambiar={setModuloActivo}>
                                {/* Se montan todos y solo se enseña el activo: cambiar de
                                    pestaña a mitad de una subida de fotos no la corta ni
                                    pierde el indicador de progreso. */}
                                {modulosElegidos.map((key) => {
                                    const modulo = modulos.find((m) => m.key === key);
                                    if (!modulo) return null;
                                    return (
                                        <div key={key} hidden={key !== activo}>
                                            <p className="mb-3 text-base font-semibold text-ink">{modulo.label}</p>

                                            {/* Dictado de trabajos y medidas (27/09/2026). Sustituye al
                                                árbol de partidas: la IA saca las partidas del texto y el
                                                comercial las revisa después. El micrófono es el del
                                                teclado del móvil. */}
                                            <label className="block">
                                                <span className={ESTILO_LABEL}>Trabajos y medidas</span>
                                                <textarea
                                                    value={dictadoPorModulo[key] ?? ""}
                                                    onChange={(e) =>
                                                        setDictadoPorModulo((anterior) => ({ ...anterior, [key]: e.target.value }))
                                                    }
                                                    rows={5}
                                                    disabled={enviando || generacion !== null}
                                                    placeholder="Ej.: picar y reparar frentes de forjado, unos 40 metros lineales. La fachada tiene 400 m² y hay que pintar toda con pintura pétrea…"
                                                    className={`${ESTILO_CAMPO} resize-y`}
                                                />
                                            </label>
                                            <p className="mt-1.5 text-xs text-muted">
                                                Díctalo con el micrófono del teclado: qué hay que hacer, en qué elemento y cuánto
                                                mide (o la medida total y el % a reparar). La IA también mira las fotos de este
                                                apartado, que salen en el documento bajo «{modulo.label}».
                                            </p>

                                            {modulo.captura === "importacion" && (
                                                <div className="mt-4 border-t border-hairline pt-4">
                                                <SubidorDocumentos
                                                    documentos={documentosPorModulo[key] ?? []}
                                                    onDocumentosChange={(docs) =>
                                                        setDocumentosPorModulo((anterior) => ({ ...anterior, [key]: docs }))
                                                    }
                                                    disabled={enviando}
                                                />
                                                </div>
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
                                        </div>
                                    );
                                })}
                            </PestanasTrabajos>
                        </section>
                    )}

                    {todasLasAlertas.length > 0 && (
                        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                            <p className={ESTILO_TITULO}>Requiere atención</p>
                            <ul className="flex flex-col gap-1.5">
                                {todasLasAlertas.map((a) => (
                                    <li key={a.ruta} className="text-xs text-amber-700 dark:text-amber-400">
                                        <span className="font-medium">{a.moduloLabel}:</span> {a.alerta}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {errorPropuesta && (
                        <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
                            <p className="text-xs text-red-700 dark:text-red-400">{errorPropuesta}</p>
                            <p className="mt-1 text-[11px] text-muted">El dictado sigue guardado: puedes volver a intentarlo.</p>
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
                )}

                <div className="sticky bottom-24 z-30 mt-4 rounded-2xl border border-hairline bg-canvas/95 p-3 backdrop-blur-md">
                    {revisando && propuesta ? (
                        <>
                            {motivoBloqueo && <p className="mb-2 text-center text-xs text-muted">{motivoBloqueo}</p>}
                            <button
                                type="button"
                                onClick={enviar}
                                disabled={!puedeEnviar}
                                className={`w-full rounded-xl bg-ink py-3 text-sm font-semibold text-canvas transition ${
                                    puedeEnviar ? "cursor-pointer" : "cursor-not-allowed opacity-40"
                                }`}
                            >
                                {generacion?.fase === "creando"
                                    ? "Generando el documento..."
                                    : enviando
                                      ? "Creando el presupuesto..."
                                      : "Crear presupuesto"}
                            </button>
                        </>
                    ) : (
                        <>
                            {(motivoNoPropuesta || generacion) && (
                                <p className="mb-2 text-center text-xs text-muted">
                                    {generacion?.fase === "extrayendo"
                                        ? modulosElegidos.some((k) => (fotosPorModulo[k]?.length ?? 0) > 0)
                                            ? "Analizando el dictado y las fotos. Puede tardar hasta un minuto…"
                                            : "Analizando el dictado. Tarda unos segundos…"
                                        : motivoNoPropuesta}
                                </p>
                            )}
                            {propuesta && !confirmandoRehacer ? (
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setRevisando(true)}
                                        className="flex-1 cursor-pointer rounded-xl bg-ink py-3 text-sm font-semibold text-canvas"
                                    >
                                        Ver propuesta ({propuesta.lineas.length})
                                    </button>
                                    <button
                                        type="button"
                                        disabled={Boolean(motivoNoPropuesta) || generacion !== null}
                                        onClick={() => setConfirmandoRehacer(true)}
                                        className="shrink-0 cursor-pointer rounded-xl border border-hairline px-3 py-3 text-sm text-ink disabled:opacity-40"
                                    >
                                        Rehacer con IA
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {confirmandoRehacer && (
                                        <p className="mb-2 text-center text-xs text-amber-700 dark:text-amber-400">
                                            Se sustituirán las partidas y los cambios que hayas hecho en la revisión.
                                        </p>
                                    )}
                                    <div className="flex gap-2">
                                        {confirmandoRehacer && (
                                            <button
                                                type="button"
                                                onClick={() => setConfirmandoRehacer(false)}
                                                className="shrink-0 cursor-pointer rounded-xl border border-hairline px-4 py-3 text-sm text-ink"
                                            >
                                                Cancelar
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={generarPropuestaIA}
                                            disabled={Boolean(motivoNoPropuesta) || generacion !== null}
                                            className={`flex-1 rounded-xl bg-ink py-3 text-sm font-semibold text-canvas transition ${
                                                motivoNoPropuesta || generacion ? "cursor-not-allowed opacity-40" : "cursor-pointer"
                                            }`}
                                        >
                                            {generacion?.fase === "extrayendo"
                                                ? "Generando propuesta..."
                                                : confirmandoRehacer
                                                  ? "Sí, rehacer la propuesta"
                                                  : "Generar propuesta con IA"}
                                        </button>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>
                </>
            )}

            {alta === "administrador" && (
                <AltaAdministrador
                    existentes={listaAdministradores}
                    puedeEditarComision={rol === "direccion"}
                    onCerrar={() => setAlta(null)}
                    onCreado={trasAltaAdministrador}
                />
            )}

            {alta === "comunidad" && (
                <AltaComunidad
                    // Lo que ya haya escrito en el campo se arrastra al modal:
                    // volver a teclear la dirección en obra es tiempo perdido.
                    nombreInicial={eligiendoFinca ? nombreAlta : nombreComunidad}
                    existentes={listaComunidades}
                    administradores={listaAdministradores}
                    administradorIdInicial={administradorId}
                    onCerrar={() => setAlta(null)}
                    onCreada={trasAltaComunidad}
                />
            )}
        </div>
    );
}