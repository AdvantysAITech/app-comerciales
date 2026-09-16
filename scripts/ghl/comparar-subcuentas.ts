import { config } from "dotenv";
config({ path: ".env.local" });

import { createHash } from "node:crypto";
import { saFetch, getLocationId, type Subcuenta } from "../../lib/ghl/client";
import { CLAVES_ETAPA, idsGhl } from "../../lib/ghl/ids";
import { verificarPlantilla } from "../../lib/documentos/plantillaVerificacion";

/**
 * scripts/ghl/comparar-subcuentas.ts
 *
 *   npm run ghl:comparar
 *
 * SOLO LECTURA. No escribe nada en GHL.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ EXISTE (16/09/2026)
 * ---------------------------------------------------------------------------
 * Vertical se creó con el snapshot de Scala. El snapshot copia la ESTRUCTURA
 * (pipeline, etapas, custom fields, custom objects, asociaciones), pero GHL
 * asigna IDs nuevos en la location de destino. Los IDs de cada subcuenta viven
 * en lib/ghl/ids.ts.
 *
 * Este script, contra la API real de las dos locations:
 *   1. comprueba las variables de entorno de Vertical;
 *   2. empareja cada ID de Scala (de ids.ts) con su equivalente en Vertical:
 *      etapas por `originId`, campos por `fieldKey`, asociaciones por `key`;
 *   3. comprueba custom objects y claves de propiedad;
 *   4. comprueba la plantilla ODT de Vertical;
 *   5. compara lo encontrado con lo que hay en ids.ts para Vertical.
 *
 * Lánzalo después de cualquier cambio de snapshot y antes de desplegar.
 *
 * Sale con código 1 si falta algo que bloquea activar Vertical.
 */

const SCALA: Subcuenta = "scala-valencia";
const VERTICAL: Subcuenta = "vertical-projects";

let bloqueantes = 0;
let avisos = 0;
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

// ---------------------------------------------------------------------------
// IDs de Scala tal como están hoy en el código
// ---------------------------------------------------------------------------
const IDS_SCALA = idsGhl(SCALA);
const IDS_VERTICAL = idsGhl(VERTICAL);
const PIPELINE_SCALA = IDS_SCALA.pipelineId;
const ETAPAS_SCALA: Record<string, string> = { ...IDS_SCALA.etapas };
const CAMPOS_SCALA: Record<string, string> = { ...IDS_SCALA.campos };
const ASOCIACIONES_SCALA: Record<string, string> = { ...IDS_SCALA.asociaciones };

const OBJETOS: Record<string, string[]> = {
    "custom_objects.comunidades_de_propietarios": [
        "nombre_direcci_n",
        "nmero_de_viviendas",
        "notas_de_acceso",
        "localidad",
        "provincia",
    ],
    "custom_objects.administradores_de_fincas": [
        "nombre_del_despacho",
        "nombre_del_contacto_principal",
        "comisin_pactada",
        "telfono",
        "email",
        "localidad",
        "provincia",
    ],
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
type Json = Record<string, unknown>;

async function leer(subcuenta: Subcuenta, endpoint: string): Promise<Json | null> {
    try {
        return (await saFetch(subcuenta, endpoint)) as Json;
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const scope = /\((401|403)\)/.test(msg) ? " (¿falta scope en el PIT?)" : "";
        warn(`[${subcuenta}] GET ${endpoint.split("?")[0]} -> ${msg.slice(0, 160)}${scope}`);
        return null;
    }
}

const norm = (s: unknown) =>
    String(s ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();

/** "opportunity.modelo_de_negocio" -> "modelo_de_negocio" */
const sufijoClave = (k: unknown) => String(k ?? "").split(".").pop() ?? "";

const mapa: {
    locationId?: string;
    pipelineId?: string;
    etapas: Record<string, string>;
    campos: Record<string, string>;
    campoEstadoDocumento?: string;
    asociaciones: Record<string, string>;
} = { etapas: {}, campos: {}, asociaciones: {} };

// ---------------------------------------------------------------------------
titulo("1. Variables de entorno de Vertical");
// ---------------------------------------------------------------------------
const VARS_VERTICAL = [
    "SA_VERTICAL_API_TOKEN",
    "SA_VERTICAL_LOCATION_ID",
    "SA_VERTICAL_CAMPO_ESTADO_DOCUMENTO",
    "SOLUCIONA_PLANTILLA_VERTICAL_URL",
    "TONI_EMAIL",
    "TONI_PASSWORD_HASH_B64",
];
for (const v of VARS_VERTICAL) {
    if (process.env[v]?.trim()) ok(`${v} definida`);
    else fail(`${v} NO definida en .env.local`);
}
if (process.env.SA_VERTICAL_API_TOKEN && process.env.SA_VERTICAL_API_TOKEN === process.env.SA_SCALA_API_TOKEN) {
    fail("SA_VERTICAL_API_TOKEN es el MISMO token que Scala: el PIT es por location, crea uno en la subcuenta de Vertical");
}
if (process.env.SA_VERTICAL_LOCATION_ID && process.env.SA_VERTICAL_LOCATION_ID === process.env.SA_SCALA_LOCATION_ID) {
    fail("SA_VERTICAL_LOCATION_ID es igual al de Scala");
}

// ---------------------------------------------------------------------------
titulo("2. Acceso a las locations");
// ---------------------------------------------------------------------------
let locScala = "";
let locVertical = "";
try {
    locScala = getLocationId(SCALA);
    locVertical = getLocationId(VERTICAL);
    mapa.locationId = locVertical;
} catch (e) {
    fail(e instanceof Error ? e.message : String(e));
}

async function main() {
    if (!locScala || !locVertical) return;

    const locV = await leer(VERTICAL, `/locations/${locVertical}`);
    const nombreV = (locV?.location as Json | undefined)?.name;
    if (locV) ok(`Vertical responde con su PIT: "${nombreV ?? "?"}" (${locVertical})`);
    else fail("El PIT de Vertical no puede leer su location. Revisa token, location ID y scopes");

    // -----------------------------------------------------------------------
    titulo("3. Pipeline y etapas");
    // -----------------------------------------------------------------------
    type Pipeline = { id: string; name: string; originId?: string; stages: { id: string; name: string; originId?: string }[] };
    /** `originId` es el ID de origen del snapshot en Base64. */
    const origen = (b64?: string) => (b64 ? Buffer.from(b64, "base64").toString("utf-8") : "");
    const pS = (await leer(SCALA, `/opportunities/pipelines?locationId=${locScala}`))?.pipelines as Pipeline[] | undefined;
    const pV = (await leer(VERTICAL, `/opportunities/pipelines?locationId=${locVertical}`))?.pipelines as Pipeline[] | undefined;

    const pipeScala = pS?.find((p) => p.id === PIPELINE_SCALA);
    if (!pipeScala) {
        fail(`No encuentro en Scala el pipeline ${PIPELINE_SCALA} del código`);
    } else {
        const pipeVert =
            pV?.find((p) => origen(p.originId) === pipeScala.id) ?? pV?.find((p) => norm(p.name) === norm(pipeScala.name));
        if (!pipeVert) {
            fail(`Vertical no tiene un pipeline llamado "${pipeScala.name}" (tiene: ${pV?.map((p) => p.name).join(", ") || "ninguno"})`);
        } else {
            mapa.pipelineId = pipeVert.id;
            if (pipeVert.id === PIPELINE_SCALA) warn("El pipeline de Vertical tiene el MISMO id que Scala (inesperado en un snapshot)");
            else ok(`Pipeline "${pipeVert.name}": ${PIPELINE_SCALA} -> ${pipeVert.id}`);

            for (const [clave, idScala] of Object.entries(ETAPAS_SCALA)) {
                const etapaS = pipeScala.stages.find((s) => s.id === idScala);
                if (!etapaS) {
                    fail(`Etapa ${clave} (${idScala}) no existe en el pipeline de Scala`);
                    continue;
                }
                const etapaV =
                    pipeVert.stages.find((s) => origen(s.originId) === idScala) ??
                    pipeVert.stages.find((s) => norm(s.name) === norm(etapaS.name));
                if (!etapaV) fail(`Etapa "${etapaS.name}" no existe en Vertical`);
                else {
                    mapa.etapas[clave] = etapaV.id;
                    ok(`Etapa ${clave.padEnd(24)} "${etapaS.name}" -> ${etapaV.id}`);
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    titulo("4. Custom fields de oportunidad");
    // -----------------------------------------------------------------------
    type Campo = { id: string; name: string; fieldKey: string; dataType: string; picklistOptions?: string[] };
    const cS = (await leer(SCALA, `/locations/${locScala}/customFields?model=opportunity`))?.customFields as Campo[] | undefined;
    const cV = (await leer(VERTICAL, `/locations/${locVertical}/customFields?model=opportunity`))?.customFields as Campo[] | undefined;

    const emparejar = (idScala: string): { s?: Campo; v?: Campo } => {
        const s = cS?.find((c) => c.id === idScala);
        if (!s) return {};
        const v =
            cV?.find((c) => sufijoClave(c.fieldKey) === sufijoClave(s.fieldKey)) ??
            cV?.find((c) => norm(c.name) === norm(s.name));
        return { s, v };
    };

    if (cS && cV) {
        for (const [clave, idScala] of Object.entries(CAMPOS_SCALA)) {
            const { s, v } = emparejar(idScala);
            if (!s) {
                fail(`Campo ${clave} (${idScala}) no existe en Scala`);
                continue;
            }
            if (!v) {
                fail(`Campo "${s.name}" (${s.fieldKey}) no existe en Vertical`);
                continue;
            }
            if (v.dataType !== s.dataType) fail(`Campo "${s.name}": tipo ${s.dataType} en Scala y ${v.dataType} en Vertical`);
            mapa.campos[clave] = v.id;
            ok(`Campo ${clave.padEnd(15)} "${s.name}" -> ${v.id}`);

            if (s.picklistOptions?.length) {
                const a = JSON.stringify(s.picklistOptions);
                const b = JSON.stringify(v.picklistOptions ?? []);
                if (a !== b) fail(`Picklist de "${s.name}" distinto: Scala ${a} / Vertical ${b}`);
                else ok(`Picklist de "${s.name}" idéntico (${s.picklistOptions.length} opciones)`);
            }
        }

        const estadoScala = process.env.SA_CAMPO_ESTADO_DOCUMENTO?.trim();
        const estadoVertEnv = process.env.SA_VERTICAL_CAMPO_ESTADO_DOCUMENTO?.trim();
        if (estadoScala) {
            const { s, v } = emparejar(estadoScala);
            if (!s) fail(`SA_CAMPO_ESTADO_DOCUMENTO (${estadoScala}) no existe en Scala`);
            else if (!v) fail(`Vertical no tiene el campo "${s.name}". Si el snapshot no lo trajo, créalo (TEXT, opportunity)`);
            else {
                mapa.campoEstadoDocumento = v.id;
                if (estadoVertEnv === v.id) ok(`SA_VERTICAL_CAMPO_ESTADO_DOCUMENTO correcto (${v.id})`);
                else fail(`SA_VERTICAL_CAMPO_ESTADO_DOCUMENTO vale "${estadoVertEnv ?? ""}" y debe ser ${v.id}`);
            }
        }
    } else {
        fail("No se han podido leer los custom fields. Sin esto no se pueden mapear los 6 campos del código");
    }

    // -----------------------------------------------------------------------
    titulo("5. Custom objects y propiedades");
    // -----------------------------------------------------------------------
    for (const [objeto, props] of Object.entries(OBJETOS)) {
        const esquema = await leer(VERTICAL, `/objects/${objeto}?locationId=${locVertical}`);
        if (!esquema) {
            fail(`Vertical no tiene el custom object ${objeto}`);
            continue;
        }
        ok(`Custom object ${objeto} existe en Vertical`);

        const campos = (esquema.fields as { fieldKey?: string }[] | undefined) ?? [];
        if (campos.length === 0) {
            warn(`${objeto}: la API no devolvió la lista de campos; no puedo verificar las claves de propiedad`);
            continue;
        }
        const claves = new Set(campos.map((c) => sufijoClave(c.fieldKey)));
        for (const p of props) {
            if (claves.has(p)) ok(`${objeto}.${p}`);
            else fail(`${objeto}: falta la propiedad "${p}" (el código la lee con esa clave exacta)`);
        }
    }

    // -----------------------------------------------------------------------
    titulo("6. Asociaciones");
    // -----------------------------------------------------------------------
    type Asoc = { id: string; key: string; firstObjectKey?: string; secondObjectKey?: string };
    const aS = (await leer(SCALA, `/associations/?locationId=${locScala}&skip=0&limit=100`))?.associations as Asoc[] | undefined;
    const aV = (await leer(VERTICAL, `/associations/?locationId=${locVertical}&skip=0&limit=100`))?.associations as Asoc[] | undefined;
    for (const [clave, idScala] of Object.entries(ASOCIACIONES_SCALA)) {
        const s = aS?.find((a) => a.id === idScala);
        if (!s) {
            fail(`Asociación ${clave} (${idScala}) no encontrada en Scala`);
            continue;
        }
        const v = aV?.find((a) => a.key === s.key);
        if (!v) {
            fail(`Vertical no tiene la asociación "${s.key}" (${s.firstObjectKey} -> ${s.secondObjectKey})`);
            continue;
        }
        if (v.firstObjectKey !== s.firstObjectKey || v.secondObjectKey !== s.secondObjectKey) {
            fail(`Asociación "${s.key}": orden de objetos distinto entre subcuentas`);
        }
        mapa.asociaciones[clave] = v.id;
        ok(`Asociación ${clave.padEnd(24)} "${s.key}" -> ${v.id}`);
    }

    // -----------------------------------------------------------------------
    titulo("7. Plantilla ODT de Vertical");
    // -----------------------------------------------------------------------
    const urlV = process.env.SOLUCIONA_PLANTILLA_VERTICAL_URL?.trim();
    const urlS = process.env.SOLUCIONA_PLANTILLA_SCALA_URL?.trim();
    if (urlV) {
        const descargar = async (url: string) => {
            const r = await fetch(url, { cache: "no-store" });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.arrayBuffer();
        };
        try {
            const odtV = await descargar(urlV);
            const u = new Uint8Array(odtV);
            if (u[0] !== 0x50 || u[1] !== 0x4b) {
                fail(`La URL de Vertical no devuelve un ODT (${odtV.byteLength} bytes). ¿Enlace caducado?`);
            } else {
                ok(`Plantilla de Vertical descargada (${Math.round(odtV.byteLength / 1024)} KB)`);
                const informe = verificarPlantilla(odtV);
                const errores = informe.hallazgos.filter((h) => h.nivel === "error");
                if (errores.length === 0) ok("verificarPlantilla sin errores (tokens íntegros, desglose y portada)");
                for (const h of errores) fail(`Plantilla: ${h.mensaje}`);

                if (urlS) {
                    const odtS = await descargar(urlS);
                    const hash = (b: ArrayBuffer) => createHash("sha256").update(new Uint8Array(b)).digest("hex");
                    if (urlS === urlV || hash(odtS) === hash(odtV)) {
                        fail("La plantilla de Vertical es IDÉNTICA a la de Scala: saldría con logo y datos fiscales de Scala");
                    } else {
                        ok("La plantilla de Vertical es distinta de la de Scala");
                        warn("Revisa a ojo logo, razón social, CIF, dirección y condiciones: el script no puede validar el branding");
                    }
                }
            }
        } catch (e) {
            fail(`No se pudo descargar la plantilla de Vertical: ${e instanceof Error ? e.message : e}`);
        }
    }

    // -----------------------------------------------------------------------
    titulo("8. lib/ghl/ids.ts contra la API de Vertical");
    // -----------------------------------------------------------------------
    const contrastar = (etiqueta: string, enCodigo: string, enApi: string | undefined) => {
        if (!enApi) return; // ya reportado arriba
        if (enCodigo === enApi) ok(`${etiqueta} coincide`);
        else fail(`${etiqueta}: ids.ts tiene ${enCodigo} y la API dice ${enApi}`);
    };
    contrastar("pipelineId", IDS_VERTICAL.pipelineId, mapa.pipelineId);
    for (const clave of CLAVES_ETAPA) contrastar(`etapa ${clave}`, IDS_VERTICAL.etapas[clave], mapa.etapas[clave]);
    for (const [clave, id] of Object.entries(IDS_VERTICAL.campos)) contrastar(`campo ${clave}`, id, mapa.campos[clave]);
    for (const [clave, id] of Object.entries(IDS_VERTICAL.asociaciones)) contrastar(`asociación ${clave}`, id, mapa.asociaciones[clave]);

    // -----------------------------------------------------------------------
    titulo("Mapa de IDs de Vertical encontrado en la API");
    // -----------------------------------------------------------------------
    console.log(JSON.stringify(mapa, null, 2));
}

main()
    .catch((e) => fail(`Error inesperado: ${e instanceof Error ? e.stack : e}`))
    .finally(() => {
        console.log(
            bloqueantes === 0
                ? `\n✔ Sin bloqueantes (${avisos} aviso(s)). Pega el mapa de IDs en el chat.\n`
                : `\n✘ ${bloqueantes} bloqueante(s), ${avisos} aviso(s).\n`
        );
        process.exit(bloqueantes === 0 ? 0 : 1);
    });