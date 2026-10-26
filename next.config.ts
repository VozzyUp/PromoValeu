import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  // Renderização dinâmica clássica na fase da fatia vertical; reavaliar cacheComponents depois.
  output: "standalone",
  poweredByHeader: false,
  // Os testes (Playwright) abrem o site por 127.0.0.1; sem isto o modo de desenvolvimento bloqueia o JavaScript da página.
  allowedDevOrigins: ["127.0.0.1"],
  // Cliente do Telegram (conta logada) abre conexões TCP próprias: fica fora do empacotamento do servidor.
  serverExternalPackages: ["telegram"],
  async headers() {
    // CSP_REPORT_ONLY=1 só avisa no console do navegador, sem bloquear (útil se o AdSense reclamar de algo).
    return [{ source: "/:path*", headers: securityHeaders({ dev: process.env.NODE_ENV !== "production", reportOnly: process.env.CSP_REPORT_ONLY === "1" }) }];
  },
  // Publicar aceita até 8 imagens de 3 MB no mesmo envio.
  experimental: { serverActions: { bodySizeLimit: "26mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
