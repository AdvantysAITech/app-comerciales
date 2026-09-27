import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env.development.local" });

import { Redis } from "@upstash/redis";

/**
 * scripts/borradores/probar-conexion.ts
 *
 *   npm run borradores:probar
 *
 * Comprueba que la app llega a la base de datos de borradores (Upstash Redis)
 * con las variables de .env.local. Escribe una clave de prueba, la lee y la
 * borra. No toca ningún borrador real. Después cuenta los borradores que hay
 * guardados por subcuenta.
 */

async function main() {
    const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

    if (!url || !token) {
        console.error(
            "✗ Faltan las variables. Añade a .env.local KV_REST_API_URL y KV_REST_API_TOKEN\n" +
                "  (Vercel → Storage → app-comerciales-borradores → .env.local → Show secret)."
        );
        process.exit(1);
    }

    console.log(`· Conectando a ${new URL(url).host} ...`);
    const redis = new Redis({ url, token });

    const clave = `prueba-conexion:${Date.now()}`;
    await redis.set(clave, { ok: true }, { ex: 60 });
    const leido = await redis.get<{ ok: boolean }>(clave);
    await redis.del(clave);

    if (!leido?.ok) {
        console.error("✗ Se ha escrito pero no se ha podido leer. Revisa que el token no sea el de solo lectura.");
        process.exit(1);
    }
    console.log("✓ Escritura, lectura y borrado correctos.");

    for (const subcuenta of ["scala-valencia", "vertical-projects"]) {
        const n = await redis.zcard(`borradores:${subcuenta}`);
        console.log(`· Borradores guardados en ${subcuenta}: ${n}`);
    }
}

main().catch((error) => {
    console.error("✗ Error al conectar:", error instanceof Error ? error.message : error);
    process.exit(1);
});
