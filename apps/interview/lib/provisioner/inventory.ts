/**
 * Lectura del inventario remoto cacheado en DB
 * (`kwiq_projects.last_inventory_jsonb`).
 *
 * El admin Kwiq ejecuta "Sincronizar inventario" desde el panel admin
 * (vía /api/admin/proyectos/[slug]/inventory) — eso hace 6 GETs a GHL y
 * persiste el resultado. El provisioner lee este snapshot al inicio del
 * run para razonar sobre qué existe ya en la sub-cuenta sin gastar
 * llamadas HTTP en cada step.
 *
 * Si el inventario no existe o está más viejo que MAX_AGE_HOURS, el
 * orquestador aborta el run con un mensaje pidiendo al admin que
 * sincronice.
 */
import { supabaseAdmin } from "@/lib/supabase/server";

export interface InventoryEntry {
  id: string;
  name?: string;
  key?: string | null;
  fieldKey?: string | null;
  dataType?: string;
  model?: string;
  value?: string | null;
  stages?: Array<{ id: string; name: string; position?: number }>;
  email?: string;
  /** Id del folder al que pertenece (para custom_fields). */
  parentId?: string;
  /** Si el agente IA está activo (para ai_agents). */
  isActive?: boolean;
}

export interface InventorySection {
  count: number;
  items: InventoryEntry[];
  fetched: boolean;
  error?: string;
}

export interface InventoryReport {
  location_id: string;
  fetched_at: string;
  duration_ms: number;
  tags: InventorySection;
  custom_values: InventorySection;
  custom_fields: InventorySection;
  /** Folders/carpetas de custom_fields (pre-creados por snapshot). */
  custom_field_folders?: InventorySection;
  pipelines: InventorySection;
  calendars: InventorySection;
  users: InventorySection;
  /** Agentes Conversation AI (pre-creados por snapshot). */
  ai_agents?: InventorySection;
}

/** Inventario considerado vencido si tiene más de N horas. */
const MAX_AGE_HOURS = 24;

export async function loadInventoryFromDb(
  projectId: string,
): Promise<
  | { ok: true; report: InventoryReport; age_hours: number }
  | { ok: false; reason: "not_synced" | "stale" | "db_error"; message: string; age_hours?: number }
> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("kwiq_projects")
    .select("last_inventory_jsonb, last_inventory_fetched_at")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: "db_error", message: error.message };
  }
  if (!data?.last_inventory_jsonb || !data.last_inventory_fetched_at) {
    return {
      ok: false,
      reason: "not_synced",
      message:
        "Falta sincronizar el inventario de la sub-cuenta. Apretá 'Sincronizar' en la card 'GHL · Inventario actual' antes de provisionar.",
    };
  }
  const fetchedAt = new Date(data.last_inventory_fetched_at).getTime();
  const ageHours = (Date.now() - fetchedAt) / (1000 * 60 * 60);
  if (ageHours > MAX_AGE_HOURS) {
    return {
      ok: false,
      reason: "stale",
      message: `El inventario tiene ${Math.round(ageHours)}h. Re-sincronizá para tener el estado actual de la sub-cuenta.`,
      age_hours: ageHours,
    };
  }
  return {
    ok: true,
    report: data.last_inventory_jsonb as InventoryReport,
    age_hours: ageHours,
  };
}
