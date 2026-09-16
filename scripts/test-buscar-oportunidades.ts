import { config } from "dotenv";
config({ path: ".env.local" });

import { buscarOportunidadesAbiertas } from "@/lib/ghl/oportunidades";

async function main() {
    const resultado = await buscarOportunidadesAbiertas(
        "scala-valencia",
        "dEZqLNQCSJrZR1HXFEvv",
        ["AVISO_RECIBIDO"]
    );
    console.log(JSON.stringify(resultado, null, 2));
}

main().catch((error) => {
    console.error("ERROR", error);
    process.exit(1);
});