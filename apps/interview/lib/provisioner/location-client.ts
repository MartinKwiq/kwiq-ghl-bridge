/**
 * Cliente HTTP contra GHL v2 con scope de Location. Autentica con el Agency
 * PIT que vive en `kwiq_settings["ghl.agency_pit"]` — esto funciona porque
 * un Agency PIT (con los scopes correctos) puede actuar sobre cualquier
 * sub-cuenta bajo la agencia.
 *
 * Para endpoints que incluyen el locationId en el path (ej.
 * `/locations/{locationId}/customValues`), basta con `Authorization: Bearer`.
 * Para endpoints que no lo tienen (ej. `/contacts/`), agregamos el header
 * `Location-Id` explícito.
 *
 * Los errores se devuelven como `HttpResult` para que los steps decidan
 * qué hacer (retry, abort el step, continuar con el próximo recurso).
 */
import { getSetting } from "@/lib/settings";
import type { HttpResult, LocationContext } from "./types";

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

/**
 * Arma el contexto Location a partir del `ghl_location_id` del proyecto.
 * Devuelve `null` si falta el PIT en settings — el orquestador corta el run
 * con un error global en ese caso.
 */
export async function getLocationContext(
  locationId: string,
): Promise<LocationContext | null> {
  const pit = await getSetting("ghl.agency_pit");
  if (!pit || !locationId) return null;
  return { pit, location_id: locationId };
}

export interface LocationFetchOptions extends RequestInit {
  /** Si true, agrega el header `Location-Id` además de la auth. */
  scope_location?: boolean;
}

/**
 * `fetch` con los headers canónicos. `path` puede ser relativo
 * (`/locations/xyz/...`) o absoluto.
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
    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = (await res.json()) as { message?: string; error?: string };
        message = body.message ?? body.error ?? message;
      } catch {
        // ignore parse error
      }
      return { ok: false, status: res.status, message };
    }
    if (res.status === 204) {
      return { ok: true, data: undefined as unknown as T };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
