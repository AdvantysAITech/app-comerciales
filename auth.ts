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
  /**
   * Subcuentas a las que este usuario puede entrar, en orden. La primera es la
   * que ve al iniciar sesión.
   *
   * DERCAS 9.1: dirección y administración son perfiles MULTI-SUBCUENTA y
   * entran "en cada una de forma independiente" con su propio login; los
   * comerciales tienen exactamente una. Por eso es una lista y no un valor
   * suelto, y por eso la subcuenta que está viendo en cada momento no se
   * guarda aquí sino en una cookie (lib/sesion.ts): el token se firma al hacer
   * login y tendría que reemitirse en cada conmutación.
   *
   * El criterio de aceptación 1 del DERCAS (aislamiento entre subcuentas) se
   * sigue respetando: se mira UNA subcuenta cada vez, nunca las dos juntas.
   */
  subcuentas: SubcuentaSlug[];
  /**
   * Id de este usuario DENTRO de GHL, por subcuenta. Es lo que se manda como
   * `assignedTo` al crear una oportunidad, lo que permite que los workflows del
   * CRM sepan a quién avisar y lo que decide qué oportunidades ve un comercial.
   *
   * POR SUBCUENTA (23/09/2026): un usuario de GHL puede existir solo en una
   * location, o tener un usuario distinto en cada una. Con Toni entrando en
   * Scala, mandar a Scala su id de Vertical daba 400 "Invalid assigned to
   * user" y el presupuesto no se guardaba. Ver `idsGhlPorSubcuenta`.
   */
  usuariosGhl: Partial<Record<SubcuentaSlug, string>>;
};

/** Sufijo de la variable de entorno de cada subcuenta. */
const SUFIJO_SUBCUENTA: Record<SubcuentaSlug, string> = {
  "scala-valencia": "SCALA",
  "vertical-projects": "VERTICAL",
};

/**
 * Ids de GHL de un usuario en cada una de sus subcuentas.
 *
 * Por cada subcuenta se busca primero `<PREFIJO>_GHL_USER_ID_<SCALA|VERTICAL>`
 * y, si no existe, `<PREFIJO>_GHL_USER_ID` (la variable de siempre). Así las
 * configuraciones actuales siguen funcionando igual y solo hay que añadir la
 * variable con sufijo cuando el usuario tiene un id distinto en otra subcuenta.
 */
function idsGhlPorSubcuenta(
  prefijo: string,
  subcuentas: readonly SubcuentaSlug[]
): Partial<Record<SubcuentaSlug, string>> {
  const ids: Partial<Record<SubcuentaSlug, string>> = {};
  for (const subcuenta of subcuentas) {
    const id =
      process.env[`${prefijo}_GHL_USER_ID_${SUFIJO_SUBCUENTA[subcuenta]}`]?.trim() ||
      process.env[`${prefijo}_GHL_USER_ID`]?.trim();
    if (id) ids[subcuenta] = id;
  }
  return ids;
}

const USUARIOS: UsuarioConfigurado[] = [
  {
    email: process.env.JOSE_EMAIL,
    passwordHashB64: process.env.JOSE_PASSWORD_HASH_B64,
    nombre: "Jose Garcia",
    rol: "comercial",
    subcuentas: ["scala-valencia"],
    usuariosGhl: idsGhlPorSubcuenta("JOSE", ["scala-valencia"]),
  },
  {
    email: process.env.TONI_EMAIL,
    passwordHashB64: process.env.TONI_PASSWORD_HASH_B64,
    nombre: "Toni Yañez",
    rol: "comercial",
    // Excepcion al DERCAS 9.1 (decision de Jacob, 23/09/2026): Toni es
    // comercial pero trabaja las dos empresas, asi que tiene el mismo selector
    // de subcuenta que Miguel. Vertical va primero: es la que ve al entrar.
    // Sigue siendo perfil comercial: no valida presupuestos ni toca comisiones.
    subcuentas: ["vertical-projects", "scala-valencia"],
    // TONI_GHL_USER_ID_SCALA: su id en la subcuenta de Scala, si es distinto
    // del de Vertical. Sin ella se usa TONI_GHL_USER_ID en las dos.
    usuariosGhl: idsGhlPorSubcuenta("TONI", ["vertical-projects", "scala-valencia"]),
  },
  {
    // DERCAS 9.1: Miguel es perfil Direccion con acceso multi-subcuenta.
    // Escala + Vertical. Advisor queda fuera: la subcuenta no existe todavia
    // (Fase 4), y anadirla aqui antes de tiempo rompe el selector con una
    // subcuenta sin IDs ni credenciales.
    email: process.env.MIGUEL_EMAIL,
    passwordHashB64: process.env.MIGUEL_PASSWORD_HASH_B64,
    nombre: "Miguel",
    rol: "direccion",
    subcuentas: ["scala-valencia", "vertical-projects"],
    usuariosGhl: idsGhlPorSubcuenta("MIGUEL", ["scala-valencia", "vertical-projects"]),
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
          subcuentas: usuario.subcuentas,
          usuariosGhl: usuario.usuariosGhl,
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
        token.subcuentas = user.subcuentas;
        token.rol = user.rol;
        token.usuariosGhl = user.usuariosGhl ?? {};
      }

      /**
       * Los permisos se releen de la configuracion en cada renovacion del
       * token, no solo al hacer login.
       *
       * Sin esto, ampliar las subcuentas de alguien (justo lo que se acaba de
       * hacer con Miguel) no tendria efecto hasta que cerrase sesion: su JWT
       * seguiria trayendo la lista antigua, y nadie le va a pedir que cierre
       * sesion porque desde fuera parece que la app "no ha cogido el cambio".
       */
      const email = typeof token.email === "string" ? token.email : null;
      const configurado = email
        ? USUARIOS.find((u) => u.email && normalizar(u.email) === normalizar(email))
        : null;

      if (configurado) {
        token.subcuentas = configurado.subcuentas;
        token.rol = configurado.rol;
        token.usuariosGhl = configurado.usuariosGhl;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.subcuentas = token.subcuentas ?? [];
        session.user.rol = token.rol;
        session.user.usuariosGhl = token.usuariosGhl ?? {};
      }
      return session;
    },
  },
});