/**
 * scripts/tarifa/probar-estado.ts
 *
 * Prueba la máquina de estados con `fetch` simulado. NO toca GHL.
 *
 * Comprueba el arreglo del 31/08/2026: distinguir "no hay registro" de
 * "no he podido leer el registro". Antes, un fallo de red se interpretaba como
 * ausencia de registro y permitía saltarse la validación de transiciones.
 *
 * Uso:  npm run estado:probar
 *
 * Nota: el `export {}` del final es obligatorio. Sin ningún import o export
 * estático, TypeScript trata el fichero como script global y rechaza el
 * `await` de nivel superior (TS1375).
 */

type RespuestaSimulada = unknown;
type Simulador = (url: string, init?: RequestInit) => RespuestaSimulada;

const CAMPO = "Tii45xWUvUhgJtxEOaQf";

let ok = 0;
let ko = 0;

function check(nombre: string, condicion: boolean, detalle = ""): void {
    console.log(`${condicion ? "  ok  " : "  FAIL"}  ${nombre}${detalle ? " -> " + detalle : ""}`);
    if (condicion) ok++;
    else ko++;
}

const fetchReal = globalThis.fetch;

function simular(fn: Simulador): void {
    globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
        const resultado = fn(String(entrada), init);
        if (resultado instanceof Error) throw resultado;
        return {
            ok: true,
            status: 200,
            text: async () => "",
            json: async () => resultado,
        } as Response;
    }) as typeof fetch;
}

function registro(estado: string) {
    return JSON.stringify({
        requestId: "req-1",
        estado,
        numeroReferencia: "SV-2026-0001",
        actualizadoEn: "2026-08-31T00:00:00.000Z",
    });
}

function conCampo(valor: string) {
    return { opportunity: { customFields: [{ id: CAMPO, fieldValue: valor }] } };
}

async function main(): Promise<void> {
    // Las variables deben existir ANTES de cargar el módulo: estado.ts las lee
    // al evaluarse. Por eso el import es dinámico y va aquí dentro.
    process.env.SA_CAMPO_ESTADO_DOCUMENTO = CAMPO;
    process.env.SA_SCALA_API_TOKEN = "pit-simulado";
    process.env.SA_SCALA_LOCATION_ID = "loc-simulado";

    const {
        leerRegistro,
        leerRegistroParaUI,
        escribirRegistro,
        ErrorLecturaRegistro,
        documentosDisponibles,
    } = await import("../../lib/documentos/estado");

    console.log("\n== Disponibilidad por subcuenta ==");
    check("scala operativa", documentosDisponibles("scala-valencia"));
    check("vertical bloqueada aunque tenga campo en .env", !documentosDisponibles("vertical-projects"));

    console.log("\n== Lectura ==");
    simular(() => new Error("ECONNRESET"));
    try {
        await leerRegistro("scala-valencia", "op1");
        check("fallo de red lanza", false, "devolvió en vez de lanzar");
    } catch (error) {
        check("fallo de red lanza ErrorLecturaRegistro", error instanceof ErrorLecturaRegistro);
    }

    simular(() => ({ opportunity: { customFields: [] } }));
    check("campo ausente devuelve null", (await leerRegistro("scala-valencia", "op1")) === null);

    simular(() => conCampo("{roto"));
    check("json corrupto devuelve null", (await leerRegistro("scala-valencia", "op1")) === null);

    simular(() => conCampo(registro("fallido")));
    const leido = await leerRegistro("scala-valencia", "op1");
    check("registro válido se lee", leido?.estado === "fallido", String(leido?.estado));

    console.log("\n== Lectura tolerante para UI ==");
    simular(() => new Error("ECONNRESET"));
    const ui = await leerRegistroParaUI("scala-valencia", "op1");
    check("la UI no rompe y marca errorLectura", ui.registro === null && ui.errorLectura);

    console.log("\n== Escritura ==");
    let puts = 0;

    // El bug original: fallo de red al leer -> previo=null -> validación saltada.
    simular((_url, init) => {
        if (init?.method === "PUT") {
            puts++;
            return {};
        }
        return new Error("ECONNRESET");
    });
    try {
        await escribirRegistro("scala-valencia", "op1", {
            requestId: "req-1",
            estado: "publicado",
            numeroReferencia: "SV-2026-0001",
            actualizadoEn: "x",
        });
        check("fallo de lectura aborta la escritura", false, "escribió igualmente");
    } catch (error) {
        check(
            "fallo de lectura aborta la escritura",
            error instanceof ErrorLecturaRegistro && puts === 0,
            `PUTs=${puts}`
        );
    }

    // Transición ilegal con lectura correcta.
    simular((_url, init) => {
        if (init?.method === "PUT") {
            puts++;
            return {};
        }
        return conCampo(registro("fallido"));
    });

    puts = 0;
    try {
        await escribirRegistro("scala-valencia", "op1", {
            requestId: "req-1",
            estado: "publicado",
            numeroReferencia: "SV-2026-0001",
            actualizadoEn: "x",
        });
        check("fallido -> publicado rechazado", false, "lo permitió");
    } catch {
        check("fallido -> publicado rechazado", puts === 0, `PUTs=${puts}`);
    }

    puts = 0;
    await escribirRegistro(
        "scala-valencia",
        "op1",
        {
            requestId: "req-1",
            estado: "publicado",
            numeroReferencia: "SV-2026-0001",
            actualizadoEn: "x",
        },
        { forzar: true }
    );
    check("forzar salta la validación", puts === 1, `PUTs=${puts}`);

    globalThis.fetch = fetchReal;
    console.log(ko === 0 ? `\n✔ ${ok} checks pasan.\n` : `\n✖ ${ko} checks fallidos.\n`);
    process.exit(ko === 0 ? 0 : 1);
}

void main();

export {};