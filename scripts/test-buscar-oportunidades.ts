import { config } from "dotenv";
config({ path: ".env.local" });

import { buscarOportunidadesAbiertas } from "@/lib/ghl/oportunidades";

async function main() {
    const resultado = await buscarOportunidadesAbiertas(
        "scala-valencia",
        "dEZqLNQCSJrZR1HXFEvv",
        ["4d3b0cf1-c995-4fa4-9cac-bcde44b24d62"]
    );
    console.log(JSON.stringify(resultado, null, 2));
}

main().catch((error) => {
    console.error("ERROR", error);
    process.exit(1);
});