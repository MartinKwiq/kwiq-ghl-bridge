import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/interview/me
 *
 * Devuelve la metadata del cliente logueado + listado de sesiones de
 * entrevista propias (más reciente primero).
 *
 * Si el user no está en `kwiq_interview_users` (no es cliente o es admin),
 * devolvemos 403 para que el front sepa que no puede usar esta vista.
 */
export async function GET() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const admin = supabaseAdmin();

  const { data: client, error: clientErr } = await admin
    .from("kwiq_interview_users")
    .select(
      "user_id, email, display_name, company_name, phone, project_id, first_login_at, last_login_at, interview_completed_at",
    )
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (clientErr) {
    return NextResponse.json(
      { error: "db_error", detail: clientErr.message },
      { status: 500 },
    );
  }
  if (!client) {
    return NextResponse.json({ error: "not_interview_user" }, { status: 403 });
  }

  // Proyecto asociado (lookup liviano para mostrar el nombre).
  let project: { id: string; slug: string; client_name: string } | null = null;
  if (client.project_id) {
    const { data: proj } = await admin
      .from("kwiq_projects")
      .select("id, slug, client_name")
      .eq("id", client.project_id)
      .maybeSingle();
    project = proj ?? null;
  }

  // Sesiones del cliente (más recientes primero, máx 20).
  const { data: sessions, error: sessErr } = await admin
    .from("interview_sessions")
    .select(
      "id, session_token, status, current_section_id, schema_version, created_at, updated_at, completed_at",
    )
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (sessErr) {
    return NextResponse.json(
      { error: "db_error", detail: sessErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    me: client,
    project,
    sessions: sessions ?? [],
  });
}
