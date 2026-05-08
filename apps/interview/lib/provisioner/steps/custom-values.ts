/**
 * Step: custom values.
 *
 * Sincroniza `autoconfig.custom_values[]` con los custom values del Location
 * en GHL. Endpoints usados:
 *
 *   GET  /locations/{locationId}/customValues       → listar existentes
 *   POST /locations/{locationId}/customValues       → crear
 *   PUT  /locations/{locationId}/customValues/{id}  → actualizar
 *
 * Scope requerido en el PIT: `locations/customValues.readonly` y
 * `locations/customValues.write`.
 *
 * Idempotencia: `local_key = autoconfig.custom_values[i].key`. El fingerprint
 * se calcula sobre `{ name, value }`.
 *
 * Dry-run: si `input.mode === "dry_run"`, solo calcula qué haría, no toca GHL.
 */
import type { LocationContext, ProvisionInput, StepResult } from "../types";
import { locationFetch } from "../location-client";
import {
  decideAction,
  fingerprint,
  upsertResourceRecord,
} from "../idempotency";

const RESOURCE_KIND = "custom_value";

interface GhlCustomValue {
  id: string;
  name: string;
  value?: string | null;
}

interface GhlCustomValuesList {
  customValues?: GhlCustomValue[];
}

export async function stepCustomValues(
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

  const cvs = input.autoconfig.custom_values ?? [];
  if (cvs.length === 0) {
    return {
      step: "custom_values",
      status: "skipped",
      created: 0,
      updated: 0,
      skipped: 0,
      duration_ms: Date.now() - started,
    };
  }

  // En dry-run NO tocamos GHL — confiamos en la idempotency table para
  // saber qué crearíamos / actualizaríamos. Antes había un GET acá como
  // "sanity check" pero contradecía el contrato del dry-run y disparaba
  // 401s ruidosos cuando el location token no estaba todavía emitido.

  for (const cv of cvs) {
    const local_key = cv.key;
    // GHL guarda custom values como strings. Serializamos otros tipos.
    const valueStr = cv.value === null || cv.value === undefined
      ? ""
      : typeof cv.value === "string"
      ? cv.value
      : JSON.stringify(cv.value);

    // GHL usa `name` como identificador humano; nosotros lo derivamos del key
    // con formato title-case. El cliente puede editarlo después en la UI.
    const name = humanize(local_key);

    const payload = { name, value: valueStr };
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
        external_id: decision.action === "update" ? decision.external_id : undefined,
      });
      continue;
    }

    // apply mode
    if (decision.action === "create") {
      const res = await locationFetch<GhlCustomValue | { customValue?: GhlCustomValue }>(
        ctx,
        `/locations/${ctx.location_id}/customValues`,
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
      created++;
      items.push({ local_key, action: "create", external_id: ext });
    } else {
      // update
      const res = await locationFetch<GhlCustomValue | { customValue?: GhlCustomValue }>(
        ctx,
        `/locations/${ctx.location_id}/customValues/${decision.external_id}`,
        { method: "PUT", body: JSON.stringify(payload) },
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
    step: "custom_values",
    status: hadError ? "error" : "ok",
    created,
    updated,
    skipped,
    duration_ms: Date.now() - started,
    items,
  };
}

function extractId(
  data: GhlCustomValue | { customValue?: GhlCustomValue } | undefined,
): string | null {
  if (!data) return null;
  if ("id" in data && typeof data.id === "string") return data.id;
  if ("customValue" in data && data.customValue?.id) return data.customValue.id;
  return null;
}

function humanize(key: string): string {
  return key
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => {
      const first = w.charAt(0);
      return first ? first.toUpperCase() + w.slice(1) : w;
    })
    .join(" ");
}
