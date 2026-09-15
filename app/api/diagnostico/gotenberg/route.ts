import { NextResponse, type NextRequest } from "next/server";
import { lookup } from "node:dns/promises";
import { zipSync } from "fflate";
import { auth } from "@/auth";
import { convertirAPdf } from "@/lib/documentos/pdf";
import { leerRegistro } from "@/lib/documentos/estado";
import { esSubcuentaValida } from "@/lib/subcuenta";

/**
 * GET /api/diagnostico/gotenberg
 *
 * Diagnóstico de la conversión a PDF DESDE el entorno donde corre la app.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ (15/09/2026)
 * ---------------------------------------------------------------------------
 * El mismo presupuesto sale en PDF en local y en ODT en Vercel. El código es el
 * mismo, así que la diferencia está en el entorno: variables, red o región. Esto
 * lo comprueba paso a paso desde la propia función de Vercel y devuelve en qué
 * paso se rompe, sin tener que buscar en los logs.
 *
 * Solo dirección. No devuelve contraseñas: solo si existen y si tienen algo
 * raro (espacios o comillas pegadas al copiar).
 *
 * Con `?oportunidad=<id>` devuelve el registro del documento de esa oportunidad:
 * estado, formato y avisos del cierre.
 *
 * Temporal: se borra en cuanto la conversión funcione en producción.
 */

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Paso = { paso: string; ok: boolean; detalle: string; ms?: number };

/** ODT mínimo válido: un párrafo. Suficiente para que LibreOffice lo convierta. */
function odtMinimo(): ArrayBuffer {
    const enc = new TextEncoder();
    const zip = zipSync({
        mimetype: [enc.encode("application/vnd.oasis.opendocument.text"), { level: 0 }],
        "content.xml": [
            enc.encode(
                `<?xml version="1.0" encoding="UTF-8"?>` +
                    `<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ` +
                    `xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.3">` +
                    `<office:body><office:text><text:p>Diagnóstico de conversión</text:p></office:text></office:body>` +
                    `</office:document-content>`
            ),
            { level: 6 },
        ],
        "META-INF/manifest.xml": [
            enc.encode(
                `<?xml version="1.0" encoding="UTF-8"?>` +
                    `<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">` +
                    `<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>` +
                    `<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>` +
                    `</manifest:manifest>`
            ),
            { level: 6 },
        ],
    });
    return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
}

/** Describe un valor sin revelarlo. */
function inspeccionar(valor: string | undefined): string {
    if (valor === undefined) return "NO EXISTE";
    if (valor === "") return "vacía";
    const avisos: string[] = [];
    if (valor !== valor.trim()) avisos.push("espacios al principio o al final");
    if (/^["'].*["']$/.test(valor.trim())) avisos.push("entre comillas");
    return `presente (${valor.length} caracteres)${avisos.length ? ` · OJO: ${avisos.join(", ")}` : ""}`;
}

export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user || session.user.rol !== "direccion") {
        return NextResponse.json({ error: "Solo dirección" }, { status: 403 });
    }

    // ?oportunidad=<id>: devuelve el registro del documento, con el formato y los
    // avisos del cierre (p. ej. por qué salió en ODT). No toca el servidor.
    const oportunidad = request.nextUrl.searchParams.get("oportunidad")?.trim();
    if (oportunidad) {
        const subcuenta = session.user.subcuenta;
        if (!subcuenta || !esSubcuentaValida(subcuenta)) {
            return NextResponse.json({ error: "Sesión sin subcuenta" }, { status: 400 });
        }
        try {
            return NextResponse.json({ oportunidad, registro: await leerRegistro(subcuenta, oportunidad) });
        } catch (error) {
            return NextResponse.json(
                { oportunidad, error: error instanceof Error ? error.message : String(error) },
                { status: 500 }
            );
        }
    }

    const pasos: Paso[] = [];
    const url = process.env.GOTENBERG_URL;

    // 1. Entorno y variables --------------------------------------------------
    pasos.push({
        paso: "entorno",
        ok: true,
        detalle: `VERCEL_ENV=${process.env.VERCEL_ENV ?? "(local)"} · región=${process.env.VERCEL_REGION ?? "(local)"}`,
    });

    const variables = {
        GOTENBERG_URL: inspeccionar(url),
        GOTENBERG_USER: inspeccionar(process.env.GOTENBERG_USER),
        GOTENBERG_PASSWORD: inspeccionar(process.env.GOTENBERG_PASSWORD),
    };
    const faltan = Object.entries(variables).filter(([, v]) => v === "NO EXISTE" || v === "vacía");
    const raras = Object.entries(variables).filter(([, v]) => v.includes("OJO"));
    pasos.push({
        paso: "variables",
        ok: faltan.length === 0 && raras.length === 0,
        detalle: Object.entries(variables)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" | "),
    });

    if (!url?.trim()) return NextResponse.json({ pasos, conclusion: "Falta GOTENBERG_URL en este entorno." });

    // 2. URL y DNS -------------------------------------------------------------
    let host = "";
    try {
        const parsed = new URL(url.trim().replace(/^["']|["']$/g, ""));
        host = parsed.hostname;
        pasos.push({ paso: "url", ok: true, detalle: `${parsed.protocol}//${parsed.host}` });
    } catch {
        pasos.push({ paso: "url", ok: false, detalle: "GOTENBERG_URL no es una URL válida" });
        return NextResponse.json({ pasos, conclusion: "GOTENBERG_URL mal escrita en este entorno." });
    }

    try {
        const inicio = Date.now();
        const direcciones = await lookup(host, { all: true });
        pasos.push({
            paso: "dns",
            ok: true,
            detalle: direcciones.map((d) => d.address).join(", "),
            ms: Date.now() - inicio,
        });
    } catch (error) {
        pasos.push({ paso: "dns", ok: false, detalle: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ pasos, conclusion: `El dominio ${host} no resuelve desde Vercel.` });
    }

    // 3. Alcance de red: /health --------------------------------------------
    try {
        const inicio = Date.now();
        const control = new AbortController();
        const t = setTimeout(() => control.abort(), 10_000);
        const usuario = process.env.GOTENBERG_USER?.trim();
        const password = process.env.GOTENBERG_PASSWORD;
        const respuesta = await fetch(`${url.trim().replace(/\/+$/, "")}/health`, {
            cache: "no-store",
            signal: control.signal,
            headers:
                usuario && password
                    ? { Authorization: `Basic ${Buffer.from(`${usuario}:${password}`).toString("base64")}` }
                    : {},
        }).finally(() => clearTimeout(t));
        const cuerpo = (await respuesta.text()).slice(0, 200);
        pasos.push({
            paso: "health",
            ok: respuesta.ok,
            detalle: `HTTP ${respuesta.status} · ${cuerpo}`,
            ms: Date.now() - inicio,
        });
    } catch (error) {
        const motivo =
            error instanceof Error && error.name === "AbortError"
                ? "sin respuesta en 10 s (¿Security Group de la EC2 cerrado a Vercel?)"
                : error instanceof Error
                  ? `${error.message}${error.cause ? ` · ${String((error.cause as Error).message ?? error.cause)}` : ""}`
                  : String(error);
        pasos.push({ paso: "health", ok: false, detalle: motivo });
        return NextResponse.json({
            pasos,
            conclusion: "Vercel no llega al servidor de conversión. Revisa el Security Group / firewall de la EC2.",
        });
    }

    // 4. Conversión real con un ODT mínimo -----------------------------------
    try {
        const inicio = Date.now();
        const pdf = await convertirAPdf(odtMinimo(), "diagnostico.odt");
        pasos.push({ paso: "conversion", ok: true, detalle: `PDF de ${pdf.byteLength} bytes`, ms: Date.now() - inicio });
    } catch (error) {
        pasos.push({ paso: "conversion", ok: false, detalle: error instanceof Error ? error.message : String(error) });
    }

    const roto = pasos.find((p) => !p.ok);
    return NextResponse.json({
        pasos,
        conclusion: roto ? `Falla en el paso "${roto.paso}".` : "La conversión funciona desde este entorno.",
    });
}