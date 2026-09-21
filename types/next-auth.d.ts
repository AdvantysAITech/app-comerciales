import { DefaultSession } from "next-auth";
import { JWT as DefaultJWT } from "next-auth/jwt";
import type { SubcuentaSlug } from "@/lib/subcuentas";
import type { Rol } from "@/lib/roles";

declare module "next-auth" {
    interface User {
        subcuenta: SubcuentaSlug;
        rol: Rol;
        /** Id del usuario en GHL. Se manda como `assignedTo` al crear oportunidades. */
        usuarioGhl?: string | null;
    }

    interface Session {
        user: {
            subcuenta: SubcuentaSlug;
            rol: Rol;
            usuarioGhl?: string | null;
        } & DefaultSession["user"];
    }
}

declare module "next-auth/jwt" {
    interface JWT extends DefaultJWT {
        subcuenta: SubcuentaSlug;
        rol: Rol;
        usuarioGhl?: string | null;
    }
}