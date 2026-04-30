import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  password: z.string().min(12).max(256),
});

/**
 * POST /api/admin/accept-invite
 *
 * Se llama desde la página `/admin/accept-invite` después de que el admin
 * canjeó el magic link del email (Supabase ya le seteó la cookie de sesión).
 *
 * Flow:
 *  1. Verifica que haya sesión activa (sino el magic link no se procesó bien).
 *  2. Verifica que el email termine en @kwiq.io (defensa en profundidad —
 *     el invite original ya lo valida, pero acá lo re-chequeamos).
 *  3. Verifica que el user_id esté en `kwiq_admins` (es admin, no cliente).
 *  4. Setea la password vía `auth.admin.updateUserById` (usamos admin para
 *     evitar pedirle la actual).
 *
 * Devuelve `{ ok }` para que el front redirija a /admin.
 *
 * Es la versión "admin" del endpoint equivalente para clientes en
 * /api/interview/accept-invite. Difiere en:
 *  - Valida dominio @kwiq.io.
 *  - Verifica que esté en `kwiq_admins` (no `kwiq_interview_users`).
 *  - Mínimo de password 12 chars (el de cliente es 8) — alineado con la
 *    policy de Supabase Auth que tenemos puesta para Kwiq.
 */
export async function POST(req: Request) {
  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // Defensa en profundidad: dominio @kwiq.io.
  const userEmail = auth.user.email ?? "";
  if (!userEmail.toLowerCase().endsWith("@kwiq.io")) {
    // Cerramos la sesión para no dejar cookie huérfana de un user no-admin.
    await sb.auth.signOut();
    return NextResponse.json(
      { error: "invalid_email_domain" },
      { status: 403 },
    );
  }

  const admin = supabaseAdmin();

  // El user debe estar registrado como admin.
  const { data: row, error: rowErr } = await admin
    .from("kwiq_admins")
    .select("user_id, role, display_name")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (rowErr) {
    return NextResponse.json(
      { error: "db_error", detail: rowErr.message },
      { status: 500 },
    );
  }
  if (!row) {
    // No es admin. Cerramos la sesión.
    await sb.auth.signOut();
    return NextResponse.json({ error: "not_admin" }, { status: 403 });
  }

  // Seteamos la password vía admin. Esto permite al admin loguearse después
  // con email + password por /admin/login sin depender de otro magic link.
  const { error: updErr } = await admin.auth.admin.updateUserById(
    auth.user.id,
    { password: parsed.password },
  );

  if (updErr) {
    return NextResponse.json(
      { error: "password_update_failed", detail: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    role: row.role,
  });
}
