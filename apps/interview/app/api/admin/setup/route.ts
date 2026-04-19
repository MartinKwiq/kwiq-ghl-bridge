import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { writeFile, readFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().max(200),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).max(4000),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).max(4000),
});

/**
 * POST /api/admin/setup
 *
 * Wizard no-code de primera corrida. Intenta escribir `.env.local` con:
 *   - Las 3 llaves de Supabase que el admin pega.
 *   - Una INTERVIEW_ENCRYPTION_KEY generada al vuelo (base64 32 bytes).
 *   - El resto de defaults razonables (LLM, APP_URL).
 *
 * Si el filesystem es read-only (Vercel, Docker sin volumen), devuelve un
 * bloque de texto para pegar en Project Settings → Environment Variables.
 */
export async function POST(req: Request) {
  let body;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_body",
        detail:
          err instanceof z.ZodError
            ? err.issues[0]?.message
            : "Body inválido.",
      },
      { status: 400 },
    );
  }

  const encryptionKey = randomBytes(32).toString("base64");

  const lines = [
    "# Generado por /admin/setup — podés regenerar en cualquier momento.",
    "",
    "# Supabase",
    `NEXT_PUBLIC_SUPABASE_URL=${body.NEXT_PUBLIC_SUPABASE_URL}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${body.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    `SUPABASE_SERVICE_ROLE_KEY=${body.SUPABASE_SERVICE_ROLE_KEY}`,
    "",
    "# Cifrado de credenciales (AES-256-GCM)",
    `INTERVIEW_ENCRYPTION_KEY=${encryptionKey}`,
    "",
    "# LLM (se pueden editar después desde /admin/ajustes)",
    "LLM_PROVIDER=gemini",
    "GEMINI_MODEL=gemini-2.5-flash",
    "",
    "# Host app",
    "NEXT_PUBLIC_APP_URL=http://localhost:3001",
    "NEXT_PUBLIC_SITE_URL=http://localhost:3001",
    "",
  ];
  const envContents = lines.join("\n");

  // Ruta absoluta al `.env.local` del paquete `apps/interview`.
  //   process.cwd() cuando corrés `npm run dev` está en apps/interview.
  const envPath = path.resolve(process.cwd(), ".env.local");

  try {
    // Si ya existe, hacemos backup antes de sobrescribir.
    try {
      await access(envPath, fsConstants.F_OK);
      const prev = await readFile(envPath, "utf8");
      const backupPath = envPath + "." + Date.now() + ".bak";
      await writeFile(backupPath, prev, { mode: 0o600 });
    } catch {
      /* no existe, ok */
    }

    await writeFile(envPath, envContents, { mode: 0o600 });
    return NextResponse.json({
      ok: true,
      mode: "wrote_file",
      path: envPath,
    });
  } catch (err) {
    // Filesystem read-only (Vercel) o permisos. Devolvemos el bloque.
    // eslint-disable-next-line no-console
    console.warn("[setup] no pudimos escribir .env.local:", err);
    return NextResponse.json({
      ok: true,
      mode: "env_block",
      envBlock: envContents,
    });
  }
}

/**
 * GET /api/admin/setup — reporte de estado. Seguro de exponer: solo dice si
 * cada variable está seteada (boolean), no su valor.
 */
export async function GET() {
  return NextResponse.json({
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    INTERVIEW_ENCRYPTION_KEY: Boolean(process.env.INTERVIEW_ENCRYPTION_KEY),
  });
}
