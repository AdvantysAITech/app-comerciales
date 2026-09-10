import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

/**
 * lib/documentos/rasterizar.ts
 *
 * SVG -> PNG. Es la única pieza del pipeline con una dependencia binaria.
 *
 * ---------------------------------------------------------------------------
 * LAS FUENTES SE EMPAQUETAN, NO SE HEREDAN
 * ---------------------------------------------------------------------------
 * resvg NO usa las fuentes del sistema salvo que se le diga, y en el runtime de
 * Vercel no hay ninguna. Con `loadSystemFonts: true` funciona en un Windows con
 * Arial instalada y produce un PNG PERFECTAMENTE VÁLIDO Y SIN UNA LETRA en
 * producción. Es el peor fallo posible: no lanza, no avisa, y el documento sale
 * con la portada en blanco.
 *
 * Por eso los ficheros se pasan explícitamente y `loadSystemFonts` va a false:
 * lo que se ve en local es exactamente lo que se verá desplegado.
 *
 * Se usa DejaVu Sans (paquete `dejavu-fonts-ttf`, dominio público) porque tiene
 * el juego latino completo con acentos y el símbolo del euro, que es todo lo
 * que necesita la portada.
 *
 * OJO con el formato: resvg admite TTF y OTF, NO woff ni woff2. Con un woff2 no
 * falla: devuelve el PNG con el texto ausente. Comprobado el 10/09/2026.
 */

/**
 * Rutas de las fuentes, con la ruta relativa COMPLETA en una cadena literal.
 *
 * Turbopack analiza el código estáticamente y aquí hay dos trampas distintas:
 *
 *  - `require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf")` lo trata como un
 *    import estático e intenta empaquetar el .ttf como módulo: "Unknown module
 *    type", y la app deja de compilar entera.
 *  - un `join` cuyos tramos salgan de variables hace que el trazador marque el
 *    PROYECTO ENTERO como necesario ("Encountered unexpected file in NFT list")
 *    y el paquete de despliegue se dispara de tamaño.
 *
 * Con `join(process.cwd(), "<ruta literal completa>")` no ocurre ninguna de las
 * dos: el tramo dinámico es solo la raíz, que es justo el patrón que Turbopack
 * documenta como aceptable.
 */
const RUTAS_FUENTE = [
    join(process.cwd(), "node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf"),
    join(process.cwd(), "node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf"),
];

/** Familia declarada en `portada.svg.ts`. Tiene que coincidir. */
export const FAMILIA_FUENTE = "DejaVu Sans";

/**
 * No se comprueba con `existsSync` que los ficheros estén ahí.
 *
 * Sería lo natural, pero CUALQUIER operación de sistema de ficheros en este
 * módulo hace que el trazador de dependencias de Turbopack marque el proyecto
 * entero como necesario ("Encountered unexpected file in NFT list"). Verificado
 * el 10/09/2026: quitando el existsSync, el aviso desaparece.
 *
 * No se pierde diagnóstico. Si las fuentes no están, resvg no protesta: pinta
 * el SVG sin una letra. Ese caso lo caza la comprobación de tamaño de
 * `rasterizarSvg`, que ya existía por ese mismo motivo, y su mensaje lista las
 * rutas donde se han buscado.
 */

export type OpcionesRasterizado = {
    /** Ancho de salida en píxeles. 1240 = A4 a 150 dpi. */
    ancho?: number;
};

/**
 * Rasteriza un SVG a PNG.
 *
 * Lanza si algo va mal. Quien llama decide qué hacer: en el pipeline del
 * presupuesto, publicar sin portada.
 */
export function rasterizarSvg(svg: string, opciones: OpcionesRasterizado = {}): Uint8Array {
    const resvg = new Resvg(svg, {
        fitTo: { mode: "width", value: opciones.ancho ?? 1240 },
        font: {
            loadSystemFonts: false,
            fontFiles: [...RUTAS_FUENTE],
            defaultFontFamily: FAMILIA_FUENTE,
        },
    });

    const png = resvg.render().asPng();

    // Un PNG de A4 con contenido no baja de unos cuantos KB. Si sale minúsculo,
    // lo más probable es que no se haya pintado nada, y publicar una portada en
    // blanco es peor que publicar sin portada.
    if (png.length < 4096) {
        throw new Error(
            `El rasterizado ha producido un PNG de ${png.length} bytes, sospechosamente pequeño ` +
                `para un A4 con contenido.\n\n` +
                `Casi siempre significa que las fuentes no se han cargado y el texto no se ha ` +
                `pintado: resvg no da error con una fuente que no encuentra, simplemente no la ` +
                `usa. Se han buscado en:\n` +
                RUTAS_FUENTE.map((r) => `  - ${r}`).join("\n") +
                `\n\nComprueba que "dejavu-fonts-ttf" está en dependencies (no en ` +
                `devDependencies) y que next.config.ts las incluye en outputFileTracingIncludes.`
        );
    }

    return new Uint8Array(png);
}