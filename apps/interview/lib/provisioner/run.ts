/**
 * Orquestador del provisioner.
 *
 * Entrada: id del proyecto Kwiq + modo (dry_run | apply).
 * Proceso:
 *   1. Carga el proyecto + su ghl_autoconfig_json (si no existe, aborta).
 *   2. Resuelve el LocationContext (PIT + locationId).
 *   3. Crea un row en `kwiq_provisioning_runs` en estado "running".
 *   4. Corre cada step en orden, acumulando StepResults.
 *   5. Marca el run como succeeded / failed / partial y lo persiste.
 *
 * NO hay queue externa — el run corre inline en el request. Para el MVP
 * alcanza; si un run se pasa del timeout de Vercel (~60s en Pro) lo
 * migraremos a Inngest / background function.
 */
import { supabaseAdmin } from "@/lib/supabase/server";
import type {
  ProvisionInput,
  RunStatus,
  StepResult,
} from "./types";
import { getLocationContextByProject } from "./location-client";
import { stepCustomValues } from "./steps/custom-values";
import { stepTags } from "./steps/tags";
import { stepCustomFields } from "./steps/custom-fields";
import { stepPipelines } from "./steps/pipelines";
import { stepUsers } from "./steps/users";
import { stepCalendars } from "./steps/calendars";
import { stepMedia } from "./steps/media";
import { stepAiAgent } from "./steps/ai-agent";

export interface StartRunOptions {
  project_id: string;
  mode: "dry_run" | "apply";
  triggered_by?: string | null;
}

export interface RunReport {
  run_id: string;
  status: RunStatus;
  step_results: StepResult[];
  error_message?: string;
  started_at: string;
  finished_at: string;
}

/**
 * Corre el provisioner end-to-end y devuelve el reporte. Todos los errores
 * se capturan y se vuelcan al reporte para que la UI los muestre.
 */
export async function runProvisioner(
  opts: StartRunOptions,
): Promise<RunReport> {
  const admin = supabaseAdmin();
  const started_at = new Date().toISOString();

  // 1. Cargar el proyecto.
  const { data: project, error: projErr } = await admin
    .from("kwiq_projects")
    .select("id, slug, ghl_location_id")
    .eq("id", opts.project_id)
    .maybeSingle();

  if (projErr || !project) {
    return abortBeforeRun({
      started_at,
      error_message:
        projErr?.message ?? `Proyecto ${opts.project_id} no encontrado.`,
    });
  }
  if (!project.ghl_location_id) {
    return abortBeforeRun({
      started_at,
      error_message:
        "El proyecto todavía no tiene ghl_location_id. Asigná uno desde /admin/snapshots o el detalle del proyecto.",
    });
  }

  // 2. Cargar el último autoconfig + bundle AI de `interview_sessions`.
  const outputs = await loadLatestOutputs(project.id);
  if (!outputs) {
    return abortBeforeRun({
      started_at,
      error_message:
        "Este proyecto todavía no tiene un ghl_autoconfig_json generado. Completá la entrevista primero.",
    });
  }

  // 3. Crear el run en estado "running".
  const { data: runRow, error: runErr } = await admin
    .from("kwiq_provisioning_runs")
    .insert({
      project_id: project.id,
      triggered_by: opts.triggered_by ?? null,
      status: "running" as RunStatus,
      autoconfig_snapshot: outputs.ghl_autoconfig_json,
      conversation_ai_snapshot: outputs.conversation_ai_bundle ?? null,
      started_at,
    })
    .select("id")
    .single();

  if (runErr || !runRow) {
    return abortBeforeRun({
      started_at,
      error_message: `No pude crear el run: ${runErr?.message ?? "unknown error"}`,
    });
  }

  const run_id = runRow.id as string;

  // 4. Resolver LocationContext (lee Sub-account PIT del proyecto).
  const ctxResult = await getLocationContextByProject(project.id);
  if (!ctxResult.ok) {
    return finalizeRun(run_id, {
      started_at,
      step_results: [],
      status: "failed",
      error_message: ctxResult.message,
    });
  }
  const ctx = ctxResult.ctx;

  const input: ProvisionInput = {
    project_id: project.id,
    location_id: project.ghl_location_id,
    autoconfig: outputs.ghl_autoconfig_json,
    conversation_ai: outputs.conversation_ai_bundle,
    mode: opts.mode,
  };

  // 5. Correr steps en orden canónico (PROVISIONING.md §3.3):
  //    tags → custom_fields → custom_values → pipelines → users →
  //    [calendars, ai_agent — TODO].
  //
  //    Si un step falla, NO abortamos el run — seguimos con los demás
  //    porque cada step es independiente. El status final agregado refleja
  //    si hubo errores parciales (`partial`) o totales (`failed`).
  const step_results: StepResult[] = [];
  try {
    step_results.push(await stepTags(ctx, input, run_id));
    step_results.push(await stepCustomFields(ctx, input, run_id));
    step_results.push(await stepCustomValues(ctx, input, run_id));
    step_results.push(await stepPipelines(ctx, input, run_id));
    step_results.push(await stepCalendars(ctx, input, run_id));
    step_results.push(await stepUsers(ctx, input, run_id));
    step_results.push(await stepMedia(ctx, input, run_id));
    step_results.push(await stepAiAgent(ctx, input, run_id));
  } catch (err) {
    return finalizeRun(run_id, {
      started_at,
      step_results,
      status: "failed",
      error_message: err instanceof Error ? err.message : String(err),
    });
  }

  const status = aggregateStatus(step_results);
  return finalizeRun(run_id, { started_at, step_results, status });
}

function aggregateStatus(steps: StepResult[]): RunStatus {
  if (steps.length === 0) return "succeeded";
  const anyError = steps.some((s) => s.status === "error");
  const anyOk = steps.some((s) => s.status === "ok");
  if (anyError && anyOk) return "partial";
  if (anyError) return "failed";
  return "succeeded";
}

async function finalizeRun(
  run_id: string,
  partial: {
    started_at: string;
    step_results: StepResult[];
    status: RunStatus;
    error_message?: string;
  },
): Promise<RunReport> {
  const admin = supabaseAdmin();
  const finished_at = new Date().toISOString();
  await admin
    .from("kwiq_provisioning_runs")
    .update({
      status: partial.status,
      step_results: partial.step_results,
      error_message: partial.error_message ?? null,
      finished_at,
    })
    .eq("id", run_id);
  return {
    run_id,
    status: partial.status,
    step_results: partial.step_results,
    error_message: partial.error_message,
    started_at: partial.started_at,
    finished_at,
  };
}

/**
 * Construye un RunReport "fallido antes de crear el run" — útil cuando
 * detectamos el error previo al insert (proyecto inexistente, sin autoconfig).
 */
function abortBeforeRun(p: {
  started_at: string;
  error_message: string;
}): RunReport {
  const finished_at = new Date().toISOString();
  return {
    run_id: "",
    status: "failed",
    step_results: [],
    error_message: p.error_message,
    started_at: p.started_at,
    finished_at,
  };
}

/**
 * Carga el último `ghl_autoconfig_json` + su bundle de Conversation AI
 * asociados al proyecto.
 *
 * Los outputs NO viven en `interview_sessions` — `lib/generators/index.ts`
 * los persiste en `derived_outputs`, con versiones paralelas:
 *   kind = 'ghl_autoconfig_json'   → content = GhlAutoConfig
 *   kind = 'conversation_ai_prompt' → content = ConversationAIBundle (3-capas)
 * ambos con el mismo `(session_id, version)`.
 *
 * Estrategia: buscamos todas las sesiones del proyecto y, entre ellas,
 * la fila de `derived_outputs` de kind `ghl_autoconfig_json` con la mayor
 * versión (tie-break por created_at). Después levantamos el bundle de
 * Conversation AI de la misma (session_id, version).
 */
async function loadLatestOutputs(project_id: string): Promise<{
  ghl_autoconfig_json: import("@/lib/generators/ghl-autoconfig").GhlAutoConfig;
  conversation_ai_bundle: unknown;
} | null> {
  const admin = supabaseAdmin();

  // 1. Sesiones del proyecto.
  const { data: sessions, error: sessErr } = await admin
    .from("interview_sessions")
    .select("id")
    .eq("project_id", project_id);
  if (sessErr) return null;
  const sessionIds = (sessions ?? []).map((s) => s.id as string);
  if (sessionIds.length === 0) return null;

  // 2. Último autoconfig.
  const { data: autoRow, error: autoErr } = await admin
    .from("derived_outputs")
    .select("session_id, version, content")
    .eq("kind", "ghl_autoconfig_json")
    .in("session_id", sessionIds)
    .order("version", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (autoErr || !autoRow) return null;

  // 3. Bundle de Conversation AI pareado (mismo session_id + version). Si no
  //    existe, seguimos con null — el provisioner tolera steps sin AI.
  const { data: aiRow } = await admin
    .from("derived_outputs")
    .select("content")
    .eq("kind", "conversation_ai_prompt")
    .eq("session_id", autoRow.session_id)
    .eq("version", autoRow.version)
    .maybeSingle();

  return {
    ghl_autoconfig_json:
      autoRow.content as import("@/lib/generators/ghl-autoconfig").GhlAutoConfig,
    conversation_ai_bundle: aiRow?.content ?? null,
  };
}
