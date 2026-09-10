import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,

  /**
   * `@resvg/resvg-js` es un binario nativo (.node): el bundler no puede
   * empaquetarlo y hay que dejarlo como require externo. Sin esto, la ruta de
   * estado falla al importar el rasterizador.
   *
   * `dejavu-fonts-ttf` va aquí por el mismo motivo: son .ttf, y Turbopack no
   * sabe qué hacer con ellos ("Unknown module type"). Se quedan fuera del
   * bundle y se leen del disco en tiempo de ejecución.
   */
  serverExternalPackages: ["@resvg/resvg-js", "dejavu-fonts-ttf"],

  /**
   * Los .ttf de la portada no los ve el trazador de dependencias: se resuelven
   * en tiempo de ejecución con `require.resolve`, no con un import estático. Sin
   * incluirlos a mano, en Vercel no se despliegan y la portada sale SIN TEXTO,
   * con un PNG perfectamente válido y en blanco.
   */
  outputFileTracingIncludes: {
    "/api/documentos/estado/**": ["./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans*.ttf"],
  },

  experimental: {
    serverActions: {
      // Next.js compara el host del header `origin` (no el de x-forwarded-host)
      // contra esta lista. En Codespaces el navegador manda origin=localhost:3000
      // aunque se acceda por la URL *.app.github.dev, así que es ESTE valor el
      // que hay que permitir aquí.
      allowedOrigins: ["localhost:3000"],
    },
  },
};

export default nextConfig;