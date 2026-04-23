import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  token: z.string().min(8).max(64),
});

/**
 * POST /api/interview/pause
 *
 * Marca una sesión de entrevista como `paused`. Requiere que el cliente
 * esté logueado y sea dueño de la sesión (o sea admin interno de Kwiq).
 *
 * El engine ya persiste turnos y respuestas turn-by-turn, así que pausar
 * es puramente un cambio de estado. Al volver al chat, el componente
 * levanta los turnos guardados desde `current_section_id` y retoma.
 *
 * Devuelve `{ ok: true }` en éxito. Devuelve 403 si la sesión no le
 * pertenece al cliente logueado.
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

  // Chequear que la sesión existe y pertenece al usuario (o es admin interno).
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

  // Solo el dueño de la sesión o un admin interno la puede pausar.
  const { data: isAdmin } = await admin
    .from("kwiq_admins")
    .select("user_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const isOwner = session.user_id === auth.user.id;
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Idempotente: pausar una sesión ya pausada es OK.
  if (session.status === "paused") {
    return NextResponse.json({ ok: true, already_paused: true });
  }

  // No tiene sentido pausar una que ya terminó.
  if (session.status === "completed") {
    return NextResponse.json(
      { error: "already_completed" },
      { status: 409 },
    );
  }

  const { error: updErr } = await admin
    .from("interview_sessions")
    .update({
      status: "paused",
      paused_at: new Date().toISOString(),
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
