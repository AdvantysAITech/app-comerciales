/**
 * scripts/tarifa/probar-contador.ts
 *
 * Prueba el contador correlativo con `fetch` simulado. NO toca GHL.
 * Uso:  npm run contador:probar
 */

let ok = 0;
let ko = 0;
function check(nombre: string, condicion: boolean, detalle = ""): void {
    console.log(`${condicion ? "  ok  " : "  FAIL"}  ${nombre}${detalle ? " -> " + detalle : ""}`);
    if (condicion) ok++;
    else ko++;
}

const CAMPO = "Tii45xWUvUhgJtxEOaQf";
const fetchReal = globalThis.fetch;

function oportunidad(id: string, referencia: string | null, epoch: number) {
    return {
        id,
        sort: [epoch, id],
        customFields: referencia
            ? [{ id: CAMPO, fieldValueString: JSON.stringify({ requestId: "r", estado: "publicado", numeroReferencia: referencia, actualizadoEn: "x" }), type: "string" }]
            : [],
    };
}

function simularPaginas(paginas: ReturnType<typeof oportunidad>[][]): { llamadas: number } {
    const contador = { llamadas: 0 };
    globalThis.fetch = (async (entrada: string | URL | Request) => {
        const url = String(entrada);
        const idx = contador.llamadas;
        contador.llamadas++;
        const lote = paginas[idx] ?? [];
        if (idx > 0 && !url.includes("startAfter")) throw new Error("paginacion sin cursor");
        return { ok: true, status: 200, text: async () => "", json: async () => ({ opportunities: lote }) } as Response;
    }) as typeof fetch;
    return contador;
}

async function main(): Promise<void> {
    process.env.SA_CAMPO_ESTADO_DOCUMENTO = CAMPO;
    process.env.SA_SCALA_API_TOKEN = "pit-simulado";
    process.env.SA_SCALA_LOCATION_ID = "loc-simulado";

    const { asignarReferencia, formatearReferencia, extraerCorrelativo, contadorDesdeOportunidades, verificarUnicidad, PREFIJO_REFERENCIA } =
        await import("../../lib/documentos/contador");

    console.log("\n== Formato ==");
    check("prefijo scala es SV", PREFIJO_REFERENCIA["scala-valencia"] === "SV", PREFIJO_REFERENCIA["scala-valencia"]);
    check("4 digitos", formatearReferencia("scala-valencia", 2026, 1) === "SV-2026-0001", formatearReferencia("scala-valencia", 2026, 1));
    check("no desborda a 4 cifras", formatearReferencia("scala-valencia", 2026, 12345) === "SV-2026-12345");

    console.log("\n== Parseo ==");
    check("lee correlativo propio", extraerCorrelativo("SV-2026-0082", "scala-valencia") === 82);
    check("ignora prefijo ajeno (ESC- heredado)", extraerCorrelativo("ESC-2026-0082", "scala-valencia") === null);
    check("ignora basura", extraerCorrelativo("presupuesto final", "scala-valencia") === null);
    check("ignora otra subcuenta", extraerCorrelativo("VRT-2026-0005", "scala-valencia") === null);

    console.log("\n== Derivacion ==");
    simularPaginas([[oportunidad("a", "ESC-2026-0082", 1), oportunidad("b", null, 2)]]);
    const r1 = await asignarReferencia("scala-valencia");
    check("solo referencias ESC -> arranca en 0001", r1 === "SV-2026-0001", r1);

    simularPaginas([[oportunidad("a", "SV-2026-0007", 1), oportunidad("b", "SV-2026-0003", 2), oportunidad("c", "ESC-2026-0082", 3)]]);
    check("toma el maximo, no el ultimo", (await asignarReferencia("scala-valencia")) === "SV-2026-0008");

    simularPaginas([[]]);
    check("sin oportunidades arranca en 0001", (await asignarReferencia("scala-valencia")) === "SV-2026-0001");

    console.log("\n== Continuidad entre anios ==");
    simularPaginas([[oportunidad("a", "SV-2026-0450", 1)]]);
    check("no reinicia en enero: 2027 sigue en 0451", (await asignarReferencia("scala-valencia", contadorDesdeOportunidades, 2027)) === "SV-2027-0451");

    console.log("\n== Paginacion ==");
    const p1 = Array.from({ length: 100 }, (_, i) => oportunidad(`p1-${i}`, `SV-2026-${String(i + 1).padStart(4, "0")}`, i));
    const p2 = [oportunidad("p2-0", "SV-2026-0150", 200)];
    const c = simularPaginas([p1, p2, []]);
    check("sigue a la pagina 2 y usa el maximo global", (await asignarReferencia("scala-valencia")) === "SV-2026-0151");
    check("se detiene al vaciarse", c.llamadas === 2, `llamadas=${c.llamadas}`);

    console.log("\n== Unicidad ==");
    simularPaginas([[oportunidad("a", "SV-2026-0001", 1), oportunidad("b", "SV-2026-0001", 2)], [], [], []]);
    const dup = await verificarUnicidad("scala-valencia");
    check("detecta duplicadas", dup.length === 1 && dup[0] === "SV-2026-0001", dup.join(","));

    globalThis.fetch = fetchReal;
    console.log(ko === 0 ? `\n✔ ${ok} checks pasan.\n` : `\n✖ ${ko} checks fallidos.\n`);
    process.exit(ko === 0 ? 0 : 1);
}

void main();

export {};