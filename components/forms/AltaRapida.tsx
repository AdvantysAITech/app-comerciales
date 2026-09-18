"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizarNombre } from "@/lib/texto";

/**
 * Alta rápida de administradores y comunidades desde el formulario.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ EXISTE (18/09/2026)
 * ---------------------------------------------------------------------------
 * Hasta ahora el comercial solo podía ELEGIR administrador de un desplegable.
 * Si el despacho no estaba dado de alta en GHL, no tenía salida: o dejaba
 * "Sin administrador" (y la oportunidad colgaba del contacto de la visita,
 * rompiendo la cadena de seguimiento del DERCAS §5.2) o abandonaba. Le pasó a
 * Toni en Vertical el 18/09.
 *
 * La comunidad sí se creaba, pero solo con el nombre: sin localidad ni
 * provincia, que se imprimen en el presupuesto y en la línea de firma.
 *
 * ---------------------------------------------------------------------------
 * ANTIDUPLICADOS
 * ---------------------------------------------------------------------------
 * En cuanto se puede crear, aparecen "Administración Álvarez Casado",
 * "Alvarez Casado" y "Adm. Álvarez Casado" como tres registros, y las
 * comisiones del administrador (DERCAS §7.2) dejan de cuadrar.
 *
 * Hay dos redes distintas y las dos hacen falta:
 *   1. Aquí, en el cliente: se avisa de los parecidos MIENTRAS escribe y se le
 *      ofrece usar el existente. Es el que evita el duplicado de verdad, porque
 *      lo ve una persona que sabe si es el mismo despacho o no.
 *   2. En el servidor: `obtenerOCrearAdministrador` reutiliza si el nombre
 *      normalizado coincide exacto. No sustituye a la de arriba, cubre el caso
 *      de dos altas simultáneas.
 */

const ESTILO_CAMPO =
    "w-full rounded-xl border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-ink/30 focus:outline-none";
const ESTILO_LABEL = "mb-1.5 block text-xs text-muted";

export type AdministradorListado = { id: string; nombreDespacho?: string };
export type ComunidadListado = { id: string; nombreDireccion: string; administradorId?: string };

/**
 * Carcasa del diálogo.
 *
 * El scroll lo lleva la capa de fondo y no el panel, igual que en
 * `components/Modal.tsx`: con el panel centrado sobre un fondo sin
 * desbordamiento, un formulario más alto que la pantalla se sale por arriba y
 * por abajo a la vez y el botón de guardar queda inalcanzable en móvil.
 */
function Dialogo({
    titulo,
    onCerrar,
    children,
}: {
    titulo: string;
    onCerrar: () => void;
    children: React.ReactNode;
}) {
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") onCerrar();
        }
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [onCerrar]);

    useEffect(() => {
        const previo = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previo;
        };
    }, []);

    return (
        <div
            className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/50 backdrop-blur-sm"
            onClick={onCerrar}
        >
            <div className="flex min-h-full items-center justify-center p-4">
                <div
                    className="w-full max-w-lg rounded-3xl border border-hairline bg-surface p-6 shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="mb-4 flex items-start justify-between gap-4">
                        <h2 className="text-sm font-medium text-ink">{titulo}</h2>
                        <button
                            type="button"
                            onClick={onCerrar}
                            aria-label="Cerrar"
                            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition hover:bg-accent/10 hover:text-ink"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
                                <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    {children}
                </div>
            </div>
        </div>
    );
}

/** Aviso de posibles duplicados, con atajo para usar el registro existente. */
function Parecidos<T>({
    titulo,
    elementos,
    etiqueta,
    onElegir,
}: {
    titulo: string;
    elementos: T[];
    etiqueta: (elemento: T) => string;
    onElegir: (elemento: T) => void;
}) {
    if (elementos.length === 0) return null;

    return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">{titulo}</p>
            <div className="flex flex-col gap-1">
                {elementos.map((elemento, i) => (
                    <button
                        key={i}
                        type="button"
                        onClick={() => onElegir(elemento)}
                        className="cursor-pointer rounded-lg border border-hairline bg-canvas px-3 py-2 text-left text-sm text-ink transition hover:border-ink/30"
                    >
                        {etiqueta(elemento)}
                    </button>
                ))}
            </div>
        </div>
    );
}

/** Botonera común: cancelar y guardar, con estado de envío. */
function Acciones({
    onCerrar,
    onGuardar,
    guardando,
    bloqueado,
    textoGuardar,
}: {
    onCerrar: () => void;
    onGuardar: () => void;
    guardando: boolean;
    bloqueado: boolean;
    textoGuardar: string;
}) {
    return (
        <div className="flex gap-2 pt-1">
            <button
                type="button"
                onClick={onCerrar}
                disabled={guardando}
                className="min-h-11 flex-1 cursor-pointer rounded-xl border border-hairline px-3 py-2 text-sm text-ink transition hover:border-ink/20 disabled:opacity-50"
            >
                Cancelar
            </button>
            <button
                type="button"
                onClick={onGuardar}
                disabled={guardando || bloqueado}
                className="min-h-11 flex-1 cursor-pointer rounded-xl bg-ink px-3 py-2 text-sm text-canvas transition disabled:cursor-not-allowed disabled:opacity-50"
            >
                {guardando ? "Guardando..." : textoGuardar}
            </button>
        </div>
    );
}

/** Coincidencias por inclusión sobre el nombre normalizado. */
function parecidosPorNombre<T>(elementos: T[], nombre: (e: T) => string | undefined, escrito: string, maximo = 3): T[] {
    const objetivo = normalizarNombre(escrito);
    if (objetivo.length < 3) return [];

    return elementos
        .filter((e) => {
            const valor = nombre(e);
            if (!valor) return false;
            const candidato = normalizarNombre(valor);
            return candidato.includes(objetivo) || objetivo.includes(candidato);
        })
        .slice(0, maximo);
}

async function enviar<T>(url: string, cuerpo: unknown): Promise<T> {
    const respuesta = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
        throw new Error(datos?.error ?? "No se ha podido guardar");
    }

    return datos as T;
}

// ---------------------------------------------------------------------------
// Administrador
// ---------------------------------------------------------------------------

export function AltaAdministrador({
    nombreInicial = "",
    existentes,
    puedeEditarComision,
    onCerrar,
    onCreado,
}: {
    nombreInicial?: string;
    existentes: AdministradorListado[];
    /**
     * La comisión pactada es dato interno de dirección (DERCAS §3.3). El campo
     * solo se pinta para el perfil `direccion`; la ruta lo descarta igual si
     * llega desde un perfil comercial.
     */
    puedeEditarComision: boolean;
    onCerrar: () => void;
    onCreado: (administrador: AdministradorListado, creado: boolean) => void;
}) {
    const [nombreDespacho, setNombreDespacho] = useState(nombreInicial);
    const [contactoPrincipal, setContactoPrincipal] = useState("");
    const [telefono, setTelefono] = useState("");
    const [email, setEmail] = useState("");
    const [localidad, setLocalidad] = useState("");
    const [provincia, setProvincia] = useState("");
    const [comision, setComision] = useState("");

    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const parecidos = useMemo(
        () => parecidosPorNombre(existentes, (a) => a.nombreDespacho, nombreDespacho),
        [existentes, nombreDespacho]
    );

    const guardar = useCallback(async () => {
        setGuardando(true);
        setError(null);

        try {
            const cuerpo: Record<string, unknown> = { nombreDespacho, contactoPrincipal, telefono, email, localidad, provincia };

            if (puedeEditarComision && comision.trim() !== "") {
                const valor = Number(comision.replace(",", "."));
                if (!Number.isFinite(valor)) throw new Error("La comisión debe ser un número");
                cuerpo.comisionPactada = valor;
            }

            const datos = await enviar<{ administrador: AdministradorListado; creado: boolean }>(
                "/api/administradores",
                cuerpo
            );

            onCreado(datos.administrador, datos.creado);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error desconocido al guardar");
        } finally {
            setGuardando(false);
        }
    }, [nombreDespacho, contactoPrincipal, telefono, email, localidad, provincia, comision, puedeEditarComision, onCreado]);

    return (
        <Dialogo titulo="Nuevo administrador de fincas" onCerrar={onCerrar}>
            <div className="flex flex-col gap-3">
                <label>
                    <span className={ESTILO_LABEL}>Nombre del despacho *</span>
                    <input
                        type="text"
                        value={nombreDespacho}
                        onChange={(e) => setNombreDespacho(e.target.value)}
                        placeholder="Administración Álvarez Casado"
                        className={ESTILO_CAMPO}
                        autoFocus
                    />
                </label>

                <Parecidos
                    titulo="Ya existe alguno parecido. Si es el mismo, úsalo en vez de crear otro:"
                    elementos={parecidos}
                    etiqueta={(a) => a.nombreDespacho ?? "(sin nombre)"}
                    onElegir={(a) => onCreado(a, false)}
                />

                <label>
                    <span className={ESTILO_LABEL}>Persona de contacto</span>
                    <input
                        type="text"
                        value={contactoPrincipal}
                        onChange={(e) => setContactoPrincipal(e.target.value)}
                        placeholder="Nuria Sanchis"
                        className={ESTILO_CAMPO}
                    />
                </label>

                <div className="grid grid-cols-2 gap-3">
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

                    <label>
                        <span className={ESTILO_LABEL}>Email</span>
                        <input
                            type="email"
                            inputMode="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="despacho@ejemplo.com"
                            className={ESTILO_CAMPO}
                        />
                    </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <label>
                        <span className={ESTILO_LABEL}>Localidad</span>
                        <input
                            type="text"
                            value={localidad}
                            onChange={(e) => setLocalidad(e.target.value)}
                            placeholder="Valencia"
                            className={ESTILO_CAMPO}
                        />
                    </label>

                    <label>
                        <span className={ESTILO_LABEL}>Provincia</span>
                        <input
                            type="text"
                            value={provincia}
                            onChange={(e) => setProvincia(e.target.value)}
                            placeholder="Valencia"
                            className={ESTILO_CAMPO}
                        />
                    </label>
                </div>

                {puedeEditarComision && (
                    <label>
                        <span className={ESTILO_LABEL}>Comisión pactada (%)</span>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={comision}
                            onChange={(e) => setComision(e.target.value)}
                            placeholder="0"
                            className={ESTILO_CAMPO}
                        />
                    </label>
                )}

                {error && (
                    <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                        {error}
                    </p>
                )}

                <Acciones
                    onCerrar={onCerrar}
                    onGuardar={guardar}
                    guardando={guardando}
                    bloqueado={nombreDespacho.trim() === ""}
                    textoGuardar="Crear administrador"
                />
            </div>
        </Dialogo>
    );
}

// ---------------------------------------------------------------------------
// Comunidad
// ---------------------------------------------------------------------------

export function AltaComunidad({
    nombreInicial = "",
    existentes,
    administradores,
    administradorIdInicial = "",
    onCerrar,
    onCreada,
}: {
    nombreInicial?: string;
    existentes: ComunidadListado[];
    administradores: AdministradorListado[];
    administradorIdInicial?: string;
    onCerrar: () => void;
    onCreada: (comunidad: ComunidadListado, creada: boolean) => void;
}) {
    const [nombreDireccion, setNombreDireccion] = useState(nombreInicial);
    const [localidad, setLocalidad] = useState("");
    const [provincia, setProvincia] = useState("");
    const [numeroViviendas, setNumeroViviendas] = useState("");
    const [notasAcceso, setNotasAcceso] = useState("");
    const [administradorId, setAdministradorId] = useState(administradorIdInicial);

    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const parecidas = useMemo(
        () => parecidosPorNombre(existentes, (c) => c.nombreDireccion, nombreDireccion),
        [existentes, nombreDireccion]
    );

    const guardar = useCallback(async () => {
        setGuardando(true);
        setError(null);

        try {
            const datos = await enviar<{ comunidad: ComunidadListado; creada: boolean }>("/api/comunidades", {
                nombreDireccion,
                localidad,
                provincia,
                notasAcceso,
                numeroViviendas,
                administradorId,
            });

            onCreada(datos.comunidad, datos.creada);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error desconocido al guardar");
        } finally {
            setGuardando(false);
        }
    }, [nombreDireccion, localidad, provincia, notasAcceso, numeroViviendas, administradorId, onCreada]);

    return (
        <Dialogo titulo="Nueva comunidad de propietarios" onCerrar={onCerrar}>
            <div className="flex flex-col gap-3">
                <label>
                    <span className={ESTILO_LABEL}>Nombre / Dirección *</span>
                    <input
                        type="text"
                        value={nombreDireccion}
                        onChange={(e) => setNombreDireccion(e.target.value)}
                        placeholder="C/ Islas Canarias, 180"
                        className={ESTILO_CAMPO}
                        autoFocus
                    />
                </label>

                <Parecidos
                    titulo="Ya existe alguna parecida. Si es la misma, úsala en vez de crear otra:"
                    elementos={parecidas}
                    etiqueta={(c) => c.nombreDireccion}
                    onElegir={(c) => onCreada(c, false)}
                />

                <div className="grid grid-cols-2 gap-3">
                    <label>
                        {/* Localidad y provincia NO son opcionales de verdad: se
                            imprimen en el presupuesto y la localidad es la de la
                            línea de firma. Si van vacías, el documento sale con
                            huecos. */}
                        <span className={ESTILO_LABEL}>Localidad</span>
                        <input
                            type="text"
                            value={localidad}
                            onChange={(e) => setLocalidad(e.target.value)}
                            placeholder="Náquera"
                            className={ESTILO_CAMPO}
                        />
                    </label>

                    <label>
                        <span className={ESTILO_LABEL}>Provincia</span>
                        <input
                            type="text"
                            value={provincia}
                            onChange={(e) => setProvincia(e.target.value)}
                            placeholder="Valencia"
                            className={ESTILO_CAMPO}
                        />
                    </label>
                </div>

                <label>
                    <span className={ESTILO_LABEL}>Administrador asignado</span>
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

                <label>
                    <span className={ESTILO_LABEL}>Número de viviendas</span>
                    <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={numeroViviendas}
                        onChange={(e) => setNumeroViviendas(e.target.value)}
                        placeholder="24"
                        className={ESTILO_CAMPO}
                    />
                </label>

                <label>
                    <span className={ESTILO_LABEL}>Notas de acceso</span>
                    <textarea
                        value={notasAcceso}
                        onChange={(e) => setNotasAcceso(e.target.value)}
                        rows={2}
                        placeholder="Portal, clave, a quién llamar para entrar..."
                        className={`${ESTILO_CAMPO} resize-none`}
                    />
                </label>

                {error && (
                    <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                        {error}
                    </p>
                )}

                <Acciones
                    onCerrar={onCerrar}
                    onGuardar={guardar}
                    guardando={guardando}
                    bloqueado={nombreDireccion.trim() === ""}
                    textoGuardar="Crear comunidad"
                />
            </div>
        </Dialogo>
    );
}