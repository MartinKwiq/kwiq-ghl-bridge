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
  /**
   * @huggingface/transformers (Whisper local) trae dos backends ONNX:
   *  - onnxruntime-web (WASM)  → corre en el navegador del cliente.
   *  - onnxruntime-node (.node) → corre en Node con binarios nativos.
   *
   * Nosotros solo lo usamos en el browser. Sin ajuste, webpack intenta
   * bundlear `onnxruntime-node` para SSR (Node) y falla porque los `.node`
   * son binarios opacos.
   *
   * Fix: marcamos `onnxruntime-node` como `false` en webpack (módulo vacío)
   * para que Transformers.js caiga a `onnxruntime-web` automáticamente.
   * `sharp` también lo excluimos por si Vercel lo arrastra como dep
   * transitiva — no lo usamos.
   */
  webpack: (config, { isServer }) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...((config.resolve.alias as Record<string, unknown>) ?? {}),
      "onnxruntime-node$": false,
      sharp$: false,
    };
    if (!isServer) {
      // En cliente nunca necesitamos fs/path/crypto-node aunque
      // transformers los referencie en sus types.
      config.resolve.fallback = {
        ...((config.resolve.fallback as Record<string, unknown>) ?? {}),
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
  // En server-side renderer, NO transpilamos transformers — lo dejamos
  // intacto para que el client component lo cargue vía import dinámico
  // y nuestro alias se aplique al bundle del cliente.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
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
