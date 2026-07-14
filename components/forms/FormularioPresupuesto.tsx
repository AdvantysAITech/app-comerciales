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

    async function handleEnviar() {
      if (!formularioValido || !comunidadSeleccionada) return;

      setEnviando(true);
      setResultadoEnvio(null);

      try{
        const response = await fetch("/api/crear-oportunidad", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            comuidadNombre: comunidadSeleccionada.nombreDireccion,
            administrador: administradorAsociado,
            modeloNegocio,
            fecha,
            contactoVisita,
            descripcion,
            camposEspecificos: valoresCampos,
            fotos,
          }),
        });

        const data = await response.json();
        
        if(!response.ok){
          throw new Error(data.error ?? "Error al crear la oportunidad");
        }

        setResultadoEnvio(`Oportunidad creada correctamente (ID: ${data.id})`);
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

    const esScala = subcuenta === "scala-valencia";

    function handleCampoChange(key: string, valor: string) {
        setValoresCampos((anterior) => ({ ...anterior, [key]: valor }));
    }

    const camposActuales = modeloNegocio ? CAMPOS_POR_MODELO[modeloNegocio] : [];
    const comunidadSeleccionada = comunidades.find((c) => c.id === comunidadId);
    const administradorAsociado = administradores.find(
      (a) => a.id === comunidadSeleccionada?.administradorId
    );

    const formularioValido = 
    comunidadId !== "" && 
    modeloNegocio !== "" && 
    fecha !== "" &&
    (modeloNegocio !== "retirada_amianto" || fotos.length >= 3);

    return (
      <div>
        <h1>Nuevo presupuesto</h1>

        <label>
          Comunidad
          <select value={comunidadId} onChange={(e) => setComunidadId(e.target.value)}>
            <option value="">-- Selecciona una comunidad --</option>
            {comunidades.map((comunidad) => (
              <option key={comunidad.id} value={comunidad.id}>
                {comunidad.nombreDireccion}
              </option>
            ))}
          </select>
        </label>

        <p>
          Administrador:{" "}
          {administradorAsociado
            ? administradorAsociado.nombreDespacho
            : comunidadId
              ? "Sin administrador asociado"
              : "(elige una comunidad primero)"}
        </p>

        <label>
          Contacto de la visita
          <input
            type="text"
            value={contactoVisita}
            onChange={(e) => setContactoVisita(e.target.value)}
            placeholder="Nombre de la persona en el sitio"
          />
        </label>

        <label>
          Fecha de la visita
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>

        <label>
          Modelo de negocio
          <select
            value={modeloNegocio}
            onChange={(e) => {
              setModeloNegocio(e.target.value as ModeloNegocio);
              setValoresCampos({});
            }}
          >
            <option value="">-- Selecciona --</option>
            <option value="rehabilitacion_impermeabilizacion">Rehabilitación e impermeabilización</option>
            {esScala && <option value="retirada_amianto">Retirada de amianto</option>}
            <option value="reformas_zonas_comunes">Reformas y zonas comunes</option>
          </select>
        </label>

        {camposActuales.length > 0 && (
          <fieldset>
            <legend>Detalles del trabajo</legend>
            {camposActuales.map((campo) => (
              <label key={campo.key}>
                {campo.label}
                {campo.tipo === "select" ? (
                  <select
                    value={valoresCampos[campo.key] ?? ""}
                    onChange={(e) => handleCampoChange(campo.key, e.target.value)}
                  >
                    <option value="">-- Selecciona --</option>
                    {campo.opciones?.map((opcion) => (
                      <option key={opcion} value={opcion}>
                        {opcion}
                      </option>
                    ))}
                  </select>
                ): (
                  <input
                    type={campo.tipo === "numero" ? "number" : "text"}
                    value={valoresCampos[campo.key] ?? ""}
                    onChange={(e) => handleCampoChange(campo.key, e.target.value)}
                  />
                )}
              </label>
            ))}
            <label>
              Fotos
              <input
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={(e) => handleFotosSeleccionadas(e.target.files)}
                disabled={subiendoFoto}
              />
            </label>

            {subiendoFoto && <p>Subiendo foto...</p>}
            
            <p>{fotos.length} foto(s) subida(s)</p>

            {modeloNegocio === "retirada_amianto" && fotos.length < 3 && (
              <p style={{ color: "red" }}>
                Amianto requiere un mínimo de 3 fotos - llevas {fotos.length}.
              </p>
            )}
          </fieldset>
        )}

        <button type="button" disabled={!formularioValido || enviando} onClick={handleEnviar}>
          {enviando ? "Enviando..." : "Enviar presupuesto"}
        </button>

        {resultadoEnvio && <p>{resultadoEnvio}</p>}

        {!formularioValido && (
          <p style={{ color: "gray", fontSize: "0.9em" }}>
            Completa Comunidad, Modelo de negocio y Fecha para continuar
          </p>
        )}
      </div>
    );
}