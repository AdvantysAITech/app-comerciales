/**
 * scripts/propuesta/probar-propuesta.ts
 *
 * Correcciones del flujo de propuesta por IA (28/09/2026).
 *
 *   npm run propuesta:probar
 *
 * Qué garantiza:
 *  1. Los números que la IA devuelve como texto se leen bien ("12.5" -> 12,5).
 *  2. Vertical Projects no recibe partidas de amianto: ni candidatas de la
 *     tarifa, ni resultado de CYPE, ni pasa la validación del servidor.
 *     Scala Valencia sí.
 *  3. Una partida repetida con precios distintos no se deja crear; con el mismo
 *     precio, el documento suma lo mismo que la pantalla de revisión.
 *  4. El cambio de unidad de dirección se aplica a las partidas de la IA.
 *  5. El aviso de amianto viaja en el payload de la propuesta.
 *  6. Más de 200 partidas es un error, no un recorte silencioso.
 *
 * Sin GHL, sin Anthropic, sin Upstash.
 */
import { candidatasTarifa, sanearExtraccion, validarCype } from "../../lib/propuesta/generar";
import { validarPropuesta } from "../../lib/propuesta/validar";
import { conflictosDeCodigo } from "../../lib/propuesta/conflictos";
import { presupuestarConAjustes } from "../../lib/documentos/mapeo-capitulos";
import { listarPartidas } from "../../lib/documentos/tarifa";
import { construirPayload } from "../../lib/visita/payload";
import { getModulos } from "../../lib/catalogo";
import type { LineaPropuesta, Propuesta } from "../../lib/propuesta/tipos";
import { textoMencionaAmianto } from "../../lib/catalogo/licencias";
import type { AjustesPresupuesto } from "../../lib/documentos/ajustes";

let fallos = 0;
function comprobar(condicion: boolean, mensaje: string) {
    console.log(`${condicion ? "OK  " : "FALLO"} ${mensaje}`);
    if (!condicion) fallos++;
}

const SCALA = "scala-valencia";
const VERTICAL = "vertical-projects";
const partida = listarPartidas().find((p) => !p.codigo.startsWith("AMI"))!;
const amianto = listarPartidas().find((p) => p.codigo === "AMI002")!;

function linea(parcial: Partial<LineaPropuesta> & Pick<LineaPropuesta, "id" | "moduloKey">): LineaPropuesta {
    return {
        textoOriginal: "",
        codigo: partida.codigo,
        origen: "tarifa",
        descripcionCorta: partida.descripcionCorta,
        descripcionLarga: null,
        unidad: partida.unidad,
        cantidad: 1,
        precioUnitario: partida.tarifaEmpresa,
        precioReferencia: partida.tarifaEmpresa,
        precioCype: null,
        capitulo: partida.capitulo,
        url: null,
        aviso: null,
        ...parcial,
    };
}
const propuesta = (lineas: LineaPropuesta[]): Propuesta => ({ generadaEn: "", lineas, observaciones: [], sugerencias: [] });

// 1. Números en texto -------------------------------------------------------
{
    const r = sanearExtraccion(
        {
            trabajos: [
                {
                    moduloKey: "m",
                    accion: "pintar",
                    elemento: "fachada",
                    cantidad: "12.5" as unknown as number,
                    medicionTotal: "1.250,5" as unknown as number,
                    porcentaje: "15,5" as unknown as number,
                },
            ],
        },
        [{ key: "m", label: "M", dictado: "x" }]
    );
    const t = r.trabajos[0];
    comprobar(t.cantidad === 12.5, `"12.5" -> ${t.cantidad} (antes 125)`);
    comprobar(t.medicionTotal === 1250.5, `"1.250,5" -> ${t.medicionTotal}`);
    comprobar(t.porcentaje === 15.5, `"15,5" -> ${t.porcentaje}`);
}

// 2. Licencias ---------------------------------------------------------------
{
    const trabajo = { accion: "retirada", elemento: "placas fibrocemento cubierta", detalle: "amianto" };
    const enVertical = candidatasTarifa(trabajo, VERTICAL);
    const enScala = candidatasTarifa(trabajo, SCALA);
    comprobar(!enVertical.some((p) => p.codigo.startsWith("AMI")), "Vertical: ninguna candidata AMI de la tarifa");
    comprobar(enScala.some((p) => p.codigo.startsWith("AMI")), "Scala: sí recibe candidatas AMI");

    const sinAmianto = { accion: "retirada", elemento: "terrazo y tela asfáltica de cubierta", detalle: "suelo flotante sobre plots" };
    comprobar(
        !candidatasTarifa(sinAmianto, SCALA).some((p) => p.codigo.startsWith("AMI")),
        "Scala: 'retirada de cubierta' sin mencionar amianto no recibe candidatas AMI"
    );

    const conAmianto = propuesta([
        linea({ id: "a", moduloKey: "m", codigo: amianto.codigo, capitulo: amianto.capitulo, unidad: amianto.unidad }),
    ]);
    comprobar(!validarPropuesta(conAmianto, ["m"], VERTICAL).ok, "Vertical: el servidor rechaza AMI002");
    comprobar(validarPropuesta(conAmianto, ["m"], SCALA).ok, "Scala: el servidor acepta AMI002");

    const cypeFibro = propuesta([
        linea({
            id: "b",
            moduloKey: "m",
            codigo: "DQC010",
            origen: "cype",
            descripcionCorta: "Levantado de cobertura de placas de fibrocemento",
            capitulo: "03",
        }),
    ]);
    comprobar(!validarPropuesta(cypeFibro, ["m"], VERTICAL).ok, "Vertical: el servidor rechaza una partida CYPE de fibrocemento");

    const cype = validarCype(
        {
            encontrado: true,
            codigo: "DQC010",
            precio: "12,34",
            unidad: "m²",
            url: "https://www.generadordeprecios.info/rehabilitacion/x.html",
            descripcionCorta: "Retirada de placas de fibrocemento con amianto",
            capitulo: "03",
        },
        { texto: "DQC010 ... 12,34 €", urls: [] },
        "03",
        VERTICAL
    );
    comprobar(!cype.encontrado, "Vertical: un resultado de CYPE con amianto se descarta");
}

// 2b. Menciones que niegan el amianto ------------------------------------------
{
    comprobar(textoMencionaAmianto("retirar bajante de fibrocemento"), "'bajante de fibrocemento' es amianto");
    comprobar(!textoMencionaAmianto("sustituir bajante de PVC, no de uralita"), "'no de uralita' no es amianto");
    comprobar(!textoMencionaAmianto("mortero sin amianto"), "'sin amianto' no es amianto");
    comprobar(!textoMencionaAmianto("pintar la primera planta"), "'primera' no dispara RERA");
}

// 3. Misma partida con dos precios ---------------------------------------------
{
    const distintos = propuesta([
        linea({ id: "a", moduloKey: "m1", cantidad: 2, precioUnitario: 10 }),
        linea({ id: "b", moduloKey: "m2", cantidad: 3, precioUnitario: 20 }),
    ]);
    comprobar(conflictosDeCodigo(distintos.lineas).length === 1, "Detecta la misma partida con dos precios");
    comprobar(!validarPropuesta(distintos, ["m1", "m2"], SCALA).ok, "El servidor no deja crearla");

    const iguales = propuesta([
        linea({ id: "a", moduloKey: "m1", cantidad: 2, precioUnitario: 10 }),
        linea({ id: "b", moduloKey: "m2", cantidad: 3, precioUnitario: 10 }),
    ]);
    const v = validarPropuesta(iguales, ["m1", "m2"], SCALA);
    comprobar(v.ok, "Con el mismo precio se acepta");
    if (v.ok) {
        const modulos = getModulos(SCALA).slice(0, 2);
        const lineas = v.propuesta.lineas.map((l, i) => ({ ...l, moduloKey: modulos[i].key }));
        const payload = construirPayload({
            subcuenta: SCALA,
            empresa: "Scala",
            comercial: "Prueba",
            comunidadId: null,
            comunidadNombre: "C",
            comunidadCreada: false,
            administradorId: null,
            administradorNombre: null,
            contacto: "x",
            telefono: "600000000",
            fechaVisita: "2026-09-28",
            observaciones: "",
            modulosElegidos: modulos.map((m) => m.key),
            seleccion: {},
            fotosPorModulo: {},
            propuesta: { ...v.propuesta, lineas },
        } as Parameters<typeof construirPayload>[0]);
        const r = presupuestarConAjustes(payload, null);
        const l = r.capitulos.flatMap((c) => c.lineas).find((x) => x.codigo === partida.codigo)!;
        comprobar(Math.abs(l.importe - 50) < 0.001, `Documento = revisión: 5 x 10 = ${l.importe} €`);

        // 4. Unidad de dirección sobre una partida de la IA
        const nativa = l.unidadNativa;
        const otra = nativa === "ud" ? "m²" : "ud";
        const ajustes = {
            autor: "prueba",
            actualizadoEn: "2026-09-28",
            lineas: { [partida.codigo]: { unidad: otra } },
            anadidas: [],
        } as unknown as AjustesPresupuesto;
        const r2 = presupuestarConAjustes(payload, ajustes);
        const l2 = r2.capitulos.flatMap((c) => c.lineas).find((x) => x.codigo === partida.codigo)!;
        comprobar(l2.unidad === otra, `Dirección cambia la unidad a "${otra}": se imprime "${l2.unidad}"`);
    }
}

// 5. Aviso de amianto en el payload ------------------------------------------------
{
    const modulo = getModulos(SCALA)[0];
    const payload = construirPayload({
        subcuenta: SCALA,
        empresa: "Scala",
        comercial: "Prueba",
        comunidadId: null,
        comunidadNombre: "C",
        comunidadCreada: false,
        administradorId: null,
        administradorNombre: null,
        contacto: "x",
        telefono: "600000000",
        fechaVisita: "2026-09-28",
        observaciones: "",
        modulosElegidos: [modulo.key],
        seleccion: {},
        fotosPorModulo: {},
        propuesta: propuesta([
            linea({ id: "a", moduloKey: modulo.key, codigo: amianto.codigo, capitulo: amianto.capitulo }),
        ]),
    } as Parameters<typeof construirPayload>[0]);
    comprobar(payload.modulos[0].alertas.length === 1, "El payload lleva el aviso de amianto");
}

// 6. Más de 200 partidas -------------------------------------------------------------
{
    const muchas = propuesta(
        Array.from({ length: 201 }, (_, i) =>
            linea({ id: `l${i}`, moduloKey: "m", codigo: `MAN-${String(i).padStart(4, "0")}`, origen: "manual", capitulo: "03" })
        )
    );
    comprobar(!validarPropuesta(muchas, ["m"], SCALA).ok, "201 partidas: error en vez de recorte silencioso");
}

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
