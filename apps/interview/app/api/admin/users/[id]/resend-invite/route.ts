import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/users/[id]/resend-invite
 *
 * Reenvía la invitación a un cliente (kwiq_interview_users) que todavía no
 * completó el flow de aceptar invitación. Casos típicos:
 *
 *  - El magic link original venció (48h) sin que el cliente lo abriera.
 *  - El email se perdió en spam y nunca llegó.
 *  - El cliente borró el correo por error.
 *
 * Implementación:
 *  - Validamos que el caller sea owner o admin.
 *  - Validamos que el target user esté en kwiq_interview_users (no admin).
 *  - Validamos que el target todavía NO se haya logueado nunca
 *    (first_login_at is null). Si ya se logueó tiene password y debería
 *    usar password reset, no resend invite.
 *  - Llamamos a `auth.admin.generateLink({ type: "invite", email, options })`.
 *    Supabase manda el email de invitación al user con el link nuevo
 *    (48h de vigencia, igual que el original).
 *  - Refrescamos la metadata por si el invite original perdió info
 *    (project_id, display_name, etc).
 *
 * NOTA: generateLink type "invite" funciona incluso para usuarios que ya
 * existen en auth.users — actualiza el invited_at y dispara el email
 * de nuevo. Es diferente a inviteUserByEmail que falla si el user existe.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const me = await requireAdminRole(["owner", "admin"]);
  if (!me.ok) {
    return NextResponse.json(
      { error: me.error, message: me.message },
      { status: me.status },
    );
  }

  const sb = supabaseAdmin();

  // 1) El target tiene que estar en kwiq_interview_users (es un cliente).
  const { data: client, error: clientErr } = await sb
    .from("kwiq_interview_users")
    .select(
      "user_id, email, display_name, company_name, phone, project_id, first_login_at",
    )
    .eq("user_id", id)
    .maybeSingle();

  if (clientErr) {
    // eslint-disable-next-line no-console
    console.error("[resend-invite] query client failed", clientErr);
    return NextResponse.json(
      { error: "db_error", detail: clientErr.message },
      { status: 500 },
    );
  }
  if (!client) {
    return NextResponse.json(
      {
        error: "not_a_client",
        detail:
          "Este usuario no es un cliente de entrevista. El resend-invite solo aplica para clientes.",
      },
      { status: 404 },
    );
  }

  // 2) Si ya completó el primer login no tiene sentido reinvitarlo —
  // ya tiene password seteada.
  if (client.first_login_at) {
    return NextResponse.json(
      {
        error: "already_logged_in",
        detail:
          "Este cliente ya completó su primer login. Si olvidó la contraseña, debe usar 'Olvidé mi contraseña' desde el login.",
      },
      { status: 400 },
    );
  }

  // 3) Armamos metadata para que el trigger DB no pise datos si se llegara
  // a re-crear el row. En la práctica generateLink no toca kwiq_interview_users
  // (el row ya existe), pero igualmente conviene mandar metadata coherente.
  const metadata: Record<string, string> = {
    kwiq_role: "client",
    display_name: client.display_name || "",
    company_name: client.company_name || "",
    phone: client.phone || "",
    project_id: client.project_id || "",
    invited_by: me.userId,
  };

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3001";
  const redirectTo = `${baseUrl}/interview/accept-invite`;

  // 4) Disparamos el link. Supabase manda el email automáticamente.
  const { data, error: linkErr } = await sb.auth.admin.generateLink({
    type: "invite",
    email: client.email,
    options: {
      data: metadata,
      redirectTo,
    },
  });

  if (linkErr) {
    // eslint-disable-next-line no-console
    console.error("[resend-invite] generateLink failed", linkErr);
    return NextResponse.json(
      {
        error: "generate_link_failed",
        detail: linkErr.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      email: client.email,
      // Devolvemos el action_link por si el admin quiere copiarlo manualmente
      // (ej. para mandarlo por WhatsApp si el email del cliente no llega).
      action_link: data?.properties?.action_link ?? null,
    },
    { status: 200 },
  );
}
