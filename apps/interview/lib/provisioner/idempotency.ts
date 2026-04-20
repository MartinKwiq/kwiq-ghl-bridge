/**
 * Idempotency helpers: cada recurso aplicado a GHL guarda en
 * `kwiq_provisioning_resources` su ID externo + un fingerprint sha256 del
 * payload canónico. Antes de crear/actualizar consultamos esa tabla:
 *
 *   - Si no existe el row → POST (create).
 *   - Si existe + fingerprint igual → skip.
 *   - Si existe + fingerprint distinto → PATCH (update) con el external_id.
 *
 * Así re-correr el provisioner sobre el mismo proyecto no duplica recursos
 * ni spamea writes.
 */
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Hash estable del payload. Ordena las keys para que { a, b } === { b, a }. */
export function fingerprint(payload: unknown): string {
  const canonical = canonicalize(payload);
  return createHash("sha256").update(canonical).digest("hex");
}

function canonicalize(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, val]) => val !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([k, val]) => `${JSON.stringify(k)}:${canonicalize(val)}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(v));
}

export interface ResourceRecord {
  project_id: string;
  resource_kind: string;
  local_key: string;
  external_id: string;
  fingerprint: string;
}

/**
 * Busca el row de idempotency para un (project, kind, local_key). Devuelve
 * `null` si no existe. Usa service_role para bypassear RLS (el provisioner
 * corre server-side).
 */
export async function getResourceRecord(
  project_id: string,
  resource_kind: string,
  local_key: string,
): Promise<ResourceRecord | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("kwiq_provisioning_resources")
    .select("project_id, resource_kind, local_key, external_id, fingerprint")
    .eq("project_id", project_id)
    .eq("resource_kind", resource_kind)
    .eq("local_key", local_key)
    .maybeSingle();
  if (error) {
    throw new Error(`idempotency lookup failed: ${error.message}`);
  }
  return data as ResourceRecord | null;
}

/**
 * Upsert del row post-aplicación exitosa. Llamar después de haber
 * confirmado que GHL devolvió 200/201.
 */
export async function upsertResourceRecord(
  project_id: string,
  resource_kind: string,
  local_key: string,
  external_id: string,
  fingerprint_value: string,
  run_id: string | null,
): Promise<void> {
  const admin = supabaseAdmin();
  const { error } = await admin.from("kwiq_provisioning_resources").upsert(
    {
      project_id,
      resource_kind,
      local_key,
      external_id,
      fingerprint: fingerprint_value,
      last_run_id: run_id,
      last_applied_at: new Date().toISOString(),
    },
    { onConflict: "project_id,resource_kind,local_key" },
  );
  if (error) {
    throw new Error(`idempotency upsert failed: ${error.message}`);
  }
}

/**
 * Decisión que toma el step en base al estado de idempotency y el
 * fingerprint actual.
 */
export type IdempotencyDecision =
  | { action: "create"; reason: "new" }
  | { action: "update"; external_id: string; reason: "fingerprint_changed" }
  | { action: "skip"; external_id: string; reason: "fingerprint_equal" };

export async function decideAction(
  project_id: string,
  resource_kind: string,
  local_key: string,
  new_fingerprint: string,
): Promise<IdempotencyDecision> {
  const existing = await getResourceRecord(project_id, resource_kind, local_key);
  if (!existing) return { action: "create", reason: "new" };
  if (existing.fingerprint === new_fingerprint) {
    return { action: "skip", external_id: existing.external_id, reason: "fingerprint_equal" };
  }
  return {
    action: "update",
    external_id: existing.external_id,
    reason: "fingerprint_changed",
  };
}
