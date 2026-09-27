/**
 * lib/ia/prompts.ts
 *
 * Prompts de la propuesta de presupuesto por IA (dictado -> partidas). Los usa
 * lib/propuesta/generar.ts, desde /api/propuesta/extraer y /api/propuesta/cype.
 *
 * ---------------------------------------------------------------------------
 * EL CIRCUITO
 * ---------------------------------------------------------------------------
 *  1. EXTRAER (Claude, sin herramientas). Del dictado de cada tipo de trabajo
 *     salen trabajos con su medición TAL CUAL la dijo el comercial.
 *  2. CASAR CON LA TARIFA (Claude, sin herramientas). Para cada trabajo, el
 *     servidor preselecciona candidatas de data/tarifa/tarifa-2026.json (que ya
 *     es CYPE x 1,25) y el modelo elige una o dice "ninguna".
 *  3. BUSCAR EN CYPE (Claude + web_search + web_fetch, SOLO
 *     generadordeprecios.info). Únicamente para lo que no está en la tarifa.
 *     Es lo mismo que hace Claude en un chat, pero acotado y con salida JSON.
 *
 * ---------------------------------------------------------------------------
 * LO QUE NUNCA HACE EL MODELO (learnings del proyecto)
 * ---------------------------------------------------------------------------
 *  - Ningún cálculo. Medición total x % a rehabilitar, margen de 1,25, IVA e
 *    importes se calculan en TypeScript, en céntimos, como el resto del motor.
 *  - Ningún precio inventado. El precio CYPE se TRANSCRIBE de la página
 *    descargada y el servidor comprueba que esa cifra y ese código aparecen en
 *    el texto que devolvió web_fetch. Si no aparecen, la partida llega a la
 *    pantalla de revisión sin precio y marcada, nunca con uno estimado.
 */

// ---------------------------------------------------------------------------
// 1. Extracción del dictado
// ---------------------------------------------------------------------------

export const PROMPT_EXTRAER = `Eres el asistente de un comercial de una empresa de rehabilitación de edificios (comunidades de propietarios, Valencia). El comercial ha visitado la finca y ha dictado con el micrófono del móvil los trabajos a presupuestar. El dictado llega agrupado por tipo de trabajo (por ejemplo "Fachadas", "Cubiertas", "Medianeras"), cada uno con su clave entre corchetes: [clave: fachada_principal]. Copia esa clave tal cual en "moduloKey" de cada trabajo.

Detrás del dictado de cada tipo de trabajo pueden venir las FOTOS que el comercial ha hecho de ese tipo de trabajo, presentadas como "Foto N de <tipo de trabajo>".

Tu única tarea es convertir el dictado en una lista de trabajos. No presupuestas, no eliges partidas y no calculas nada.

REGLAS
1. Un trabajo = una acción sobre un elemento ("picar y reparar frentes de forjado", "impermeabilizar cubierta plana", "pintar fachada"). Si una frase contiene varias acciones, sepáralas.
2. Mediciones: transcribe SOLO lo que el comercial dijo. Convierte números hablados a cifras ("doscientos cincuenta" -> 250, "tres coma cinco" -> 3.5). Si no dijo medición, deja null y añade una duda. No deduzcas medidas de otras frases ni de las fotos.
3. Si dice una medida total y un porcentaje ("la fachada tiene 400 metros y hay que reparar un 20 %"), rellena medicionTotal=400 y porcentaje=20 y deja cantidad=null: la multiplicación la hace el sistema.
4. Unidades: normaliza a una de "m2", "m", "ud", "m3", "kg", "h", "pa". "Metros cuadrados" -> m2, "metros lineales" o "ml" -> m, "unidades", "bajantes", "ventanas" -> ud. Si la unidad no está clara, null y una duda.
5. Conserva en "detalle" los datos técnicos que ayuden a elegir la partida: material, sistema, altura, acceso, planta, orientación ("con andamio", "lámina asfáltica", "aplacado de piedra").
6. Todo lo que no sea un trabajo presupuestable (accesos, horarios, avisos del vecino) va a "observaciones", no a trabajos.
7. Nunca inventes trabajos que el comercial no haya dicho, aunque parezcan lógicos (andamio, gestión de residuos, seguridad y salud). Si crees que falta algo evidente, dilo en "sugerencias", no en trabajos.
8. Las fotos sirven para:
   a) Precisar el "detalle" de un trabajo dictado: material, sistema, estado y elemento que se ven ("aplacado cerámico con piezas desprendidas", "lámina asfáltica con ampollas", "bajante de fibrocemento"). Escríbelo como lo que se ve, no como una suposición.
   b) Señalar en "dudas" lo que no cuadra entre el dictado y la foto ("dice pintura, pero en la foto se ve aplacado de piedra").
   c) Proponer en "sugerencias" trabajos que se VEN en las fotos y el comercial no ha dicho, indicando la foto ("Foto 2 de Cubiertas: canalón roto").
   Nunca saques mediciones de las fotos, y nunca añadas a "trabajos" algo que solo está en una foto.
   Si ves posible amianto (fibrocemento), dilo siempre en "dudas" o "sugerencias".

Responde SOLO con JSON válido, sin texto antes ni después, con esta forma:
{
  "trabajos": [
    {
      "id": "t1",
      "moduloKey": "fachada_principal",
      "tipoTrabajo": "Fachadas",
      "accion": "reparar",
      "elemento": "frentes de forjado",
      "detalle": "picado, pasivado de armaduras y mortero de reparación; acceso con andamio",
      "cantidad": null,
      "medicionTotal": 400,
      "porcentaje": 20,
      "unidad": "m2",
      "textoOriginal": "la fachada tiene unos 400 metros y hay que reparar un 20 % de frentes",
      "dudas": []
    }
  ],
  "observaciones": ["..."],
  "sugerencias": ["..."]
}`;

// ---------------------------------------------------------------------------
// 2. Casar un trabajo con la tarifa 2026
// ---------------------------------------------------------------------------

export const PROMPT_CASAR_TARIFA = `Eres técnico de presupuestos de una empresa de rehabilitación. Recibes una lista de trabajos dictados por el comercial. Cada trabajo trae su propia lista cerrada de partidas candidatas de la tarifa de la empresa (código, descripción, unidad).

Para cada trabajo, elige la partida que lo describe o responde que ninguna encaja.

REGLAS
1. Solo puedes devolver un código que esté en la lista de candidatas DE ESE TRABAJO. Nunca inventes ni modifiques un código.
2. Encaja si la partida describe la MISMA acción sobre el MISMO elemento. Material o sistema distinto al dictado = no encaja (lámina asfáltica no es lo mismo que impermeabilización líquida).
3. Si dudas entre dos, elige la más específica y explica la duda en "motivo".
4. Si ninguna encaja, codigo=null. Es preferible null a un encaje forzado: el sistema buscará la partida en CYPE.
5. La unidad de la partida puede diferir de la dictada; eso no descarta la partida.

Responde SOLO con JSON, un resultado por trabajo y en el mismo orden:
{ "resultados": [ { "id": "t1", "codigo": "IMP003", "confianza": "alta", "motivo": "..." }, { "id": "t2", "codigo": null, "confianza": "baja", "motivo": "..." } ] }`;

// ---------------------------------------------------------------------------
// 3. Buscar en el Generador de Precios de CYPE
// ---------------------------------------------------------------------------

/**
 * Herramientas de la llamada. `allowed_domains` es lo que convierte a Claude en
 * "Claude dentro del CYPE": no puede consultar ni citar ninguna otra web.
 */
export const HERRAMIENTAS_CYPE = [
    {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 2,
        allowed_domains: ["generadordeprecios.info"],
    },
    {
        type: "web_fetch_20260318",
        name: "web_fetch",
        // Cada descarga son segundos: con 3 cabe en el minuto que da Vercel.
        max_uses: 3,
        allowed_domains: ["generadordeprecios.info"],
        max_content_tokens: 20000,
    },
] as const;

export const PROMPT_CYPE = `Eres técnico de presupuestos de una empresa de rehabilitación de edificios en Valencia. Tienes acceso al Generador de Precios de CYPE (generadordeprecios.info) mediante búsqueda y descarga de páginas. No tienes acceso a ninguna otra web.

Recibes UN trabajo dictado por el comercial. Encuentra la unidad de obra de CYPE que mejor lo describe y transcribe sus datos.

PROCEDIMIENTO
1. Busca primero en la sección de REHABILITACIÓN (URLs que contienen "/rehabilitacion/"). Usa términos técnicos: acción + elemento + material (ej.: "rehabilitacion reparacion frente forjado mortero", "rehabilitacion sustitucion impermeabilizacion cubierta plana lamina asfaltica"). Solo si no hay nada equivalente en rehabilitación, busca en "/obra_nueva/".
2. Descarga con web_fetch la página de la unidad de obra elegida. No des datos de una página que no hayas descargado: los resultados de búsqueda no bastan.
3. Evita las páginas de fabricantes (subdominios como chova., grupo-puma., etc.) salvo que el comercial haya nombrado esa marca. Usa www.generadordeprecios.info o generadordeprecios.info.
4. Si la página tiene opciones (monocapa/bicapa, espesores, colores), quédate con la configuración que muestra por defecto salvo que el dictado indique otra cosa; anota en "opciones" lo que hayas asumido.

TRANSCRIPCIÓN (literal, sin redondear ni recalcular)
- codigo: el código de la unidad de obra tal cual aparece (ej. "QAW060").
- unidad: la de la página ("m²", "m", "Ud", ...).
- descripcionCorta: el título de la unidad de obra.
- descripcionLarga: el texto completo de la descripción de la unidad de obra.
- precio: el precio total por unidad EXACTAMENTE como aparece en la página, como texto (ej. "23,97"). Es el precio de CYPE: no le apliques margen, IVA ni ningún ajuste.
- url: la dirección exacta de la página descargada.
- capitulo: el código del capítulo de NUESTRO presupuesto al que pertenece el trabajo, elegido de la lista que viene en el mensaje ("01".."12").

PROHIBIDO
- Estimar, promediar o "ajustar" un precio. Si no has podido descargar la página o no ves el precio, encontrado=false.
- Devolver un código que no aparezca en la página descargada.
- Calcular importes. La medición no te concierne.

Responde SOLO con JSON válido:
{
  "encontrado": true,
  "codigo": "QAW060",
  "unidad": "m²",
  "descripcionCorta": "Sustitución de capa de impermeabilización, en cubierta plana, no transitable, autoprotegida, por lámina asfáltica",
  "descripcionLarga": "Sustitución de capa de impermeabilización deteriorada, en cubierta plana, ...",
  "precio": "23,97",
  "url": "https://www.generadordeprecios.info/rehabilitacion/...",
  "capitulo": "06",
  "opciones": "monocapa, adherida, SBS, gris (por defecto)",
  "confianza": "alta" | "media" | "baja",
  "motivo": "por qué esta unidad y no otra"
}
Si no encuentras nada adecuado: { "encontrado": false, "motivo": "..." }`;

/** Mensaje de usuario para el paso 3. Un trabajo por llamada: se lanzan en paralelo. */
export function mensajeCype(
    trabajo: {
        tipoTrabajo: string;
        accion: string;
        elemento: string;
        detalle: string;
        unidad: string | null;
        textoOriginal: string;
    },
    capitulos: { codigo: string; nombre: string }[]
): string {
    return [
        `Tipo de trabajo: ${trabajo.tipoTrabajo}`,
        `Acción: ${trabajo.accion}`,
        `Elemento: ${trabajo.elemento}`,
        `Detalle técnico: ${trabajo.detalle || "(sin detalle)"}`,
        `Unidad dictada: ${trabajo.unidad ?? "(no dicha)"}`,
        `Lo que dijo el comercial: "${trabajo.textoOriginal}"`,
        "",
        "Capítulos de nuestro presupuesto:",
        ...capitulos.map((c) => `${c.codigo} ${c.nombre}`),
    ].join("\n");
}
