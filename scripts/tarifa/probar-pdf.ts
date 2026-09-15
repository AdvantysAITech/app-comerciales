/**
 * scripts/tarifa/probar-pdf.ts
 *
 *   npx tsx scripts/tarifa/probar-pdf.ts [documento.odt]
 *
 * Prueba `convertirAPdf` contra un Gotenberg SIMULADO en localhost: reintentos,
 * errores no reintentables y que lo que llega al servicio va sin fuentes
 * incrustadas. No toca el servidor real.
 *
 * Si se pasa un ODT real (por ejemplo, el que publicó la app), se usa ese; si
 * no, se construye uno mínimo con una fuente falsa.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { unzipSync, zipSync } from "fflate";
import { aligerarParaConversion, convertirAPdf } from "../../lib/documentos/pdf";

let fallos = 0;
function check(nombre: string, cond: boolean, detalle = "") {
    console.log(`${cond ? "  ok  " : "  FAIL"}  ${nombre}${detalle ? "  -> " + detalle : ""}`);
    if (!cond) fallos++;
}

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8");

function odtSintetico(): ArrayBuffer {
    const zip = zipSync({
        mimetype: [enc.encode("application/vnd.oasis.opendocument.text"), { level: 0 }],
        "content.xml": [
            enc.encode(
                `<office:document-content><office:font-face-decls><style:font-face style:name="X">` +
                    `<svg:font-face-src><svg:font-face-uri xlink:href="Fonts/font1.ttf"/></svg:font-face-src>` +
                    `</style:font-face></office:font-face-decls><office:body/></office:document-content>`
            ),
            { level: 6 },
        ],
        "settings.xml": [enc.encode(`<c config:name="EmbedFonts" config:type="boolean">true</c>`), { level: 6 }],
        "META-INF/manifest.xml": [
            enc.encode(
                `<manifest:manifest><manifest:file-entry manifest:full-path="Fonts/font1.ttf" manifest:media-type="application/x-font-ttf"/></manifest:manifest>`
            ),
            { level: 6 },
        ],
        "Fonts/font1.ttf": [new Uint8Array(500_000).fill(7), { level: 0 }],
    });
    return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
}

const ruta = process.argv[2];
const original =
    ruta && existsSync(ruta)
        ? (() => {
              const b = readFileSync(ruta);
              return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
          })()
        : odtSintetico();

// ---------------------------------------------------------------------------
console.log("\n== Aligerado ==");
// ---------------------------------------------------------------------------
const ligero = aligerarParaConversion(original);
const entradas = unzipSync(new Uint8Array(ligero));
check("no quedan ficheros en Fonts/", !Object.keys(entradas).some((n) => n.startsWith("Fonts/")));
check("mimetype sigue siendo la primera entrada", Object.keys(entradas)[0] === "mimetype");
check("content.xml sin referencias a fuentes incrustadas", !dec.decode(entradas["content.xml"]).includes("svg:font-face-src"));
check("manifiesto sin entradas de Fonts/", !dec.decode(entradas["META-INF/manifest.xml"]).includes("Fonts/"));
check("reducción de tamaño", ligero.byteLength < original.byteLength, `${Math.round(original.byteLength / 1024)} KB -> ${Math.round(ligero.byteLength / 1024)} KB`);
check("un ODT sin fuentes se devuelve tal cual", aligerarParaConversion(ligero) === ligero);

// ---------------------------------------------------------------------------
console.log("\n== Conversión contra Gotenberg simulado ==");
// ---------------------------------------------------------------------------
type Guion = Array<{ status: number; cuerpo: string }>;
let guion: Guion = [];
let peticiones = 0;
let bytesRecibidos = 0;

const servidor = createServer((req: IncomingMessage, res: ServerResponse) => {
    const trozos: Buffer[] = [];
    req.on("data", (t: Buffer) => trozos.push(t));
    req.on("end", () => {
        peticiones++;
        bytesRecibidos = Buffer.concat(trozos).length;
        const paso = guion.shift() ?? { status: 200, cuerpo: "%PDF-1.7 simulado" };
        res.writeHead(paso.status);
        res.end(paso.cuerpo);
    });
});

async function main() {
await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", () => r()));
const direccion = servidor.address();
process.env.GOTENBERG_URL = `http://127.0.0.1:${typeof direccion === "object" && direccion ? direccion.port : 0}`;

async function caso(nombre: string, pasos: Guion): Promise<{ ok: boolean; mensaje: string; peticiones: number }> {
    guion = [...pasos];
    peticiones = 0;
    try {
        await convertirAPdf(original, "PRUEBA.odt");
        return { ok: true, mensaje: "", peticiones };
    } catch (error) {
        return { ok: false, mensaje: error instanceof Error ? error.message : String(error), peticiones };
    } finally {
        void nombre;
    }
}

const recursos = "LibreOffice failed to convert the document. This is usually a resource issue.";

let r = await caso("500 y luego 200", [{ status: 500, cuerpo: recursos }]);
check("500 seguido de 200: se recupera con el reintento", r.ok && r.peticiones === 2, `${r.peticiones} peticiones`);
check("lo que llega a Gotenberg va aligerado", bytesRecibidos < ligero.byteLength + 2_000, `${Math.round(bytesRecibidos / 1024)} KB`);

r = await caso("500 dos veces", [{ status: 500, cuerpo: recursos }, { status: 500, cuerpo: recursos }]);
check("500 persistente: falla tras 2 intentos, no más", !r.ok && r.peticiones === 2 && r.mensaje.includes("(500)"), `${r.peticiones} peticiones`);

r = await caso("401", [{ status: 401, cuerpo: "" }]);
check("401: no reintenta", !r.ok && r.peticiones === 1 && r.mensaje.includes("401"));

r = await caso("400", [{ status: 400, cuerpo: "bad" }]);
check("400: no reintenta", !r.ok && r.peticiones === 1);

r = await caso("200 con HTML", [{ status: 200, cuerpo: "<html>proxy</html>" }]);
check("200 que no es PDF: se rechaza sin reintentar", !r.ok && r.peticiones === 1 && r.mensaje.includes("%PDF"));

r = await caso("200 directo", []);
check("200 a la primera: una sola petición", r.ok && r.peticiones === 1);

servidor.close();
console.log(fallos === 0 ? "\n✔ Todos los checks pasan.\n" : `\n✘ ${fallos} fallo(s).\n`);
process.exit(fallos === 0 ? 0 : 1);
}

void main();