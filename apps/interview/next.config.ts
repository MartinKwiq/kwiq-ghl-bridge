import type { NextConfig } from "next";

/**
 * Next.js 15 config para Kwiq Interview.
 * - React Strict Mode habilitado.
 * - Variables públicas prefijadas con NEXT_PUBLIC_ se exponen al cliente.
 * - Runtime por defecto = Node.js (las rutas que usen streaming con Gemini
 *   pueden opt-in a "edge" individualmente con `export const runtime = 'edge'`).
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Habilita Server Actions con payload generoso para guardar respuestas largas.
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
