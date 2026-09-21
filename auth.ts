import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { SubcuentaSlug } from "@/lib/subcuenta";
import type { Rol } from "@/lib/roles";

type UsuarioConfigurado = {
  email?: string;
  passwordHashB64?: string;
  nombre: string;
  rol: Rol;
  subcuenta: SubcuentaSlug;
  /**
   * Id de este usuario DENTRO de GHL. Es lo que se manda como `assignedTo` al
   * crear una oportunidad, y lo que permite que los workflows del CRM sepan a
   * quién avisar.
   *
   * Va por variable de entorno como las credenciales: es un dato de
   * parametrización de la subcuenta, no del código, y cambia al replicar el
   * snapshot. Si falta, la oportunidad se crea SIN propietario -- que es lo que
   * pasaba hasta ahora -- y queda constancia en el log.
   */
  usuarioGhl?: string;
};

const USUARIOS: UsuarioConfigurado[] = [
  {
    email: process.env.JOSE_EMAIL,
    passwordHashB64: process.env.JOSE_PASSWORD_HASH_B64,
    nombre: "Jose Garcia",
    rol: "comercial",
    subcuenta: "scala-valencia",
    usuarioGhl: process.env.JOSE_GHL_USER_ID,
  },
  {
    email: process.env.TONI_EMAIL,
    passwordHashB64: process.env.TONI_PASSWORD_HASH_B64,
    nombre: "Toni Yañez",
    rol: "comercial",
    subcuenta: "vertical-projects",
    usuarioGhl: process.env.TONI_GHL_USER_ID,
  },
  {
    // DERCAS 9.1: Miguel es perfil Direccion con acceso multi-subcuenta.
    // De momento solo Scala Valencia: desviacion consciente, pendiente de consolidar.
    email: process.env.MIGUEL_EMAIL,
    passwordHashB64: process.env.MIGUEL_PASSWORD_HASH_B64,
    nombre: "Miguel",
    rol: "direccion",
    subcuenta: "scala-valencia",
    usuarioGhl: process.env.MIGUEL_GHL_USER_ID,
  },
];

function normalizar(email: string) {
  return email.trim().toLowerCase();
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!email || !password) return null;

        const usuario = USUARIOS.find(
          (u) => u.email && normalizar(u.email) === normalizar(email)
        );
        if (!usuario?.passwordHashB64) return null;

        const passwordHash = Buffer.from(usuario.passwordHashB64, "base64").toString("utf-8");
        const passwordValida = await bcrypt.compare(password, passwordHash);
        if (!passwordValida) return null;

        return {
          id: usuario.email!,
          email: usuario.email,
          name: usuario.nombre,
          rol: usuario.rol,
          subcuenta: usuario.subcuenta,
          usuarioGhl: usuario.usuarioGhl?.trim() || null,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.subcuenta = user.subcuenta;
        token.rol = user.rol;
        token.usuarioGhl = user.usuarioGhl ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.subcuenta = token.subcuenta;
        session.user.rol = token.rol;
        session.user.usuarioGhl = token.usuarioGhl ?? null;
      }
      return session;
    },
  },
});