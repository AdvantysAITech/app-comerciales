export type CampoFormulario = {
    key: string;
    label: string;
    tipo: "texto" | "numero" | "select";
    opciones?: string[];
};

export const CAMPOS_POR_MODELO: Record<string, CampoFormulario[]> = {
    retirada_amianto: [
        { key: "tipo_material", label: "Tipo de material", tipo: "texto" },
        { key: "superficie_m2", label: "Superficie aproximada (m²)", tipo: "numero" },
        { key: "ubicacion", label: "Ubicación", tipo: "texto" },
        { key: "accesibilidad", label: "Accesibilidad", tipo: "texto" },
    ],
    rehabilitacion_impermeabilizacion: [
        {
            key: "tipo_elemento",
            label: "Tipo de elemento",
            tipo: "select",
            opciones: ["Cubierta", "Terraza", "Fachada"],
        },
        { key: "superficie_m2", label: "Superficie (m²)", tipo: "numero" },
        { key: "estado_actual", label: "Estado actual", tipo: "texto" },
        { key: "viviendas_afectadas", label: "Viviendas afectadas", tipo: "numero" },
        { key: "tipo_impermeabilizacion", label: "Tipo de impermeabilización", tipo: "texto" },
    ],
    descuelgues_verticales: [
        { key: "numero_bajantes", label: "Número de bajantes", tipo: "numero" },
        { key: "altura_edificio", label: "Altura del edificio", tipo: "texto" },
        { key: "material_actual", label: "Material actual", tipo: "texto" },
        { key: "material_propuesto", label: "Material propuesto", tipo: "texto" },
        {
        key: "tipo_acceso",
        label: "Tipo de acceso",
        tipo: "select",
        opciones: ["Andamio", "Cuerdas"],
        },
    ],
    reformas_zonas_comunes: [
        { key: "m2_zona_comun", label: "Metros cuadrados de zona común", tipo: "numero" },
        { key: "estado_actual", label: "Estado actual", tipo: "texto" },
        { key: "trabajos_requeridos", label: "Trabajos requeridos", tipo: "texto" },
        { key: "existe_ascensor", label: "¿Existe ascensor?", tipo: "texto" },
    ],
};