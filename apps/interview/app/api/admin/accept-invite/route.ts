import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  password: z.string().min(12).max(256),
});

/**
 * Tiempo máximo que un magic link de invitación a admin Kwiq sigue siendo
 * válido para fijar la contraseña inicial. Doble layer de seguridad sobre
 * el OTP_EXPIRY de Supabase Auth.
 */
const INVITE_VALID_HOURS = 48;

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
 *  4. Verifica que la invitación no tenga más de 48 horas. La fuente de
 *     verdad es `auth.users.invited_at` (lo escribe Supabase al disparar
 *     `auth.admin.inviteUserByEmail`). Si pasaron más de 48h y todavía no
 *     había seteado contraseña, bloqueamos y pedimos reinvite.
 *  5. Setea la password vía `auth.admin.updateUserById`.
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

  // Validación de antigüedad del invite. Solo aplica si es la primera vez
  // que setea password — si ya tenía una y volvió a usar el flow para
  // resetearla, lo dejamos pasar.
  // `auth.users.invited_at` lo escribe Supabase cuando llamamos
  // inviteUserByEmail; `last_sign_in_at` queda NULL hasta el primer login.
  const { data: authUser } = await admin.auth.admin.getUserById(auth.user.id);
  if (authUser?.user) {
    const invitedAt = authUser.user.invited_at;
    const lastSignIn = authUser.user.last_sign_in_at;
    const isFirstUse = !lastSignIn;
    if (isFirstUse && invitedAt) {
      const ageHours = (Date.now() - new Date(invitedAt).getTime()) / 3_600_000;
      if (ageHours > INVITE_VALID_HOURS) {
        await sb.auth.signOut();
        return NextResponse.json(
          {
            error: "invite_expired",
            detail: `La invitación tiene más de ${INVITE_VALID_HOURS}h. Pedile a otro admin que te reenvíe.`,
            invited_at: invitedAt,
            age_hours: Math.round(ageHours),
          },
          { status: 410 },
        );
      }
    }
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
