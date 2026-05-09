/**
 * Step: pipelines + stages.
 *
 * Crea pipelines con sus stages embebidos. GHL acepta el pipeline + stages
 * en una sola llamada al POST /opportunities/pipelines, lo que simplifica
 * la idempotencia (un solo recurso por pipeline, no uno por stage).
 *
 * Endpoint:
 *   POST /opportunities/pipelines  (header: Location-Id)
 *
 * Body shape:
 *   {
 *     name: "Pipeline ventas",
 *     locationId: "...",
 *     stages: [
 *       { name: "Lead", position: 1 },
 *       { name: "Demo", position: 2 },
 *     ]
 *   }
 *
 * Scope requerido: `opportunities.write`.
 *
 * Idempotencia: `local_key = nombre normalizado del pipeline`. El
 * fingerprint cubre name + stages.
 */
import type { LocationContext, ProvisionInput, StepResult } from "../types";
import { locationFetch } from "../location-client";
import {
  decideActionWithRemote,
  fingerprint,
  upsertResourceRecord,
} from "../idempotency";
import { findByNormalizedName } from "../normalize";

const RESOURCE_KIND = "pipeline";

interface GhlPipeline {
  id: string;
  name: string;
  stages?: Array<{ id: string; name: string; position: number }>;
}

interface GhlPipelineResponse {
  pipeline?: GhlPipeline;
  id?: string;
  name?: string;
}

export async function stepPipelines(
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

  const pipelines = input.autoconfig.pipelines ?? [];
  if (pipelines.length === 0) {
    return {
      step: "pipelines",
      status: "skipped",
      created: 0,
      updated: 0,
      skipped: 0,
      duration_ms: Date.now() - started,
    };
  }

  for (const p of pipelines) {
    if (!p.name?.trim()) continue;
    const local_key = p.name.trim().toLowerCase();
    const stages = (p.stages ?? [])
      .filter((s) => s.name?.trim())
      .map((s, i) => ({
        name: s.name.trim(),
        position: typeof s.position === "number" ? s.position : i + 1,
      }));

    if (stages.length === 0) {
      skipped++;
      items.push({
        local_key,
        action: "skip",
        error: "Pipeline sin stages — ignorado.",
      });
      continue;
    }

    const payload = {
      name: p.name.trim(),
      locationId: ctx.location_id,
      stages,
    };
    const fp = fingerprint(payload);

    // Match contra inventario — pipelines se identifican por `name`.
    // Si el snapshot trajo el "Customer Pipeline" default, podemos
    // adoptarlo y reescribir sus stages.
    const remote = findByNormalizedName(
      input.inventory.pipelines.items,
      p.name,
    );

    const decision = await decideActionWithRemote(
      input.project_id,
      RESOURCE_KIND,
      local_key,
      fp,
      remote ? { id: remote.id } : null,
    );

    if (decision.action === "skip") {
      skipped++;
      items.push({
        local_key,
        action: "skip",
        external_id: decision.external_id,
      });
      continue;
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
      continue;
    }

    if (decision.action === "create") {
      const res = await locationFetch<GhlPipelineResponse>(
        ctx,
        `/opportunities/pipelines`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          scope_location: true,
        },
      );
      if (!res.ok) {
        hadError = true;
        items.push({
          local_key,
          action: "error",
          error: `POST ${res.status}: ${res.message}`,
        });
        continue;
      }
      const ext = extractId(res.data);
      if (!ext) {
        hadError = true;
        items.push({
          local_key,
          action: "error",
          error: "GHL no devolvió id en POST pipeline",
        });
        continue;
      }
      await upsertResourceRecord(
        input.project_id,
        RESOURCE_KIND,
        local_key,
        ext,
        fp,
        run_id,
      );
      created++;
      items.push({ local_key, action: "create", external_id: ext });
    } else {
      const res = await locationFetch<GhlPipelineResponse>(
        ctx,
        `/opportunities/pipelines/${decision.external_id}`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
          scope_location: true,
        },
      );
      if (!res.ok) {
        hadError = true;
        items.push({
          local_key,
          action: "error",
          external_id: decision.external_id,
          error: `PUT ${res.status}: ${res.message}`,
        });
        continue;
      }
      await upsertResourceRecord(
        input.project_id,
        RESOURCE_KIND,
        local_key,
        decision.external_id,
        fp,
        run_id,
      );
      updated++;
      items.push({
        local_key,
        action: "update",
        external_id: decision.external_id,
      });
    }
  }

  return {
    step: "pipelines",
    status: hadError ? "error" : "ok",
    created,
    updated,
    skipped,
    duration_ms: Date.now() - started,
    items,
  };
}

function extractId(data: GhlPipelineResponse | undefined): string | null {
  if (!data) return null;
  if (typeof data.id === "string") return data.id;
  if (data.pipeline?.id) return data.pipeline.id;
  return null;
}
