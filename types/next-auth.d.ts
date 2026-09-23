import { DefaultSession } from "next-auth";
import { JWT as DefaultJWT } from "next-auth/jwt";
import type { SubcuentaSlug } from "@/lib/subcuenta";
import type { Rol } from "@/lib/roles";

declare module "next-auth" {
    interface User {
        /**
         * Subcuentas a las que este usuario tiene acceso.
         *
         * DERCAS 9.1: los perfiles de dirección y administración entran en
         * varias subcuentas con su propio login. Los comerciales tienen una
         * sola. Cuál está mirando AHORA MISMO no vive aquí sino en la cookie
         * de subcuenta activa (lib/sesion.ts): el token se emite al hacer
         * login y no puede cambiar en cada conmutación.
         */
        subcuentas: SubcuentaSlug[];
        rol: Rol;
        /**
         * Id del usuario en GHL POR SUBCUENTA. Se manda como `assignedTo` al
         * crear oportunidades. Es por subcuenta porque un usuario de GHL dado
         * de alta solo en una location tiene otro id (o ninguno) en la otra.
         */
        usuariosGhl?: Partial<Record<SubcuentaSlug, string>>;
    }

    interface Session {
        user: {
            subcuentas: SubcuentaSlug[];
            rol: Rol;
            usuariosGhl?: Partial<Record<SubcuentaSlug, string>>;
        } & DefaultSession["user"];
    }
}

declare module "next-auth/jwt" {
    interface JWT extends DefaultJWT {
        subcuentas: SubcuentaSlug[];
        rol: Rol;
        usuariosGhl?: Partial<Record<SubcuentaSlug, string>>;
    }
}
