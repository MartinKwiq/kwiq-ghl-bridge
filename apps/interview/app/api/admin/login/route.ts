import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

const BodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
});

/**
 * POST /api/admin/login
 *
 * Autentica un admin contra Supabase Auth (email + password).
 * Además:
 *  - Valida que el email sea @kwiq.io.
 *  - Valida que el user_id esté en la allowlist `kwiq_admins`.
 *
 * Si la cookie de sesión se setea con éxito, el middleware + layout verán al
 * usuario en el próximo request y desbloquearán /admin/*.
 */
export async function POST(req: Request) {
  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const email = parsed.email.toLowerCase().trim();
  if (!email.endsWith("@kwiq.io")) {
    return NextResponse.json({ error: "domain" }, { status: 403 });
  }

  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password: parsed.password,
  });

  if (error || !data.user) {
    return NextResponse.json(
      { error: "invalid_credentials" },
      { status: 401 },
    );
  }

  // Doble check: el usuario debe estar en kwiq_admins. Si no, cerramos la
  // sesión y devolvemos error (evita que alguien con email válido pero sin
  // permisos quede con cookie activa).
  const admin = supabaseAdmin();
  const { data: row } = await admin
    .from("kwiq_admins")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!row) {
    await sb.auth.signOut();
    return NextResponse.json({ error: "not_admin" }, { status: 403 });
  }

  return NextResponse.json({ ok: true, user_id: data.user.id });
}
