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

    // Clasificación de errores para que el cliente muestre el copy
    // correcto sin tener que parsear el JSON crudo de Google.
    const classified = classifyLlmError(msg);
    if (classified) {
      return NextResponse.json(classified.body, { status: classified.status });
    }

    return NextResponse.json({ error: "chat_failed", details: msg }, { status: 500 });
  }
}

/**
 * Detecta errores típicos del LLM (rate limit, key inválida, prompt block)
 * y los traduce a un shape estable que el front puede renderizar.
 *
 * El copy que se devuelve al cliente es deliberadamente NEUTRO y NO
 * menciona detalles internos (proveedor del LLM, planes, cuotas, free
 * tier, billing, etc). El cliente solo necesita saber que tuvimos un
 * inconveniente puntual, que su progreso está a salvo, y qué hacer.
 *
 * Los detalles técnicos (qué error real, qué proveedor, cuánto esperar)
 * se loguean en console.error para que el equipo Kwiq los investigue,
 * pero nunca llegan a la UI.
 */
function classifyLlmError(
  msg: string,
): { status: number; body: Record<string, unknown> } | null {
  const lower = msg.toLowerCase();

  // Cualquier error que sugiera saturación / rate limit / cuota / quota.
  // Para el cliente NO distinguimos entre "saturado por minuto" y
  // "agotamos plan diario" — los dos se ven igual de afuera.
  if (
    lower.includes("429") ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("rate_limit")
  ) {
    return {
      status: 503,
      body: {
        error: "llm_unavailable",
        message:
          "Estamos teniendo un inconveniente puntual al procesar tu respuesta. Tu progreso quedó guardado — probá enviar de nuevo en unos minutos, o pausá la entrevista y retomala más tarde, no se pierde nada.",
      },
    };
  }

  // 401/403 / key inválida / permisos. Para el cliente, también es
  // "inconveniente puntual" — no necesita saber que es un tema de auth
  // del proveedor de IA.
  if (
    lower.includes("api key") ||
    lower.includes("permission_denied") ||
    lower.includes("api_key_invalid") ||
    lower.includes("unauthenticated")
  ) {
    return {
      status: 503,
      body: {
        error: "llm_unavailable",
        message:
          "Estamos teniendo un inconveniente puntual al procesar tu respuesta. Tu progreso quedó guardado — probá enviar de nuevo en unos minutos, o pausá la entrevista y retomala más tarde, no se pierde nada.",
      },
    };
  }

  // El LLM bloqueó la respuesta por safety filters. Acá sí tiene sentido
  // diferenciar, porque el cliente puede REFORMULAR su mensaje y arreglar
  // el problema por su cuenta.
  if (
    lower.includes("safety") &&
    (lower.includes("block") || lower.includes("filtered"))
  ) {
    return {
      status: 422,
      body: {
        error: "llm_blocked",
        message:
          "No pudimos procesar ese mensaje. Probá reformularlo de otra manera.",
      },
    };
  }

  return null;
}
