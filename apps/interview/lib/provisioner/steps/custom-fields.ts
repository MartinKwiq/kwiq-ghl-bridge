/**
 * Step: custom fields (contact y opportunity).
 *
 * Sincroniza `autoconfig.custom_fields[]` con los custom fields del Location
 * en GHL. Endpoints:
 *
 *   GET  /locations/{locationId}/customFields                  → listar
 *   POST /locations/{locationId}/customFields                  → crear
 *   PUT  /locations/{locationId}/customFields/{id}             → actualizar
 *
 * Scope requerido: `locations/customFields.readonly` y
 * `locations/customFields.write`.
 *
 * Idempotencia: `local_key = field_key`. El fingerprint cubre name,
 * data_type, model, options.
 *
 * Mapeo data_type Kwiq → GHL:
 *   "TEXT"             → "TEXT"
 *   "LARGE_TEXT"       → "LARGE_TEXT"
 *   "NUMERICAL"        → "NUMERICAL"
 *   "DATE"             → "DATE"
 *   "PHONE"            → "PHONE"
 *   "EMAIL"            → "EMAIL"
 *   "SINGLE_OPTIONS"   → "SINGLE_OPTIONS"
 *   "MULTIPLE_OPTIONS" → "MULTIPLE_OPTIONS"
 *   "RADIO"            → "RADIO"
 *   "CHECKBOX"         → "CHECKBOX"
 *   "FILE_UPLOAD"      → "FILE_UPLOAD"
 *   "MONETORY"         → "MONETORY"
 */
import type { LocationContext, ProvisionInput, StepResult } from "../types";
import { locationFetch } from "../location-client";
import {
  decideActionWithRemote,
  fingerprint,
  upsertResourceRecord,
} from "../idempotency";
import { findByNormalizedName } from "../normalize";

const RESOURCE_KIND = "custom_field";

interface GhlCustomField {
  id: string;
  name: string;
  fieldKey?: string;
  dataType?: string;
  model?: string;
}

interface GhlCustomFieldResponse {
  customField?: GhlCustomField;
  id?: string;
}

export async function stepCustomFields(
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

  const fields = input.autoconfig.custom_fields ?? [];
  if (fields.length === 0) {
    return {
      step: "custom_fields",
      status: "skipped",
      created: 0,
      updated: 0,
      skipped: 0,
      duration_ms: Date.now() - started,
    };
  }

  // Helper: resolver el id de un folder en GHL desde el inventario remoto.
  // El snapshot Kwiq base puede traer folders pre-creadas ("Personales",
  // "Médicos") con su id. Si el `folder` del autoconfig coincide por
  // nombre normalizado con uno del inventario, usamos su id como parentId
  // y evitamos que GHL cree un folder duplicado.
  const folderInv = input.inventory.custom_field_folders;
  function resolveFolderParentId(folderName?: string | null): string | null {
    if (!folderName) return null;
    const matches = folderInv?.items ?? [];
    if (matches.length === 0) return null;
    const found = findByNormalizedName(matches, folderName, {
      fields: ["name"],
    });
    return found?.id ?? null;
  }

  for (const f of fields) {
    if (!f.field_key || !f.name) continue;
    const local_key = `${f.model ?? "contact"}:${f.field_key}`;

    // Si el autoconfig declaró un folder, intentamos mapearlo a un parentId
    // existente. Si no existe en GHL, dejamos parentId vacío y GHL crea el
    // folder con el nombre que mandamos (comportamiento histórico).
    const parentId = resolveFolderParentId(f.folder);

    // Payload normalizado para GHL.
    const payload: Record<string, unknown> = {
      name: f.name,
      dataType: f.data_type || "TEXT",
      model: f.model || "contact",
      placeholder: f.name,
      // Si encontramos parentId del folder, lo mandamos. Si no, mandamos
      // `folder` como string para que GHL lo cree.
      ...(parentId
        ? { parentId }
        : f.folder
          ? { folder: f.folder }
          : {}),
      // GHL pide `options` como objetos { name, value } cuando aplica.
      ...(f.options && f.options.length > 0
        ? {
            options: f.options.map((o) => ({ name: o, value: o })),
          }
        : {}),
    };

    const fp = fingerprint(payload);

    // Match contra inventario remoto: GHL devuelve `fieldKey` en el GET
    // de customFields, así que matcheamos por `fieldKey` o `name`.
    const remoteItems = input.inventory.custom_fields.items;
    const remote =
      findByNormalizedName(remoteItems, f.field_key, {
        fields: ["fieldKey", "name"],
      }) ?? findByNormalizedName(remoteItems, f.name, { fields: ["name"] });

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
      const res = await locationFetch<GhlCustomFieldResponse>(
        ctx,
        `/locations/${ctx.location_id}/customFields`,
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
          error: "GHL no devolvió id en POST customFields",
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
      const res = await locationFetch<GhlCustomFieldResponse>(
        ctx,
        `/locations/${ctx.location_id}/customFields/${decision.external_id}`,
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
    step: "custom_fields",
    status: hadError ? "error" : "ok",
    created,
    updated,
    skipped,
    duration_ms: Date.now() - started,
    items,
  };
}

function extractId(data: GhlCustomFieldResponse | undefined): string | null {
  if (!data) return null;
  if (typeof data.id === "string") return data.id;
  if (data.customField?.id) return data.customField.id;
  return null;
}
