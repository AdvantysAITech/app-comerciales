/**
 * Genera el valor de *_PASSWORD_HASH_B64 para .env.local
 *
 * Uso:
 *   node scripts/generar-hash.mjs           -> pregunta usuario y contrasena
 *   node scripts/generar-hash.mjs JOSE      -> pregunta solo la contrasena
 *
 * Por que Base64: el hash de bcrypt empieza por $2b$ y dotenv interpreta el $
 * como expansion de variable, asi que el valor llegaria mutilado a auth.ts. Se
 * codifica en Base64 al escribirlo y auth.ts lo decodifica antes de comparar.
 *
 * La contrasena no se muestra al teclearla ni se pasa por argumento: iria a
 * parar al historial de PowerShell en claro.
 */

import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import bcrypt from "bcryptjs";

const RONDAS = 10;
const USUARIOS = ["JOSE", "TONI", "MIGUEL"];

/** Salida que se puede silenciar, para no imprimir la contrasena mientras se teclea. */
class SalidaSilenciable extends Writable {
    constructor() {
        super();
        this.silenciada = false;
    }
    _write(trozo, codificacion, siguiente) {
        if (!this.silenciada) process.stdout.write(trozo, codificacion);
        siguiente();
    }
}

const salida = new SalidaSilenciable();
const rl = createInterface({ input: process.stdin, output: salida, terminal: true });

// Cola de lineas en vez de rl.question: asi el script funciona igual escribiendo
// a mano que con la entrada canalizada, que es como se puede probar sin teclear.
const lineasPendientes = [];
const esperando = [];
let cerrado = false;

rl.on("line", (linea) => {
    const resolver = esperando.shift();
    if (resolver) resolver(linea);
    else lineasPendientes.push(linea);
});

rl.on("close", () => {
    cerrado = true;
    while (esperando.length) esperando.shift()(null);
});

function leerLinea() {
    if (lineasPendientes.length) return Promise.resolve(lineasPendientes.shift());
    if (cerrado) return Promise.resolve(null);
    return new Promise((resolver) => esperando.push(resolver));
}

async function preguntar(texto) {
    process.stdout.write(texto);
    const respuesta = await leerLinea();
    return respuesta ?? "";
}

async function preguntarOculto(texto) {
    process.stdout.write(texto);
    salida.silenciada = true;
    const respuesta = await leerLinea();
    salida.silenciada = false;
    process.stdout.write("\n");
    return respuesta ?? "";
}

function abortar(mensaje) {
    console.error(`\n${mensaje}`);
    rl.close();
    process.exitCode = 1;
}

async function main() {
    let usuario = (process.argv[2] ?? "").toUpperCase();

    if (!usuario) {
        console.log(`Usuarios disponibles: ${USUARIOS.join(", ")}`);
        usuario = (await preguntar("Usuario: ")).trim().toUpperCase();
    }

    if (!USUARIOS.includes(usuario)) {
        return abortar(`Usuario desconocido: "${usuario}". Esperaba uno de: ${USUARIOS.join(", ")}`);
    }

    const password = await preguntarOculto(`Contrasena para ${usuario}: `);
    if (password.length < 8) return abortar("La contrasena debe tener al menos 8 caracteres.");

    // Se pide dos veces a proposito: un hash no se puede revertir, asi que una
    // errata al teclear se descubre cuando el comercial no puede entrar.
    const repeticion = await preguntarOculto("Repite la contrasena: ");
    if (password !== repeticion) return abortar("Las contrasenas no coinciden. No se ha generado nada.");

    const hash = await bcrypt.hash(password, RONDAS);
    const hashB64 = Buffer.from(hash, "utf-8").toString("base64");

    // Comprobacion del viaje completo: se decodifica el Base64 y se valida la
    // contrasena contra el hash resultante, exactamente igual que hace auth.ts.
    const hashRecuperado = Buffer.from(hashB64, "base64").toString("utf-8");
    const valida = await bcrypt.compare(password, hashRecuperado);

    if (!valida) return abortar("La verificacion ha fallado. No uses este valor.");

    console.log("\nVerificacion correcta. Pega esta linea en .env.local:\n");
    console.log(`${usuario}_PASSWORD_HASH_B64=${hashB64}`);
    console.log("");

    rl.close();
}

main();