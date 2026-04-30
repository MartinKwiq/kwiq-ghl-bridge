/**
 * Crea una sub-cuenta nueva en GHL para un `kwiq_project` que aún no la tiene.
 *
 * Diferencia con los `steps/*` regulares: este flow opera **a nivel
 * agencia** (no location), porque la location todavía no existe. Por eso
 * no se invoca desde `runProvisioner` — se llama directamente desde el
 * endpoint POST /api/admin/proyectos cuando el admin completa el form, o
 * desde /admin/proyectos/[slug] vía un botón "Crear sub-cuenta en GHL"
 * para reintentar si falló la primera vez.
 *
 * Idempotencia: si el proyecto ya tiene `ghl_location_id`, devuelve `ok`
 * sin tocar GHL. Eso permite reintentar sin riesgo.
 *
 * Falla soft: si GHL devuelve 401/403 por scopes faltantes en el PIT, el
 * call devuelve `{ ok: false }` con un mensaje accionable. El proyecto
 * queda en DB sin location_id; el admin puede regenerar el PIT y
 * reintentar después.
 */
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSetting } from "@/lib/settings";
import {
  createLocation,
  getAgencyContext,
  type AgencyResult,
  type CreateLocationInput,
} from "@/lib/ghl/agency-client";

export interface CreateLocationForProjectResult {
  status: "created" | "already_exists" | "missing_data" | "ghl_error" | "config_error";
  /** El location_id resultante — siempre devuelto en `created` y `already_exists`. */
  location_id?: string;
  /** Detalle del error si status != "created" / "already_exists". */
  message?: string;
  /** Campos faltantes si status == "missing_data". */
  missing?: string[];
  /** Status HTTP de GHL si status == "ghl_error". */
  ghl_status?: number;
}

/**
 * Hace el flow completo: lee el proyecto, valida que tenga los datos
 * mínimos, llama a GHL, y persiste el location_id en `kwiq_projects`.
 */
export async function createLocationForProject(
  projectId: string,
): Promise<CreateLocationForProjectResult> {
  const sb = supabaseAdmin();

  const { data: project, error: projectErr } = await sb
    .from("kwiq_projects")
    .select(
      `id, slug, ghl_location_id,
       admin_first_name, admin_last_name, admin_phone, contact_email,
       business_name, business_phone, business_address, business_city,
       business_state, business_country, business_postal_code,
       business_website, business_timezone, business_lat, business_lng,
       snapshot_id`,
    )
    .eq("id", projectId)
    .maybeSingle();

  if (projectErr || !project) {
    return {
      status: "config_error",
      message: `Proyecto ${projectId} no encontrado: ${projectErr?.message ?? "no row"}`,
    };
  }

  // Idempotencia: ya tiene location_id → no hacemos nada.
  if (project.ghl_location_id) {
    return {
      status: "already_exists",
      location_id: project.ghl_location_id,
    };
  }

  // Validación de campos obligatorios.
  const missing: string[] = [];
  if (!project.business_name) missing.push("business_name");
  if (!project.business_country) missing.push("business_country");
  if (!project.business_timezone) missing.push("business_timezone");
  if (!project.business_phone) missing.push("business_phone");
  if (!project.contact_email) missing.push("contact_email");
  if (!project.admin_first_name) missing.push("admin_first_name");
  if (!project.admin_last_name) missing.push("admin_last_name");

  if (missing.length) {
    return {
      status: "missing_data",
      message: `Faltan campos para crear la sub-cuenta: ${missing.join(", ")}.`,
      missing,
    };
  }

  // Resolución del snapshot: el del proyecto si está, sino el default global.
  let snapshotId = project.snapshot_id ?? null;
  if (!snapshotId) {
    snapshotId = (await getSetting("ghl.default_snapshot_id")) ?? null;
  }

  // Contexto de la agencia (PIT + companyId).
  const agency = await getAgencyContext();
  if (!agency.ok) {
    return {
      status: "config_error",
      message: `Faltan ajustes de la agencia: ${agency.missing.join(", ")}.`,
      missing: agency.missing,
    };
  }

  const input: CreateLocationInput = {
    name: project.business_name!,
    phone: project.business_phone!,
    email: project.contact_email!,
    firstName: project.admin_first_name!,
    lastName: project.admin_last_name!,
    address: project.business_address ?? undefined,
    city: project.business_city ?? undefined,
    state: project.business_state ?? undefined,
    country: project.business_country!,
    postalCode: project.business_postal_code ?? undefined,
    website: project.business_website ?? undefined,
    timezone: project.business_timezone!,
    snapshotId: snapshotId ?? undefined,
    lat: project.business_lat ?? undefined,
    lng: project.business_lng ?? undefined,
  };

  const result: AgencyResult<{ id: string }> = await createLocation(
    agency.ctx,
    input,
  );

  if (!result.ok) {
    if (result.reason === "http_error") {
      return {
        status: "ghl_error",
        message: `GHL respondió ${result.status}: ${result.message}`,
        ghl_status: result.status,
      };
    }
    if (result.reason === "network_error") {
      return {
        status: "ghl_error",
        message: `Red caída hacia GHL: ${result.message}`,
      };
    }
    return {
      status: "config_error",
      message: `Faltan ajustes: ${result.missing.join(", ")}.`,
      missing: result.missing,
    };
  }

  const locationId = result.data.id;

  // Persistimos el location_id + timestamp.
  const { error: updErr } = await sb
    .from("kwiq_projects")
    .update({
      ghl_location_id: locationId,
      ghl_location_created_at: new Date().toISOString(),
      // Si el admin no había setteado company_id, lo dejamos en null —
      // location_id es lo único que necesita el resto del provisioner.
    })
    .eq("id", projectId);

  if (updErr) {
    // GHL ya creó la sub-cuenta pero no pudimos guardar el id en DB.
    // Devolvemos error con el location_id para que el admin pueda copiarlo
    // a mano si quiere — sino nos quedamos con una sub-cuenta huérfana.
    return {
      status: "ghl_error",
      location_id: locationId,
      message: `GHL creó la sub-cuenta (id=${locationId}) pero no pudimos guardarla en DB: ${updErr.message}. Pegá el id a mano en el detalle del proyecto para reconectar.`,
    };
  }

  return {
    status: "created",
    location_id: locationId,
  };
}
