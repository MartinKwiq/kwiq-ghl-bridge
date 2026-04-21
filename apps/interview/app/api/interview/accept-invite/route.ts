import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  password: z.string().min(8).max(256),
});

/**
 * POST /api/interview/accept-invite
 *
 * Se llama desde la página `/interview/accept-invite` después de que el
 * cliente canjeó el magic link (Supabase ya le seteó la cookie de sesión).
 *
 * Flow:
 *  1. Verifica que haya sesión activa (sino el magic link no se procesó bien).
 *  2. Verifica que el user_id esté en `kwiq_interview_users` (es un cliente,
 *     no un admin).
 *  3. Setea la password via `auth.admin.updateUserById` (usamos admin para
 *     evitar pedirle la actual).
 *  4. Marca `first_login_at` y `last_login_at` si corresponde.
 *
 * Devuelve `{ ok, project_id }` para que el front redirija a la landing.
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

  const admin = supabaseAdmin();

  // El user debe ser un cliente de entrevista, no un admin.
  const { data: client, error: clientErr } = await admin
    .from("kwiq_interview_users")
    .select("user_id, project_id, first_login_at")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (clientErr) {
    return NextResponse.json(
      { error: "db_error", detail: clientErr.message },
      { status: 500 },
    );
  }
  if (!client) {
    // No es cliente. Cerramos la sesión para no dejar cookie huérfana.
    await sb.auth.signOut();
    return NextResponse.json(
      { error: "not_interview_user" },
      { status: 403 },
    );
  }

  // Seteamos la password via admin. Esto permite al cliente loguearse
  // próximamente con email + password por /interview/login sin depender
  // de otro magic link.
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

  // Tracking de login. first_login_at solo si aún no estaba seteado.
  const now = new Date().toISOString();
  await admin
    .from("kwiq_interview_users")
    .update({ last_login_at: now })
    .eq("user_id", auth.user.id);

  if (!client.first_login_at) {
    await admin
      .from("kwiq_interview_users")
      .update({ first_login_at: now })
      .eq("user_id", auth.user.id)
      .is("first_login_at", null);
  }

  return NextResponse.json({
    ok: true,
    project_id: client.project_id,
  });
}
