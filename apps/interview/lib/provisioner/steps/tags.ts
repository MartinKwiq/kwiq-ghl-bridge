/**
 * Step: tags.
 *
 * Sincroniza `autoconfig.tags[]` con los tags del Location en GHL.
 *
 *   POST /locations/{locationId}/tags          → crear (body: { name })
 *
 * GHL deduplica tags case-insensitive por nombre del lado del servidor: si
 * intentás crear "VIP" y ya existe, devuelve 200 con el id existente.
 *
 * Scope requerido: `locations/tags.write`.
 *
 * Idempotencia: `local_key = nombre normalizado`. Como GHL ya deduplica,
 * no hace falta listar los existentes — confiamos en el server.
 */
import type { LocationContext, ProvisionInput, StepResult } from "../types";
import { locationFetch } from "../location-client";
import {
  decideAction,
  fingerprint,
  upsertResourceRecord,
} from "../idempotency";

const RESOURCE_KIND = "tag";

interface GhlTag {
  id: string;
  name: string;
}

interface GhlTagResponse {
  tag?: GhlTag;
  id?: string;
  name?: string;
}

export async function stepTags(
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

  const tags = input.autoconfig.tags ?? [];
  if (tags.length === 0) {
    return {
      step: "tags",
      status: "skipped",
      created: 0,
      updated: 0,
      skipped: 0,
      duration_ms: Date.now() - started,
    };
  }

  for (const tag of tags) {
    if (!tag.name?.trim()) continue;
    const local_key = tag.name.trim().toLowerCase();
    const payload = { name: tag.name.trim() };
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

    // GHL solo soporta create de tags (no update/delete via location-id PIT
    // de forma confiable). Si la fingerprint cambió, igual hacemos otro POST
    // — el server deduplica.
    const res = await locationFetch<GhlTagResponse>(
      ctx,
      `/locations/${ctx.location_id}/tags`,
      { method: "POST", body: JSON.stringify(payload) },
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
        error: "GHL no devolvió id en la respuesta del POST",
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
    if (decision.action === "create") created++;
    else updated++;
    items.push({
      local_key,
      action: decision.action,
      external_id: ext,
    });
  }

  return {
    step: "tags",
    status: hadError ? "error" : "ok",
    created,
    updated,
    skipped,
    duration_ms: Date.now() - started,
    items,
  };
}

function extractId(data: GhlTagResponse | undefined): string | null {
  if (!data) return null;
  if (typeof data.id === "string") return data.id;
  if (data.tag?.id) return data.tag.id;
  return null;
}
