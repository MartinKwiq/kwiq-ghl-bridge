import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleUserTurn } from "@/lib/interview-engine";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  token: z.string().min(8).max(64),
  message: z.string().min(1).max(4000),
  record_index: z.number().int().nonnegative().optional(),
});

/**
 * POST /api/chat
 *
 * Recibe un turno del usuario y devuelve el próximo turno del assistant
 * junto con datos extraídos y status de la sección.
 *
 * Reglas de acceso (matchean a /entrevista/[token]/page.tsx):
 *  - Cliente debe estar logueado (Supabase Auth).
 *  - El token debe corresponder a una sesión NO huérfana (con user_id o
 *    project_id seteado).
 *  - El usuario logueado tiene que ser el dueño de la sesión, o un admin
 *    Kwiq (los admins pueden hacer turnos en nombre del cliente para
 *    debugging).
 *
 * Sin estos checks, cualquiera con un session_token podía mandar turnos
 * — el flow legacy anónimo permitía justamente eso.
 */
export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    const raw = await req.json();
    body = BodySchema.parse(raw);
  } catch (err) {
    return NextResponse.json({ error: "invalid_body", details: String(err) }, { status: 400 });
  }

  // ── Auth + ownership ──────────────────────────────────────────────
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const admin = supabaseAdmin();

  const { data: session, error: sessionErr } = await admin
    .from("interview_sessions")
    .select("id, user_id, project_id")
    .eq("session_token", body.token)
    .maybeSingle();

  if (sessionErr) {
    return NextResponse.json(
      { error: "db_error", details: sessionErr.message },
      { status: 500 },
    );
  }
  if (!session) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }

  // Sesiones huérfanas (legacy anónimo) → bloqueadas. No se les puede
  // agregar turnos, ni siquiera por un admin — si querés rescatar una,
  // hacé un UPDATE en DB para vincularla a un project_id primero.
  if (!session.user_id && !session.project_id) {
    return NextResponse.json(
      {
        error: "orphan_session",
        details:
          "Esta sesión no está vinculada a un proyecto Kwiq. Vinculala antes de continuar.",
      },
      { status: 403 },
    );
  }

  const isOwner = session.user_id === auth.user.id;
  let isAdmin = false;
  if (!isOwner) {
    const { data: adminRow } = await admin
      .from("kwiq_admins")
      .select("user_id")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    isAdmin = !!adminRow;
  }
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // ── Turno ─────────────────────────────────────────────────────────
  try {
    const result = await handleUserTurn({
      sessionToken: body.token,
      userMessage: body.message,
      recordIndexOverride: body.record_index,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/chat] error:", msg);
    return NextResponse.json({ error: "chat_failed", details: msg }, { status: 500 });
  }
}
