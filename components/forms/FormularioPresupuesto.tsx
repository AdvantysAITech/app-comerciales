"use client";

import { useState } from "react";
import { CAMPOS_POR_MODELO } from "@/lib/forms/camposModeloNegocio";

type ModeloNegocio =
    | "rehabilitacion_impermeabilizacion"
    | "descuelgues_verticales"
    | "retirada_amianto"
    | "reformas_zonas_comunes";

type Props = {
    subcuenta: "scala-valencia" | "vertical-projects";
    comunidades: Array<{ id: string; nombreDireccion: string; administradorId?: string }>;
    administradores: Array<{ id: string; nombreDespacho?: string }>;
};

const ESTILO_CAMPO =
    "w-full rounded-xl border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-ink/30 focus:outline-none";
const ESTILO_LABEL = "mb-1.5 block text-xs text-muted";

export function FormularioPresupuesto({ subcuenta, comunidades, administradores }: Props) {
    const [modeloNegocio, setModeloNegocio] = useState<ModeloNegocio | "">("");
    const [valoresCampos, setValoresCampos] = useState<Record<string, string>>({});
    const [comunidadId, setComunidadId] = useState("");
    const [fecha, setFecha] = useState("");
    const [contactoVisita, setContactoVisita] = useState("");
    const [descripcion, setDescripcion] = useState("");
    const [fotos, setFotos] = useState<string[]>([]);
    const [subiendoFoto, setSubiendoFoto] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [resultadoEnvio, setResultadoEnvio] = useState<string | null>(null);
    const [candidatas, setCandidatas] = useState
        <Array<{ id: string; name: string; createdAt: string; modeloNegocio: string | null }> | null
      >(null);

    async function handleEnviar(oportunidadIdElegida?: string) {
      if (!formularioValido || !comunidadSeleccionada) return;

      setEnviando(true);
      setResultadoEnvio(null);

      try{
        const response = await fetch("/api/registrar-visita", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            comunidadNombre: comunidadSeleccionada.nombreDireccion,
            administrador: administradorAsociado,
            modeloNegocio,
            fecha,
            contactoVisita,
            descripcion,
            camposEspecificos: valoresCampos,
            fotos,
            oportunidadId: oportunidadIdElegida,
          }),
        });

        const data = await response.json();

        if(!response.ok){
          throw new Error(data.error ?? "Error al crear la oportunidad");
        }

        if (data.estado === "elegir") {
          setCandidatas(data.candidatas);
          return;
        }

        setCandidatas(null);
        setResultadoEnvio(`Visita registrada correctamente (oportunidad: ${data.id})`);
      } catch (error) {
        setResultadoEnvio(
          error instanceof Error ? `Error: ${error.message}` : "Error desconocido"
        );
      } finally {
        setEnviando(false);
      }
    }

    async function handleFotosSeleccionadas(archivos: FileList | null) {
      if (!archivos) return;

      setSubiendoFoto(true);

      try {
        for (const archivo of Array.from(archivos)) {
          const formData = new FormData();
          formData.append("foto", archivo);

          const response = await fetch("/api/subir-foto", {
            method: "POST",
            body: formData,
          });

          const data = await response.json();

          if (!response.ok){
            throw new Error(data.error ?? "Fallo al subir una de las fotos");
          }

          setFotos((anterior) => [...anterior, data.url]);
        }
      } catch (error) {
        console.error(error);
        alert("Hubo un problema subiendo alguna foto. Revisa e inténtalo de nuevo.");
      } finally {
        setSubiendoFoto(false);
      }
    }

    function quitarFoto(url: string) {
        setFotos((anterior) => anterior.filter((f) => f !== url));
    }

    const esScala = subcuenta === "scala-valencia";

    function handleCampoChange(key: string, valor: string) {
        setValoresCampos((anterior) => ({ ...anterior, [key]: valor }));
    }

    const camposActuales = modeloNegocio ? CAMPOS_POR_MODELO[modeloNegocio] : [];
    const comunidadSeleccionada = comunidades.find((c) => c.id === comunidadId);
    const administradorAsociado = administradores.find(
      (a) => a.id === comunidadSeleccionada?.administradorId
    );

    const fotosMinimasAmianto = modeloNegocio === "retirada_amianto" ? 3 : 0;

    const formularioValido =
    comunidadId !== "" &&
    modeloNegocio !== "" &&
    fecha !== "" &&
    fotos.length >= fotosMinimasAmianto;

    const motivoBloqueo = comunidadId === ""
        ? "Selecciona una comunidad"
        : modeloNegocio === ""
        ? "Selecciona un modelo de negocio"
        : fecha === ""
        ? "Indica la fecha de la visita"
        : fotos.length < fotosMinimasAmianto
        ? `Faltan ${fotosMinimasAmianto - fotos.length} foto(s) más para poder enviar`
        : null;

    return (
      // pb-24: hueco extra para que la barra de envío pegajosa no quede tapada por el navbar flotante
      <div className="px-4 pb-24 pt-6 sm:px-10">
        <h1 className="mb-5 text-xl font-semibold text-ink sm:text-2xl">Nuevo presupuesto</h1>

        <div className="flex flex-col gap-3">
          <section className="rounded-2xl border border-hairline bg-surface p-4">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted">
              Comunidad y visita
            </p>

            <div className="flex flex-col gap-3">
              <label>
                <span className={ESTILO_LABEL}>Comunidad</span>
                <select
                  value={comunidadId}
                  onChange={(e) => setComunidadId(e.target.value)}
                  className={`${ESTILO_CAMPO} cursor-pointer`}
                >
                  <option value="">-- Selecciona una comunidad --</option>
                  {comunidades.map((comunidad) => (
                    <option key={comunidad.id} value={comunidad.id}>
                      {comunidad.nombreDireccion}
                    </option>
                  ))}
                </select>
              </label>

              <p className="text-xs text-muted">
                Administrador:{" "}
                <span className="font-medium text-ink">
                  {administradorAsociado
                    ? administradorAsociado.nombreDespacho
                    : comunidadId
                      ? "Sin administrador asociado"
                      : "(elige una comunidad primero)"}
                </span>
              </p>

              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className={ESTILO_LABEL}>Contacto en sitio</span>
                  <input
                    type="text"
                    value={contactoVisita}
                    onChange={(e) => setContactoVisita(e.target.value)}
                    placeholder="Nombre"
                    className={ESTILO_CAMPO}
                  />
                </label>

                <label>
                  <span className={ESTILO_LABEL}>Fecha de la visita</span>
                  <input
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className={`${ESTILO_CAMPO} cursor-pointer`}
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-hairline bg-surface p-4">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted">
              Modelo de negocio
            </p>

            <label>
              <span className={ESTILO_LABEL}>Tipo de trabajo</span>
              <select
                value={modeloNegocio}
                onChange={(e) => {
                  setModeloNegocio(e.target.value as ModeloNegocio);
                  setValoresCampos({});
                }}
                className={`${ESTILO_CAMPO} cursor-pointer`}
              >
                <option value="">-- Selecciona --</option>
                <option value="rehabilitacion_impermeabilizacion">Rehabilitación e impermeabilización</option>
                {esScala && <option value="retirada_amianto">Retirada de amianto</option>}
                <option value="descuelgues_verticales">Descuelgues verticales</option>
                <option value="reformas_zonas_comunes">Reformas y zonas comunes</option>
              </select>
            </label>

            {camposActuales.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {camposActuales.map((campo) => (
                  <label key={campo.key} className={campo.tipo === "texto" ? "col-span-2" : ""}>
                    <span className={ESTILO_LABEL}>{campo.label}</span>
                    {campo.tipo === "select" ? (
                      <select
                        value={valoresCampos[campo.key] ?? ""}
                        onChange={(e) => handleCampoChange(campo.key, e.target.value)}
                        className={`${ESTILO_CAMPO} cursor-pointer`}
                      >
                        <option value="">-- Selecciona --</option>
                        {campo.opciones?.map((opcion) => (
                          <option key={opcion} value={opcion}>
                            {opcion}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={campo.tipo === "numero" ? "number" : "text"}
                        value={valoresCampos[campo.key] ?? ""}
                        onChange={(e) => handleCampoChange(campo.key, e.target.value)}
                        className={ESTILO_CAMPO}
                      />
                    )}
                  </label>
                ))}
              </div>
            )}

            <label className="mt-3 block">
              <span className={ESTILO_LABEL}>Descripción de la visita</span>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={3}
                placeholder="Observaciones, incidencias, accesos..."
                className={`${ESTILO_CAMPO} resize-none`}
              />
            </label>
          </section>

          {modeloNegocio && (
            <section className="rounded-2xl border border-hairline bg-surface p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Fotos</p>
                {fotosMinimasAmianto > 0 && (
                  <span className={`text-[11px] font-medium ${fotos.length >= fotosMinimasAmianto ? "text-muted" : "text-amber-600"}`}>
                    {fotos.length} de {fotosMinimasAmianto} mínimo
                  </span>
                )}
              </div>

              <div className="grid grid-cols-4 gap-2">
                {fotos.map((url) => (
                  <div key={url} className="group relative aspect-square overflow-hidden rounded-xl bg-canvas">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Foto de la visita" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => quitarFoto(url)}
                      aria-label="Quitar foto"
                      className="absolute right-1 top-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-ink/60 text-canvas"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3 w-3">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}

                <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-hairline text-muted transition hover:border-ink/30 hover:text-ink">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    capture="environment"
                    onChange={(e) => handleFotosSeleccionadas(e.target.files)}
                    disabled={subiendoFoto}
                    className="hidden"
                  />
                </label>
              </div>

              {subiendoFoto && <p className="mt-2 text-xs text-muted">Subiendo foto...</p>}
            </section>
          )}

          {candidatas && candidatas.length > 0 && (
            <section className="rounded-2xl border border-hairline bg-surface p-4">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted">
                Hay varias oportunidades abiertas para este administrador — elige la correcta
              </p>
              <div className="flex flex-col gap-2">
                {candidatas.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-hairline p-3 transition hover:border-ink/30"
                  >
                    <input
                      type="radio"
                      name="oportunidad-elegida"
                      onChange={() => handleEnviar(c.id)}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-ink"
                    />
                    <span className="text-sm text-ink">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted"> · {c.modeloNegocio ?? "sin modelo"} · {new Date(c.createdAt).toLocaleDateString()}</span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {resultadoEnvio && (
            <p className="rounded-xl border border-hairline bg-surface px-4 py-3 text-sm text-ink">
              {resultadoEnvio}
            </p>
          )}
        </div>

        {/* bottom-24: se posa justo encima del navbar flotante, nunca lo tapa */}
        <div className="sticky bottom-24 z-30 mt-4 rounded-2xl border border-hairline bg-canvas/95 p-3 backdrop-blur-md">
          {motivoBloqueo && (
            <p className="mb-2 text-center text-xs text-muted">{motivoBloqueo}</p>
          )}
          <button
            type="button"
            disabled={!formularioValido || enviando || candidatas !== null}
            onClick={() => handleEnviar()}
            className="w-full cursor-pointer rounded-xl bg-ink py-3 text-sm font-semibold text-canvas transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            {enviando ? "Enviando..." : "Enviar presupuesto"}
          </button>
        </div>
      </div>
    );
}