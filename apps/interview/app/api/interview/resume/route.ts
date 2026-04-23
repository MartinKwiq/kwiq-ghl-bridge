import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  token: z.string().min(8).max(64),
});

/**
 * POST /api/interview/resume
 *
 * Retoma una sesión que estaba en estado `paused`: la vuelve a
 * `in_progress` y marca `resumed_at`. La UI la llama al entrar al chat
 * si detecta que la sesión estaba pausada.
 *
 * Es idempotente: llamar resume en una sesión in_progress devuelve ok.
 */
export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    const raw = await req.json();
    body = BodySchema.parse(raw);
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_body", detail: String(err) },
      { status: 400 },
    );
  }

  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const admin = supabaseAdmin();

  const { data: session, error: sessionErr } = await admin
    .from("interview_sessions")
    .select("id, user_id, status")
    .eq("session_token", body.token)
    .maybeSingle();

  if (sessionErr) {
    return NextResponse.json(
      { error: "db_error", detail: sessionErr.message },
      { status: 500 },
    );
  }
  if (!session) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }

  const { data: isAdmin } = await admin
    .from("kwiq_admins")
    .select("user_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const isOwner = session.user_id === auth.user.id;
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (session.status === "completed") {
    return NextResponse.json(
      { error: "already_completed" },
      { status: 409 },
    );
  }

  // Idempotente — si ya estaba in_progress no hacemos nada.
  if (session.status !== "paused") {
    return NextResponse.json({ ok: true, already_active: true });
  }

  const { error: updErr } = await admin
    .from("interview_sessions")
    .update({
      status: "in_progress",
      resumed_at: new Date().toISOString(),
    })
    .eq("id", session.id);

  if (updErr) {
    return NextResponse.json(
      { error: "update_failed", detail: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
