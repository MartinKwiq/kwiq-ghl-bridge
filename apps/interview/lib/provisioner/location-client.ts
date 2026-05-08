/**
 * Cliente HTTP contra GHL v2 con scope de Location.
 *
 * **Modelo de auth (post-Sprint 2)**:
 *
 * GHL no permite usar el Agency PIT directamente para escribir DENTRO de
 * una sub-cuenta — devuelve 401 "The token is not authorized for this
 * scope" incluso con todos los scopes activos. Por eso Kwiq usa un
 * **Sub-account PIT** específico de cada sub-cuenta, generado manualmente
 * desde la UI de GHL (Settings → Private Integrations dentro de la
 * sub-cuenta) y almacenado cifrado en `kwiq_projects.ghl_location_pit_enc`.
 *
 * El Agency PIT (kwiq_settings.ghl.agency_pit) sigue usándose solo para
 * crear sub-cuentas y crear users a nivel agencia (ver
 * `lib/ghl/agency-client.ts`).
 *
 * Para más contexto, leer `docs/GHL-AUTH.md`.
 */
import { supabaseAdmin } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import type { HttpResult, LocationContext } from "./types";

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

/**
 * Resuelve el contexto Location a partir del proyecto Kwiq.
 *
 * Lee el Sub-account PIT cifrado de `kwiq_projects.ghl_location_pit_enc`,
 * lo descifra, y lo retorna junto con el location_id y company_id.
 *
 * Retorna `null` si:
 *  - el proyecto no existe
 *  - la sub-cuenta GHL no fue creada todavía (`ghl_location_id` null)
 *  - el Sub-account PIT no fue cargado todavía (`ghl_location_pit_enc` null)
 *
 * El orquestador del run.ts toma este `null` y devuelve un error global
 * con un mensaje accionable para que el admin sepa qué cargar.
 */
export async function getLocationContextByProject(
  projectId: string,
): Promise<
  | { ok: true; ctx: LocationContext }
  | {
      ok: false;
      reason: "no_project" | "no_location" | "no_location_pit" | "decrypt_failed";
      message: string;
    }
> {
  const admin = supabaseAdmin();

  const { data: project, error } = await admin
    .from("kwiq_projects")
    .select(
      "id, ghl_location_id, ghl_company_id, ghl_location_pit_enc",
    )
    .eq("id", projectId)
    .maybeSingle();

  if (error || !project) {
    return {
      ok: false,
      reason: "no_project",
      message: `Proyecto ${projectId} no encontrado: ${error?.message ?? "no row"}`,
    };
  }

  if (!project.ghl_location_id) {
    return {
      ok: false,
      reason: "no_location",
      message:
        "Este proyecto todavía no tiene sub-cuenta GHL creada. Apretá 'Crear sub-cuenta en GHL' antes de provisionar.",
    };
  }

  if (!project.ghl_location_pit_enc) {
    return {
      ok: false,
      reason: "no_location_pit",
      message:
        "Falta cargar el Sub-account PIT. Generalo desde Settings → Private Integrations dentro de la sub-cuenta GHL y cargalo en la card 'GHL · Sub-account PIT' arriba.",
    };
  }

  let pit: string;
  try {
    pit = decryptSecret(project.ghl_location_pit_enc);
  } catch (err) {
    return {
      ok: false,
      reason: "decrypt_failed",
      message:
        "El Sub-account PIT está corrupto o la INTERVIEW_ENCRYPTION_KEY cambió. Cargá un PIT nuevo.",
    };
  }

  return {
    ok: true,
    ctx: {
      pit,
      location_id: project.ghl_location_id,
      company_id: project.ghl_company_id ?? "",
    },
  };
}

/**
 * @deprecated Mantengamos esta firma para no romper callers que solo
 * tienen el location_id. Internamente sigue requiriendo que el proyecto
 * tenga el Sub-account PIT cargado. Preferí `getLocationContextByProject`.
 */
export async function getLocationContext(
  locationId: string,
): Promise<LocationContext | null> {
  const admin = supabaseAdmin();
  const { data: project } = await admin
    .from("kwiq_projects")
    .select("id")
    .eq("ghl_location_id", locationId)
    .maybeSingle();
  if (!project) return null;
  const r = await getLocationContextByProject(project.id);
  return r.ok ? r.ctx : null;
}

export interface LocationFetchOptions extends RequestInit {
  /** Si true, agrega el header `Location-Id` además de la auth. */
  scope_location?: boolean;
}

/**
 * `fetch` con los headers canónicos. Usa el Sub-account PIT del proyecto
 * (que ctx.pit ya tiene resuelto y descifrado).
 */
export async function locationFetch<T>(
  ctx: LocationContext,
  path: string,
  opts?: LocationFetchOptions,
): Promise<HttpResult<T>> {
  const url = path.startsWith("http") ? path : `${GHL_BASE_URL}${path}`;
  const scopeLocation = opts?.scope_location ?? false;

  const baseHeaders: Record<string, string> = {
    Authorization: `Bearer ${ctx.pit}`,
    Version: GHL_API_VERSION,
    Accept: "application/json",
  };
  if (scopeLocation) baseHeaders["Location-Id"] = ctx.location_id;

  // Content-Type se agrega solo si hay body.
  if (opts?.body && !(opts?.headers as Record<string, string> | undefined)?.["Content-Type"]) {
    baseHeaders["Content-Type"] = "application/json";
  }

  try {
    const res = await fetch(url, {
      ...opts,
      headers: {
        ...baseHeaders,
        ...(opts?.headers as Record<string, string> | undefined),
      },
      cache: "no-store",
    });
    return await parseResponse<T>(res);
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

async function parseResponse<T>(res: Response): Promise<HttpResult<T>> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      message = body.message ?? body.error ?? message;
    } catch {
      /* ignore */
    }
    return { ok: false, status: res.status, message };
  }
  if (res.status === 204) {
    return { ok: true, data: undefined as unknown as T };
  }
  const data = (await res.json()) as T;
  return { ok: true, data };
}
