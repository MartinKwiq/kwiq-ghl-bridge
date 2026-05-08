import { getLLMClient, getLLMClientAsync, type LLMMessage } from "./llm";
// getLLMClient stays imported for legacy callers/tests; we use async below.
void getLLMClient;
import { getSectionById, INTERVIEW, type SectionDef } from "./interview-schema";
import {
  buildSectionSystemPrompt,
  parseSectionTurn,
  SECTION_TURN_JSON_SCHEMA,
} from "./prompts";
import { supabaseAdmin } from "./supabase/server";

export interface InterviewTurnRecord {
  role: "user" | "assistant";
  content: string;
}

/**
 * Procesa un turno del usuario para la sección activa de una sesión.
 *
 * Flujo:
 *   1. Carga sesión + últimos N turnos de Supabase.
 *   2. Persiste el turno del usuario (append).
 *   3. Arma mensajes y llama al LLM con JSON mode.
 *   4. Parsea la respuesta, persiste turno del assistant + upserts en answers.
 *   5. Si la sección quedó completa, avanza `current_section_id` al siguiente.
 *   6. Devuelve payload para la UI.
 */
export async function handleUserTurn(opts: {
  sessionToken: string;
  userMessage: string;
  recordIndexOverride?: number;
}): Promise<{
  message: string;
  status: "in_progress" | "section_complete" | "need_clarification";
  sectionId: string;
  /** Question_id sobre el que el LLM está trabajando ahora. La UI lo usa
   *  para decidir qué helper contextual mostrar al costado del input. */
  nextFocus?: string;
  sectionAdvanced?: { from: string; to: string | null };
  extracted: { question_id: string; value: unknown; confidence: number }[];
  turnIndex: number;
}> {
  const sb = supabaseAdmin();

  // 1) Cargar sesión
  const { data: session, error: sessionErr } = await sb
    .from("interview_sessions")
    .select("*")
    .eq("session_token", opts.sessionToken)
    .single();
  if (sessionErr || !session) {
    throw new Error(`Sesión no encontrada: ${opts.sessionToken}`);
  }

  const sectionId = session.current_section_id ?? INTERVIEW.sections[0]!.id;
  const section = getSectionById(sectionId);
  if (!section) throw new Error(`Sección desconocida: ${sectionId}`);

  // 2) Cargar historia (últimos 20 turnos de esta sección + saludo inicial).
  const { data: priorTurns } = await sb
    .from("interview_turns")
    .select("turn_index, role, content, section_id")
    .eq("session_id", session.id)
    .order("turn_index", { ascending: true });

  const history: LLMMessage[] = (priorTurns ?? [])
    .filter((t) => t.role === "user" || t.role === "assistant")
    .slice(-30)
    .map((t) => ({
      role: t.role as "user" | "assistant",
      content: t.content,
    }));

  // Calcular el próximo turn_index a partir del MÁXIMO actual + 1, NO de
  // `priorTurns.length`. Si en algún momento se borraron turnos
  // manualmente (por ejemplo, para limpiar duplicados), `length` queda
  // desfasado del max real y choca contra la unique constraint
  // `interview_turns_session_id_turn_index_key` al intentar insertar.
  // Síntoma observado: PostgresError "duplicate key value violates unique
  // constraint" repetido en logs cada vez que el cliente reintentaba.
  const maxTurnIndex = (priorTurns ?? []).reduce(
    (acc, t) => (typeof t.turn_index === "number" && t.turn_index > acc ? t.turn_index : acc),
    -1,
  );
  const nextTurnIndex = maxTurnIndex + 1;

  // 3) Persistir turno del usuario
  await sb.from("interview_turns").insert({
    session_id: session.id,
    turn_index: nextTurnIndex,
    role: "user",
    content: opts.userMessage,
    section_id: sectionId,
  });
  history.push({ role: "user", content: opts.userMessage });

  // 4) Llamar al LLM (config resuelta desde kwiq_settings con fallback a env)
  const llm = await getLLMClientAsync();
  const system = buildSectionSystemPrompt(section);

  // Contexto adicional: respuestas ya capturadas (para que no repregunte).
  const { data: priorAnswers } = await sb
    .from("interview_answers")
    .select("question_id, value, confidence")
    .eq("session_id", session.id)
    .eq("section_id", sectionId);
  const capturedContext =
    priorAnswers && priorAnswers.length
      ? `\n\n# Slots ya capturados (no repreguntes)\n${priorAnswers
          .map((a) => `- ${a.question_id}: ${JSON.stringify(a.value)} (conf=${a.confidence ?? "?"})`)
          .join("\n")}`
      : "";

  const llmResult = await llm.generate(history, {
    system: system + capturedContext,
    temperature: 0.4,
    maxOutputTokens: 1024,
    jsonMode: true,
    jsonSchema: SECTION_TURN_JSON_SCHEMA as unknown as Record<string, unknown>,
  });

  const parsed = parseSectionTurn(llmResult.text);

  // 5) Persistir turno del assistant
  const assistantTurnIndex = nextTurnIndex + 1;
  const { data: assistantTurn } = await sb
    .from("interview_turns")
    .insert({
      session_id: session.id,
      turn_index: assistantTurnIndex,
      role: "assistant",
      content: parsed.message,
      section_id: sectionId,
      input_tokens: llmResult.usage?.inputTokens,
      output_tokens: llmResult.usage?.outputTokens,
      model: llm.model,
      provider: llm.provider,
      meta: { finish_reason: llmResult.finishReason, status: parsed.status, next_focus: parsed.next_focus },
    })
    .select("id")
    .single();

  // 6) Upsert de respuestas extraídas
  if (parsed.extracted.length) {
    const recordIndex = opts.recordIndexOverride ?? 0;
    const rows = parsed.extracted.map((e) => ({
      session_id: session.id,
      section_id: sectionId,
      question_id: e.question_id,
      record_index: recordIndex,
      value: e.value as object,
      confidence: e.confidence,
      source_turn_id: assistantTurn?.id ?? null,
    }));
    await sb
      .from("interview_answers")
      .upsert(rows, { onConflict: "session_id,section_id,question_id,record_index" });
  }

  // 7) Avanzar sección si está completa
  let sectionAdvanced: { from: string; to: string | null } | undefined;
  if (parsed.status === "section_complete") {
    const next = nextSectionAfter(sectionId);
    const newCompleted = Array.from(new Set([...(session.completed_section_ids ?? []), sectionId]));
    await sb
      .from("interview_sessions")
      .update({
        current_section_id: next?.id ?? null,
        completed_section_ids: newCompleted,
        status: next ? "in_progress" : "completed",
        completed_at: next ? null : new Date().toISOString(),
      })
      .eq("id", session.id);
    sectionAdvanced = { from: sectionId, to: next?.id ?? null };
  }

  return {
    message: parsed.message,
    status: parsed.status,
    sectionId,
    nextFocus: parsed.next_focus,
    sectionAdvanced,
    extracted: parsed.extracted,
    turnIndex: assistantTurnIndex,
  };
}

/** Devuelve la siguiente sección en orden (o null si era la última). */
export function nextSectionAfter(sectionId: string): SectionDef | null {
  const sorted = [...INTERVIEW.sections].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((s) => s.id === sectionId);
  if (idx === -1 || idx >= sorted.length - 1) return null;
  return sorted[idx + 1] ?? null;
}
