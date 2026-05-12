/**
 * Step: AI agent (Conversation AI prompt + Knowledge Base spec).
 *
 * GHL Conversation AI tiene un modelo de 3 capas (ver
 * docs/PROMPT-GENERATION.md):
 *
 *   Capa 1 — Custom Values (scope Location): los valores que el agente
 *            interpola con {{custom_values.xxx}}. Ya fueron creados por
 *            el step `custom_values`.
 *   Capa 2 — Knowledge Base: URLs web + documentos + FAQs. Se carga al
 *            agente desde la UI de GHL (Settings → Conversation AI →
 *            Knowledge Base). API pública limitada — por ahora dejamos
 *            la spec persistida y avisamos al admin que la cargue manual.
 *   Capa 3 — Prompt + response_style + handoff_phrase: lo aplica este
 *            step si la sub-cuenta tiene un agente IA pre-existente
 *            (típicamente cargado vía snapshot Kwiq base).
 *
 * Estrategia V1:
 *   - Si la sub-cuenta tiene un agente activo → actualizamos su prompt.
 *   - Si no tiene agente → no creamos uno (la API de creación es nueva
 *     y poco estable). En su lugar, validamos que el bundle esté listo
 *     y dejamos un item en el StepResult avisando al admin que lo
 *     active manualmente desde GHL.
 *
 * Endpoints (cuando los aplicamos):
 *   GET  /conversation-ai/bots?locationId=...   → listar agentes
 *   POST /conversation-ai/bots                  → crear agente (V2)
 *   PUT  /conversation-ai/bots/{id}             → actualizar prompt
 *
 * Scope requerido: `conversations.write` (la API de Conversation AI
 * todavía hereda este scope; cuando GHL libere uno específico
 * `conversation-ai.write` lo cambiamos).
 *
 * Idempotencia: `local_key = "default"` (un solo agente por sub-cuenta).
 * El fingerprint cubre prompt + response_style + handoff_phrase.
 */
import type { LocationContext, ProvisionInput, StepResult } from "../types";
import { locationFetch } from "../location-client";
import {
  decideAction,
  fingerprint,
  upsertResourceRecord,
} from "../idempotency";
import type { ConversationAIBundle } from "@/lib/generators/conversation-ai-prompt";

const RESOURCE_KIND = "ai_agent";

interface GhlBot {
  id: string;
  name?: string;
  isActive?: boolean;
}

interface GhlBotsList {
  bots?: GhlBot[];
  data?: GhlBot[];
}

export async function stepAiAgent(
  ctx: LocationContext,
  input: ProvisionInput,
  run_id: string | null,
): Promise<StepResult> {
  const started = Date.now();
  const items: NonNullable<StepResult["items"]> = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let hadError = false;

  const bundle = input.conversation_ai as ConversationAIBundle | null | undefined;

  if (!bundle) {
    return {
      step: "ai_agent",
      status: "skipped",
      created: 0,
      updated: 0,
      skipped: 0,
      duration_ms: Date.now() - started,
      error_message:
        "No hay conversation_ai_bundle en derived_outputs — terminá la entrevista primero.",
    };
  }

  // Validación: el prompt referencia custom_values que el step custom_values
  // tiene que haber creado. Si falta alguno, registramos el problema pero no
  // abortamos (el cliente puede crearlo manualmente después).
  const missingCVs: string[] = [];
  for (const cvKey of bundle.custom_values_referenced ?? []) {
    const exists = (input.autoconfig.custom_values ?? []).some(
      (cv) => cv.key === cvKey,
    );
    if (!exists) missingCVs.push(cvKey);
  }
  if (missingCVs.length > 0) {
    items.push({
      local_key: "validation",
      action: "skip",
      error: `El prompt referencia custom values inexistentes: ${missingCVs.join(", ")}. El admin puede crearlos a mano.`,
    });
  }

  // Validación: el prompt no debe exceder 2 000 palabras del Conversation AI.
  // Tolerante a bundles viejos persistidos en derived_outputs: si la metadata
  // no trae `word_count` (formato pre-v2), lo computamos al vuelo a partir
  // del prompt. Y si tampoco viene `within_ghl_limit`, lo derivamos.
  const m = bundle.metadata as Record<string, unknown>;
  const wordCount =
    typeof m.word_count === "number"
      ? (m.word_count as number)
      : bundle.prompt.trim().split(/\s+/).filter(Boolean).length;
  const withinLimit =
    typeof m.within_ghl_limit === "boolean"
      ? (m.within_ghl_limit as boolean)
      : wordCount <= 2000;
  if (!withinLimit) {
    items.push({
      local_key: "validation",
      action: "skip",
      error: `El prompt tiene ${wordCount} palabras y excede el límite de 2 000 de GHL Conversation AI. Recortar antes de aplicar manualmente.`,
    });
  }

  const local_key = "default";
  const payload = {
    name: bundle.metadata.name,
    prompt: bundle.prompt,
    responseStyle: bundle.response_style,
    handoffPhrase: bundle.handoff_phrase,
    language: bundle.metadata.language,
  };
  const fp = fingerprint(payload);

  const decision = await decideAction(
    input.project_id,
    RESOURCE_KIND,
    local_key,
    fp,
  );

  if (decision.action === "skip") {
    skipped++;
    items.push({
      local_key,
      action: "skip",
      external_id: decision.external_id,
    });
    return {
      step: "ai_agent",
      status: "ok",
      created,
      updated,
      skipped,
      duration_ms: Date.now() - started,
      items,
    };
  }

  if (input.mode === "dry_run") {
    if (decision.action === "create") created++;
    else updated++;
    items.push({
      local_key,
      action: decision.action,
      external_id:
        decision.action === "update" ? decision.external_id : undefined,
    });
    return {
      step: "ai_agent",
      status: "ok",
      created,
      updated,
      skipped,
      duration_ms: Date.now() - started,
      items,
    };
  }

  // Buscamos agentes existentes vía el inventario remoto que ya cargó el
  // orquestador (ver lib/provisioner/run.ts). El snapshot Kwiq base
  // típicamente trae un agente pre-creado — lo adoptamos en lugar de
  // crear un duplicado.
  //
  // Si el inventario no incluye la sección ai_agents (sub-cuenta vieja
  // antes de Sprint #120) o si la API de GHL no la soportó (404/405),
  // caemos al fetch ad-hoc para mantener el comportamiento histórico.
  const aiInv = input.inventory.ai_agents;
  let existingBots: GhlBot[] = [];

  if (aiInv?.fetched) {
    existingBots = aiInv.items.map((b) => ({
      id: b.id,
      name: b.name,
      isActive: b.isActive,
    }));
  } else {
    const listRes = await locationFetch<GhlBotsList>(
      ctx,
      `/conversation-ai/bots?locationId=${ctx.location_id}`,
      { scope_location: true },
    );

    if (!listRes.ok) {
      if (listRes.status === 404 || listRes.status === 405) {
        items.push({
          local_key,
          action: "skip",
          error:
            "GHL todavía no expone /conversation-ai/bots para esta sub-cuenta. El bundle se persistió en derived_outputs — copialo manualmente al panel del agente IA.",
        });
        return {
          step: "ai_agent",
          status: "ok",
          created,
          updated,
          skipped: skipped + 1,
          duration_ms: Date.now() - started,
          items,
        };
      }
      return {
        step: "ai_agent",
        status: "error",
        created,
        updated,
        skipped,
        duration_ms: Date.now() - started,
        error_message: `GET /conversation-ai/bots: ${listRes.status} ${listRes.message}`,
      };
    }

    existingBots = listRes.data?.bots ?? listRes.data?.data ?? [];
  }

  const targetBot = existingBots.find((b) => b.isActive) ?? existingBots[0];

  if (!targetBot) {
    // No hay agente — avisamos al admin para que aplique snapshot Kwiq.
    items.push({
      local_key,
      action: "skip",
      error:
        "La sub-cuenta no tiene agente IA todavía. Aplicá un snapshot Kwiq que incluya el bot, después re-ejecutá este step para que cargue el prompt.",
    });
    return {
      step: "ai_agent",
      status: "ok",
      created,
      updated,
      skipped: skipped + 1,
      duration_ms: Date.now() - started,
      items,
    };
  }

  // Tenemos un agente — actualizamos su prompt.
  const updRes = await locationFetch<GhlBot>(
    ctx,
    `/conversation-ai/bots/${targetBot.id}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
      scope_location: true,
    },
  );

  if (!updRes.ok) {
    hadError = true;
    items.push({
      local_key,
      action: "error",
      external_id: targetBot.id,
      error: `PUT ${updRes.status}: ${updRes.message}`,
    });
  } else {
    await upsertResourceRecord(
      input.project_id,
      RESOURCE_KIND,
      local_key,
      targetBot.id,
      fp,
      run_id,
    );
    if (decision.action === "create") created++;
    else updated++;
    items.push({
      local_key,
      action: decision.action,
      external_id: targetBot.id,
    });
  }

  return {
    step: "ai_agent",
    status: hadError ? "error" : "ok",
    created,
    updated,
    skipped,
    duration_ms: Date.now() - started,
    items,
  };
}
