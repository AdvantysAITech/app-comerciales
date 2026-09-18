import { config } from "dotenv";
config({ path: ".env.local" });

import { saFetch, getLocationId, type Subcuenta } from "../../lib/ghl/client";

/**
 * scripts/ghl/probar-altas.ts
 *
 *   npm run ghl:probar-altas               (las dos subcuentas)
 *   npm run ghl:probar-altas -- scala      (solo Scala)
 *   npm run ghl:probar-altas -- vertical   (solo Vertical)
 *
 * ESCRIBE EN GHL. Crea un registro de prueba por objeto y lo borra al terminar.
 * Los registros llevan el prefijo `ZZ_PRUEBA_ADVANTYS_` para que sean
 * inconfundibles si algún borrado falla.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ EXISTE (18/09/2026)
 * ---------------------------------------------------------------------------
 * El alta de administradores y comunidades desde la app depende de dos cosas
 * que NO estaban verificadas:
 *
 *   1. Que el PIT tenga scope de ESCRITURA sobre custom objects
 *      (`objects/record.write`). Los tokens actuales se crearon para leer. Si
 *      falta el scope, el alta devuelve 401 y no hay código que lo arregle.
 *
 *   2. Que las claves de propiedad de ESCRITURA sean las mismas que las de
 *      lectura. Las de lectura están verificadas por API desde el 09/09/2026
 *      (`telfono`, `comisin_pactada`, `nombre_del_contacto_principal`), pero
 *      GHL deforma las claves a partir de la etiqueta y ya nos mordió una vez:
 *      el código leía `nombre_contact_princiapl` y la API devolvía
 *      `nombre_del_contacto_principal`, con el resultado de que el presupuesto
 *      imprimió durante meses el nombre del despacho en el hueco del contacto.
 *
 * El fallo que este script evita es el peor de los dos posibles: que el POST
 * devuelva 200 con una clave que GHL no reconoce, el registro se cree con esa
 * propiedad VACÍA y nadie se entere hasta que un presupuesto salga sin
 * teléfono del administrador.
 *
 * Lánzalo antes de desplegar el alta y después de cualquier cambio de snapshot.
 * Sale con código 1 si algo bloquea.
 */

const OBJETO_ADMINISTRADOR = "custom_objects.administradores_de_fincas";
const OBJETO_COMUNIDAD = "custom_objects.comunidades_de_propietarios";

/**
 * Claves que el código usa. DEBEN coincidir con `PROP` de
 * `lib/ghl/administradores.ts` y `lib/ghl/comunidades.ts`. Se repiten aquí a
 * propósito: si alguien las cambia en un sitio y no en el otro, este script
 * falla, que es justo lo que queremos.
 */
const PROP_ADMINISTRADOR = {
    nombre_del_despacho: "ZZ_PRUEBA_ADVANTYS_ADMIN",
    nombre_del_contacto_principal: "Contacto de prueba",
    telfono: "+34600000000",
    email: "prueba@advantys.invalid",
    localidad: "Valencia",
    provincia: "Valencia",
} as const;

const PROP_COMUNIDAD = {
    nombre_direcci_n: "ZZ_PRUEBA_ADVANTYS_COMUNIDAD",
    notas_de_acceso: "Nota de prueba",
    localidad: "Naquera",
    provincia: "Valencia",
} as const;

let bloqueantes = 0;
let avisos = 0;
const huerfanos: string[] = [];

const ok = (m: string) => console.log(`  ok    ${m}`);
const fail = (m: string) => {
    console.log(`  FAIL  ${m}`);
    bloqueantes++;
};
const warn = (m: string) => {
    console.log(`  AVISO ${m}`);
    avisos++;
};
const titulo = (t: string) => console.log(`\n== ${t} ==`);

const sufijoClave = (k: unknown) => String(k ?? "").split(".").pop() ?? "";

async function intentar<T>(descripcion: string, fn: () => Promise<T>): Promise<T | null> {
    try {
        return await fn();
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        fail(`${descripcion}: ${mensaje}`);
        if (mensaje.includes("401") || mensaje.includes("403")) {
            console.log(
                "        -> Parece un problema de permisos. Revisa que el Private Integration Token\n" +
                    "           tenga el scope objects/record.write en esa location."
            );
        }
        return null;
    }
}

/** Comprueba que el objeto existe y que expone las claves que usa el código. */
async function verificarEsquema(subcuenta: Subcuenta, objeto: string, claves: readonly string[]) {
    const locationId = getLocationId(subcuenta);
    const esquema = await intentar(`Leer esquema de ${objeto}`, () =>
        saFetch(subcuenta, `/objects/${objeto}?locationId=${locationId}`)
    );

    if (!esquema) return;

    const campos = (esquema.fields as { fieldKey?: string }[] | undefined) ?? [];

    if (campos.length === 0) {
        warn(`${objeto}: la API no devolvió la lista de campos; no puedo verificar las claves`);
        return;
    }

    const existentes = new Set(campos.map((c) => sufijoClave(c.fieldKey)));

    for (const clave of claves) {
        if (existentes.has(clave)) ok(`${objeto}.${clave}`);
        else fail(`${objeto}: no existe la propiedad "${clave}" que el código escribe`);
    }
}

/**
 * Crea un registro, lo relee y comprueba que CADA propiedad enviada ha
 * persistido con el mismo valor. Después lo borra.
 */
async function probarAlta(
    subcuenta: Subcuenta,
    objeto: string,
    properties: Record<string, string>
) {
    const locationId = getLocationId(subcuenta);

    const creado = await intentar(`Crear registro de prueba en ${objeto}`, () =>
        saFetch(subcuenta, `/objects/${objeto}/records`, {
            method: "POST",
            body: JSON.stringify({ locationId, properties }),
        })
    );

    if (!creado) return;

    const id: string | undefined = creado.record?.id;

    if (!id) {
        fail(`${objeto}: el POST no devolvió record.id. Respuesta: ${JSON.stringify(creado)}`);
        return;
    }

    ok(`${objeto}: registro creado (${id})`);

    const leido = await intentar(`Releer el registro ${id}`, () =>
        saFetch(subcuenta, `/objects/${objeto}/records/${id}`)
    );

    if (leido) {
        const guardadas = (leido.record?.properties ?? {}) as Record<string, unknown>;

        for (const [clave, valorEnviado] of Object.entries(properties)) {
            const valorGuardado = guardadas[clave];

            if (valorGuardado === undefined) {
                // Este es el fallo silencioso que buscamos: 200 al crear y la
                // propiedad vacía en el registro.
                fail(`${objeto}.${clave}: se envió "${valorEnviado}" y el registro no la tiene`);
            } else if (String(valorGuardado).trim() !== valorEnviado) {
                warn(`${objeto}.${clave}: enviado "${valorEnviado}", guardado "${String(valorGuardado)}"`);
            } else {
                ok(`${objeto}.${clave} persiste correctamente`);
            }
        }
    }

    const borrado = await intentar(`Borrar el registro de prueba ${id}`, () =>
        saFetch(subcuenta, `/objects/${objeto}/records/${id}`, { method: "DELETE" })
    );

    if (borrado) ok(`${objeto}: registro de prueba borrado`);
    else huerfanos.push(`${subcuenta} · ${objeto} · ${id}`);
}

async function probarSubcuenta(subcuenta: Subcuenta) {
    titulo(`Subcuenta: ${subcuenta}`);

    try {
        getLocationId(subcuenta);
    } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
        return;
    }

    console.log("\n  -- Esquema --");
    await verificarEsquema(subcuenta, OBJETO_ADMINISTRADOR, Object.keys(PROP_ADMINISTRADOR));
    await verificarEsquema(subcuenta, OBJETO_COMUNIDAD, Object.keys(PROP_COMUNIDAD));

    console.log("\n  -- Alta real (crea y borra) --");
    const sello = Date.now();

    await probarAlta(subcuenta, OBJETO_ADMINISTRADOR, {
        ...PROP_ADMINISTRADOR,
        nombre_del_despacho: `${PROP_ADMINISTRADOR.nombre_del_despacho}_${sello}`,
    });

    await probarAlta(subcuenta, OBJETO_COMUNIDAD, {
        ...PROP_COMUNIDAD,
        nombre_direcci_n: `${PROP_COMUNIDAD.nombre_direcci_n}_${sello}`,
    });
}

async function main() {
    const argumento = process.argv[2]?.toLowerCase();

    const subcuentas: Subcuenta[] =
        argumento === "scala"
            ? ["scala-valencia"]
            : argumento === "vertical"
              ? ["vertical-projects"]
              : ["scala-valencia", "vertical-projects"];

    console.log("Verificacion de alta de administradores y comunidades");
    console.log("ESCRIBE EN GHL: crea un registro de prueba por objeto y lo borra.");

    for (const subcuenta of subcuentas) {
        await probarSubcuenta(subcuenta);
    }

    if (huerfanos.length) {
        titulo("Registros de prueba NO borrados");
        console.log("  Borralos a mano desde GHL:");
        for (const h of huerfanos) console.log(`  - ${h}`);
    }

    titulo("Resultado");
    console.log(`  bloqueantes: ${bloqueantes}`);
    console.log(`  avisos:      ${avisos}\n`);

    process.exit(bloqueantes > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});