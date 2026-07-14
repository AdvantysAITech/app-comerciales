import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

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

        const usuarios = [
          {
            email: process.env.JOSE_EMAIL,
            passwordHash: process.env.JOSE_PASSWORD_HASH_B64
              ? Buffer.from(process.env.JOSE_PASSWORD_HASH_B64, "base64").toString("utf-8")
              : undefined,
            nombre: "Jose Garcia",
            subcuenta: "scala-valencia",
          },
          {
            email: process.env.TONI_EMAIL,
            passwordHash: process.env.TONI_PASSWORD_HASH_B64
              ? Buffer.from(process.env.TONI_PASSWORD_HASH_B64, "base64").toString("utf-8")
              : undefined,
            nombre: "Toni Yañez",
            subcuenta: "vertical-projects",
          },
        ];

        const usuario = usuarios.find((u) => u.email === email);
        if (!usuario || !usuario.passwordHash) return null;

        const passwordValida = await bcrypt.compare(password, usuario.passwordHash);
        if (!passwordValida) return null;

        return {
          id: usuario.email!,
          email: usuario.email,
          name: usuario.nombre,
          subcuenta: usuario.subcuenta,
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
        }
        return token;
    },
    async session({ session, token }) {
        if (session.user) {
            session.user.subcuenta = token.subcuenta as string;
        }
        return session;
    }
  }
});