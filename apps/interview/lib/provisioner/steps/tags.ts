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
  decideActionWithRemote,
  fingerprint,
  upsertResourceRecord,
} from "../idempotency";
import { findByNormalizedName } from "../normalize";

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

  // Inventario remoto — el snapshot suele traer 50-80 tags pre-creados
  // (cita_agendada, whatsapp, recordatorio_*, etc). Adoptamos los que
  // ya existen en lugar de hacer POST que GHL ignora silenciosamente.
  const remoteItems = input.inventory.tags.items;

  for (const tag of tags) {
    if (!tag.name?.trim()) continue;
    const local_key = tag.name.trim().toLowerCase();
    const payload = { name: tag.name.trim() };
    const fp = fingerprint(payload);

    const remote = findByNormalizedName(remoteItems, tag.name);

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

    // Para tags, el "update" no aplica — GHL no expone PUT de tags por
    // PIT de location. Si decidimos "update" por adopt, simplemente
    // registramos el id remoto en idempotency y skipamos el POST.
    if (decision.action === "update") {
      if (input.mode === "apply") {
        await upsertResourceRecord(
          input.project_id,
          RESOURCE_KIND,
          local_key,
          decision.external_id,
          fp,
          run_id,
        );
      }
      skipped++;
      items.push({
        local_key,
        action: "skip",
        external_id: decision.external_id,
      });
      continue;
    }

    if (input.mode === "dry_run") {
      created++;
      items.push({
        local_key,
        action: decision.action,
      });
      continue;
    }

    // GHL deduplica case-insensitive del lado del server, pero ya
    // matcheamos por inventario antes así que llegamos acá solo si es
    // realmente un tag nuevo.
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
