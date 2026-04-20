import { supabaseAdmin } from "../supabase/server";
import {
  buildConversationAIBundle,
  buildConversationAIPrompt,
  type ConversationAIBundle,
} from "./conversation-ai-prompt";
import { buildGhlAutoConfig, type AnswerRow, type GhlAutoConfig } from "./ghl-autoconfig";

export { buildGhlAutoConfig, buildConversationAIPrompt, buildConversationAIBundle };
export type { GhlAutoConfig, ConversationAIBundle };

/**
 * Genera ambos outputs y los persiste en `derived_outputs`.
 *
 * `conversation_ai_prompt` ahora guarda el BUNDLE completo (3 capas) en el JSON
 * `content`. El campo `content.prompt` sigue siendo el string puro de la capa 3
 * para que cualquier cliente legacy que lea `content.prompt` siga funcionando.
 * Los campos adicionales (`response_style`, `knowledge_base_spec`, etc.) los
 * consume el agente de provisioning y la UI `/admin/proyectos/[slug]`.
 *
 * Ver docs/ghl/conversation-ai.md para el razonamiento de las 3 capas.
 */
export async function generateAndPersistOutputs(sessionToken: string): Promise<{
  ghl_autoconfig: GhlAutoConfig;
  conversation_ai_bundle: ConversationAIBundle;
  /** @deprecated — usar `conversation_ai_bundle.prompt`. Se mantiene para compat. */
  conversation_ai_prompt: string;
}> {
  const sb = supabaseAdmin();

  const { data: session, error: sessErr } = await sb
    .from("interview_sessions")
    .select("id, session_token, company_name, owner_email")
    .eq("session_token", sessionToken)
    .single();
  if (sessErr || !session) throw new Error(`Sesión no encontrada: ${sessionToken}`);

  const { data: rows } = await sb
    .from("interview_answers")
    .select("section_id, question_id, record_index, value, confidence")
    .eq("session_id", session.id);

  const answers: AnswerRow[] = (rows ?? []).map((r) => ({
    section_id: r.section_id,
    question_id: r.question_id,
    record_index: r.record_index,
    value: r.value,
    confidence: r.confidence ?? 0,
  }));

  const ghlAutoconfig = buildGhlAutoConfig(answers, {
    name: session.company_name,
    email: session.owner_email,
  });
  const bundle = buildConversationAIBundle(ghlAutoconfig);

  // Persistencia: nuevo registro por versión.
  const nextVersion = await getNextVersion(session.id, "ghl_autoconfig_json");
  await sb.from("derived_outputs").insert([
    {
      session_id: session.id,
      kind: "ghl_autoconfig_json",
      version: nextVersion,
      content: ghlAutoconfig as unknown as object,
      checksum: simpleHash(JSON.stringify(ghlAutoconfig)),
    },
    {
      session_id: session.id,
      kind: "conversation_ai_prompt",
      version: nextVersion,
      // Guardamos el bundle completo. `content.prompt` sigue siendo el string.
      content: bundle as unknown as object,
      checksum: simpleHash(bundle.prompt),
    },
  ]);

  return {
    ghl_autoconfig: ghlAutoconfig,
    conversation_ai_bundle: bundle,
    conversation_ai_prompt: bundle.prompt,
  };
}

async function getNextVersion(sessionId: string, kind: string): Promise<number> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("derived_outputs")
    .select("version")
    .eq("session_id", sessionId)
    .eq("kind", kind)
    .order("version", { ascending: false })
    .limit(1);
  return (data?.[0]?.version ?? 0) + 1;
}

/** Hash rápido (FNV-1a 32-bit hex) — suficiente para checksum/dedupe. */
function simpleHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
