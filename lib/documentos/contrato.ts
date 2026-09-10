export type TipoResolucion = "directo" | "ia";

export type DefinicionRuta = {
    /** Markerkey tal cual aparece en la plantilla, sin las llaves. */
    markerkey: string;
    /** Ruta JSON configurada en el prompt template de la app. */
    ruta: string;
    tipo: TipoResolucion;
    /** Campos monetarios o porcentuales: la plantilla añade la unidad. */
    economico?: boolean;
    /** Se espera una tabla Markdown como valor. */
    tabla?: boolean;
    /**
     * Se esperan VARIAS tablas Markdown, cada una precedida de un encabezado
     * `#### `. No es lo mismo que `tabla`: `validarTablaMarkdown` da por hecho
     * que todo el texto es una sola tabla y contaría el encabezado como
     * cabecera, produciendo un error por cada fila del bloque.
     */
    tablas?: boolean;
};

/**
 * Las 18 rutas, agrupadas por actividad y, dentro de cada una, por tipo de
 * resolución. Ya no sigue el orden del listado de content types de la app:
 * desde que `DesgloseCapitulos` pasó a mapeo directo, agrupar por tipo dice de
 * un vistazo qué atraviesa un LLM y qué no, que es la propiedad que importa.
 *
 * Si alguien añade un markerkey a la plantilla, hay que añadirlo AQUÍ y crear
 * su content type + prompt template en la app. Si no, saldrá vacío en silencio.
 */
export const RUTAS: readonly DefinicionRuta[] = [
    // --- Actividad "doc" -------------------------------------------------
    { markerkey: "doc.NRef", ruta: "num_ref", tipo: "directo" },
    { markerkey: "doc.FechaEmision", ruta: "fechaVisita", tipo: "directo" },
    { markerkey: "doc.FechaValidez", ruta: "fecha_validez", tipo: "directo" },
    { markerkey: "doc.Localidad", ruta: "localidad_visita", tipo: "directo" },

    // --- Actividad "presup": identificación ------------------------------
    { markerkey: "presup.ComunidadNombre", ruta: "comunidad.nombre", tipo: "directo" },
    { markerkey: "presup.ComunidadLocalidad", ruta: "comunidad.localidad", tipo: "directo" },
    { markerkey: "presup.ComunidadProvincia", ruta: "comunidad.provincia", tipo: "directo" },
    { markerkey: "presup.AdministradorNombre", ruta: "administrador.nombre", tipo: "directo" },
    { markerkey: "presup.AdministradorLocalidad", ruta: "administrador.localidad", tipo: "directo" },

    // --- Actividad "presup": economía ------------------------------------
    { markerkey: "presup.TotalPEM", ruta: "total_PEM", tipo: "directo", economico: true },
    { markerkey: "presup.IVAPorcentaje", ruta: "porcentaje_IVA", tipo: "directo", economico: true },
    { markerkey: "presup.IVAImporte", ruta: "importe_IVA", tipo: "directo", economico: true },
    { markerkey: "presup.TotalConIVA", ruta: "total_con_IVA", tipo: "directo", economico: true },

    // --- Actividad "presup": tablas deterministas ------------------------
    // Eran IA. Sus propios prompts decían "eres un formateador determinista, no
    // calculas". Se pasan a Mapeo Directo: ~8.000 tokens menos por presupuesto
    // y ninguna cifra atraviesa un LLM.
    { markerkey: "presup.ResumenCapitulos", ruta: "resumen_capitulos", tipo: "directo", tabla: true },
    { markerkey: "presup.ResumenPresupuesto", ruta: "resumen_presupuesto", tipo: "directo", tabla: true },

    // El desglose de partidas por capítulo era la última sección de IA que
    // producía importes. Se pasa a Mapeo Directo sobre `desglose_capitulos`,
    // que `payloadDocumento.renderDesgloseCapitulos()` genera de forma
    // determinista. Verificado en Soluciona el 09/09/2026: los encabezados del
    // ODT pasan de zona ("· MEDIANERAS") a capítulo ("1.01 DEMOLICIONES...").
    //
    // Va con `tablas` y no con `tabla`: son N tablas, una por capítulo.
    { markerkey: "presup.DesgloseCapitulos", ruta: "desglose_capitulos", tipo: "directo", tablas: true },

    // --- Actividad "presup": prosa generada ------------------------------
    // Lo único que sigue produciendo un LLM. Describen la intervención; no
    // calculan nada y ninguna cifra del documento depende de ellas.
    { markerkey: "presup.TituloPresupuesto", ruta: "modulos", tipo: "ia" },
    { markerkey: "presup.ObjetoYAlcance", ruta: "modulos", tipo: "ia" },
];

/** Rutas distintas que el JSON tiene que poder resolver. */
export const RUTAS_REQUERIDAS: readonly string[] = [...new Set(RUTAS.map((r) => r.ruta))];

/**
 * Navega una ruta con puntos sobre un objeto. Devuelve undefined si algún tramo
 * no existe. No soporta índices de array a propósito: ninguna ruta configurada
 * en la app los usa, y aceptarlos aquí daría una falsa sensación de cobertura.
 */
export function resolverRuta(objeto: unknown, ruta: string): unknown {
    let actual: unknown = objeto;
    for (const tramo of ruta.split(".")) {
        if (actual === null || actual === undefined || typeof actual !== "object") return undefined;
        actual = (actual as Record<string, unknown>)[tramo];
    }
    return actual;
}

function estaVacio(valor: unknown): boolean {
    if (valor === null || valor === undefined) return true;
    if (typeof valor === "string") return valor.trim() === "";
    if (Array.isArray(valor)) return valor.length === 0;
    if (typeof valor === "object") return Object.keys(valor as object).length === 0;
    return false;
}

/**
 * Validación PRE-VUELO: se ejecuta antes de llamar a la app.
 *
 * Como un markerkey sin dato se sustituye por vacío sin dar error, un fallo aquí
 * no se detectaría nunca: el presupuesto saldría con un hueco y llegaría firmado
 * al administrador. Es más barato abortar.
 */
export function validarPreVuelo(json: unknown): string[] {
    const errores: string[] = [];

    for (const definicion of RUTAS) {
        const valor = resolverRuta(json, definicion.ruta);

        if (estaVacio(valor)) {
            errores.push(`${definicion.markerkey}: la ruta "${definicion.ruta}" no resuelve a ningún valor.`);
            continue;
        }

        if (definicion.economico && typeof valor === "string" && /[€%]/.test(valor)) {
            errores.push(
                `${definicion.markerkey}: "${valor}" incluye el símbolo. La plantilla ya lo escribe ` +
                    `y saldría duplicado ("12.450,00 € €"). Envía solo el número.`
            );
        }

        if (definicion.tabla && typeof valor === "string") {
            errores.push(...validarTablaMarkdown(definicion.markerkey, valor));
        }

        if (definicion.tablas && typeof valor === "string") {
            errores.push(...validarBloquesDeTablas(definicion.markerkey, valor));
        }
    }

    return errores;
}

/**
 * Una tabla Markdown válida para el conversor de la app.
 *
 * El pipe de cierre genera una columna vacía a la derecha (comprobado en
 * TEST-003: cabecera de 6 nombres -> 7 celdas). Nuestras tablas se emiten sin él.
 */
export function validarTablaMarkdown(etiqueta: string, texto: string): string[] {
    const errores: string[] = [];
    const lineas = texto.split("\n").filter((l) => l.trim() !== "");

    if (lineas.length < 3) {
        errores.push(`${etiqueta}: una tabla necesita cabecera, separador y al menos una fila.`);
        return errores;
    }

    if (!/^\s*\|?\s*:?-{2,}/.test(lineas[1])) {
        errores.push(`${etiqueta}: falta la fila separadora (|---|---:|) tras la cabecera.`);
    }

    // Sin pipe de cierre, el nº de celdas es el de tramos tras el pipe inicial.
    // Se cuentan así (y no filtrando vacíos) porque las filas de totales llevan
    // la primera celda vacía a propósito.
    const celdasDe = (linea: string) => linea.split("|").slice(1, -1).length;
    const columnas = celdasDe(lineas[0]);

    lineas.forEach((linea, i) => {
        if (i === 1) return;
        if (celdasDe(linea) !== columnas) {
            errores.push(`${etiqueta}: la fila ${i + 1} no tiene el mismo número de columnas que la cabecera.`);
        }
    });

    const sinCierre = lineas.filter((l) => !l.trimEnd().endsWith("|"));
    if (sinCierre.length > 0) {
        errores.push(
            `${etiqueta}: ${sinCierre.length} fila(s) sin pipe de cierre. El conversor no las ` +
                `reconocera como tabla y saldran impresas como texto.`
        );
    }

    return errores;
}

/**
 * Varias tablas Markdown en un solo valor, cada una precedida de `#### Título`.
 *
 * Es la forma de `desglose_capitulos`: un bloque por capítulo. Se parte por los
 * encabezados y se valida cada tabla por separado con `validarTablaMarkdown`,
 * que es donde vive el conocimiento sobre el conversor de la app.
 *
 * Pasarle el bloque entero a `validarTablaMarkdown` NO funciona: tomaría el
 * primer `####` como cabecera y marcaría todas las filas como desalineadas.
 * Se comprobó el 09/09/2026: 14 errores falsos sobre un desglose correcto.
 */
export function validarBloquesDeTablas(etiqueta: string, texto: string): string[] {
    const errores: string[] = [];
    const lineas = texto.split("\n");
    const esEncabezado = (linea: string) => /^\s*#{4}\s+\S/.test(linea);

    const primero = lineas.findIndex(esEncabezado);

    if (primero === -1) {
        errores.push(
            `${etiqueta}: no hay ningún encabezado "#### ". Se espera una tabla por capítulo, ` +
                `cada una con su título.`
        );
        return errores;
    }

    if (lineas.slice(0, primero).some((l) => l.trim() !== "")) {
        errores.push(
            `${etiqueta}: hay texto antes del primer encabezado. Saldría impreso suelto, ` +
                `fuera de toda tabla.`
        );
    }

    // Corte por encabezado: cada bloque es [título, ...filas].
    const bloques: string[][] = [];
    for (const linea of lineas.slice(primero)) {
        if (esEncabezado(linea)) bloques.push([linea]);
        else bloques[bloques.length - 1].push(linea);
    }

    for (const bloque of bloques) {
        const titulo = bloque[0].replace(/^\s*#{4}\s+/, "").trim();
        const cuerpo = bloque.slice(1).join("\n");

        if (cuerpo.trim() === "") {
            errores.push(`${etiqueta}: el bloque "${titulo}" no tiene tabla debajo del título.`);
            continue;
        }

        errores.push(...validarTablaMarkdown(`${etiqueta} · ${titulo}`, cuerpo));
    }

    return errores;
}

/**
 * Frases con las que un modelo confiesa que no tuvo datos. Aparecieron
 * literalmente en TEST-001 y TEST-003, con `success: true` en la traza.
 */
const SENALES_DE_FALLO: readonly RegExp[] = [
    /no se han recibido datos/i,
    /falta el json/i,
    /pendiente de validaci[oó]n t[eé]cnica/i,
    /no dispongo de/i,
    /no puedo (generar|completar|proceder)/i,
    /como (modelo|asistente) de lenguaje/i,
    /lo siento/i,
    /\{\{[^}]+\}\}/, // markerkey o variable sin sustituir
    /```/, // valla de código: el prompt la prohíbe, el conversor la imprimiría
];

/**
 * Secciones cuyo valor DEBE cuadrar con lo que enviamos.
 *
 * Para las de mapeo directo, la app se limita a copiar la ruta del JSON. Si lo
 * que vuelve no es lo que mandamos, la ruta configurada en el prompt template no
 * es la que cree el codigo, y el markerkey habra salido vacio en el documento.
 * Fue exactamente lo que paso con `presup.ResumenCapitulos` apuntando todavia a
 * `{tabla_prueba}`: traza correcta, tabla ausente del ODT.
 */
export function validarMapeoDirecto(
    trazas: readonly TrazaSeccion[],
    json: unknown
): string[] {
    const errores: string[] = [];

    for (const definicion of RUTAS) {
        if (definicion.tipo !== "directo") continue;

        const traza = trazas.find((t) => t.markerKey === definicion.markerkey);
        if (!traza) continue;

        const esperado = String(resolverRuta(json, definicion.ruta) ?? "").trim();
        const recibido = (traza.aiResponse ?? "").trim();

        if (esperado !== "" && recibido === "") {
            errores.push(
                `${definicion.markerkey}: se envio un valor pero la app devolvio vacio. ` +
                    `Comprueba que su prompt template apunta a "${definicion.ruta}".`
            );
            continue;
        }

        if (recibido !== esperado) {
            errores.push(
                `${definicion.markerkey}: la app devolvio algo distinto de lo enviado. ` +
                    `Enviado: "${esperado.slice(0, 60)}" / Devuelto: "${recibido.slice(0, 60)}".`
            );
        }
    }

    return errores;
}

export type TrazaSeccion = {
    markerKey?: string | null;
    success?: boolean;
    errorMessage?: string | null;
    aiResponse?: string | null;
    missingVariables?: string[] | null;
    totalTokens?: number | null;
};

/**
 * Validación POST-VUELO sobre `sectionTraces`.
 *
 * `success` es condición necesaria pero NO suficiente: la app lo pone a true
 * siempre que el modelo devuelva texto, aunque ese texto diga que no había
 * datos. Aquí se mira el contenido.
 */
export function validarContenido(trazas: readonly TrazaSeccion[]): string[] {
    const errores: string[] = [];
    const vistos = new Set<string>();

    for (const traza of trazas) {
        const clave = traza.markerKey ?? "(sin markerkey)";
        vistos.add(clave);

        if (traza.success === false) {
            errores.push(`${clave}: la app marcó la sección como fallida. ${traza.errorMessage ?? ""}`.trim());
            continue;
        }

        if (traza.missingVariables && traza.missingVariables.length > 0) {
            errores.push(`${clave}: variables sin resolver -> ${traza.missingVariables.join(", ")}`);
        }

        const respuesta = traza.aiResponse ?? "";

        if (respuesta.trim() === "") {
            errores.push(`${clave}: la sección se resolvió a texto vacío.`);
            continue;
        }

        for (const senal of SENALES_DE_FALLO) {
            if (senal.test(respuesta)) {
                errores.push(
                    `${clave}: el contenido parece un fallo encubierto (coincide con ${senal}). ` +
                        `Texto: "${respuesta.slice(0, 120)}"`
                );
                break;
            }
        }
    }

    for (const definicion of RUTAS) {
        if (!vistos.has(definicion.markerkey)) {
            errores.push(`${definicion.markerkey}: la app no devolvió traza para esta sección.`);
        }
    }

    return errores;
}

/**
 * Comprueba que las cifras que aparecen en el texto generado por IA existen en
 * el cálculo determinista. Si un modelo se inventa un importe, aquí se ve.
 */
export function validarCifras(
    trazas: readonly TrazaSeccion[],
    cifrasPermitidas: readonly string[]
): string[] {
    const errores: string[] = [];
    const permitidas = new Set(cifrasPermitidas);
    const soloIa = new Set(RUTAS.filter((r) => r.tipo === "ia").map((r) => r.markerkey));

    for (const traza of trazas) {
        if (!traza.markerKey || !soloIa.has(traza.markerKey)) continue;

        // Importes con separador de miles o decimales: 1.234,56 / 45,00
        const cifras = (traza.aiResponse ?? "").match(/\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}/g) ?? [];
        for (const cifra of cifras) {
            if (!permitidas.has(cifra)) {
                errores.push(
                    `${traza.markerKey}: aparece el importe ${cifra}, que no está en el cálculo. ` +
                        `Revísalo antes de publicar.`
                );
            }
        }
    }

    return errores;
}