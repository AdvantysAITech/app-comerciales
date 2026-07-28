import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
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