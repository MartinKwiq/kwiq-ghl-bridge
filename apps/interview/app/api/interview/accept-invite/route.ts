import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  password: z.string().min(8).max(256),
});

/**
 * Tiempo máximo que un magic link de invitación a cliente sigue siendo
 * válido para fijar la contraseña inicial. Doble layer de seguridad sobre
 * el OTP_EXPIRY de Supabase Auth — incluso si Supabase está mal
 * configurado, nosotros bloqueamos invitaciones viejas acá.
 */
const INVITE_VALID_HOURS = 48;

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
 *  3. Verifica que la invitación no tenga más de 48 horas.
 *     - Si es el primer login (first_login_at == null) y `invited_at` está
 *       más viejo que el límite → bloqueamos. El admin tiene que
 *       reinvitarlo.
 *     - Si ya hizo first_login antes (re-uso del flow para cambiar
 *       contraseña), permitimos sin chequear edad.
 *  4. Setea la password via `auth.admin.updateUserById`.
 *  5. Marca `first_login_at` y `last_login_at`.
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
    .select("user_id, project_id, first_login_at, invited_at")
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

  // Validación de antigüedad del invite (solo en el PRIMER login).
  if (!client.first_login_at && client.invited_at) {
    const invitedMs = new Date(client.invited_at).getTime();
    const ageHours = (Date.now() - invitedMs) / (1000 * 60 * 60);
    if (ageHours > INVITE_VALID_HOURS) {
      // Cerramos la sesión para no dejar cookie de un invite caducado.
      await sb.auth.signOut();
      return NextResponse.json(
        {
          error: "invite_expired",
          detail: `La invitación tiene más de ${INVITE_VALID_HOURS}h. Pedile al equipo Kwiq que te envíe una nueva.`,
          invited_at: client.invited_at,
          age_hours: Math.round(ageHours),
        },
        { status: 410 },
      );
    }
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
