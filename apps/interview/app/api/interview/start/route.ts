import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { newSessionToken } from "@/lib/utils";
import { INTERVIEW } from "@/lib/interview-schema";
import { buildWelcomeMessage } from "@/lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/interview/start
 *
 * Crea una nueva sesión de entrevista para el cliente logueado. A diferencia
 * de /api/session (flow legacy anónimo), linkea la sesión con:
 *   - `user_id` = auth.uid() del cliente.
 *   - `project_id` = kwiq_interview_users.project_id (si está seteado).
 *
 * También pre-completa `company_name` y `owner_email` desde la metadata del
 * cliente, para que el primer turno de la entrevista ya tenga contexto.
 *
 * Devuelve `{ token, section_id, schema_version, welcome }` para que el
 * front redirija a /entrevista/[token].
 */
export async function POST() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const admin = supabaseAdmin();

  const { data: client, error: clientErr } = await admin
    .from("kwiq_interview_users")
    .select("user_id, email, display_name, company_name, project_id")
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

  const token = newSessionToken();
  const firstSection = [...INTERVIEW.sections].sort(
    (a, b) => a.order - b.order,
  )[0]!;

  const { data: session, error: insertErr } = await admin
    .from("interview_sessions")
    .insert({
      session_token: token,
      schema_version: INTERVIEW.version,
      status: "in_progress",
      current_section_id: firstSection.id,
      user_id: auth.user.id,
      project_id: client.project_id ?? null,
      company_name: client.company_name ?? null,
      owner_email: client.email ?? null,
      locale: "es",
    })
    .select(
      "id, session_token, schema_version, current_section_id, company_name",
    )
    .single();

  if (insertErr || !session) {
    return NextResponse.json(
      {
        error: "supabase_insert_failed",
        detail: insertErr?.message,
      },
      { status: 500 },
    );
  }

  // Saludo inicial (no requiere LLM) — mismo shape que /api/session.
  const welcome = buildWelcomeMessage(client.company_name ?? undefined);
  await admin.from("interview_turns").insert({
    session_id: session.id,
    turn_index: 0,
    role: "assistant",
    content: welcome,
    section_id: firstSection.id,
    meta: { seeded: true, authenticated: true },
  });

  return NextResponse.json(
    {
      token: session.session_token,
      section_id: session.current_section_id,
      schema_version: session.schema_version,
      welcome,
    },
    { status: 201 },
  );
}
