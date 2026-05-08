/**
 * Cliente HTTP contra GHL v2 con scope de Location.
 *
 * Importante (gotcha de GHL): el Agency PIT (con todos los scopes) NO se
 * puede usar directamente para POST/PUT/DELETE de recursos DENTRO de una
 * sub-cuenta — devuelve 401 "The token is not authorized for this scope".
 * Para escribir adentro de una sub-cuenta hay que canjear el Agency PIT
 * por un Location Access Token vía POST /oauth/locationToken, y usar ese
 * token. El Location Token tiene los scopes correctos para la sub-cuenta
 * y dura ~24 horas.
 *
 * Endpoints que SÍ funcionan con Agency PIT directo:
 *  - POST /locations/                          (crear sub-cuenta)
 *  - POST /users/                              (crear users en sub-cuenta)
 *  - GET  /locations/search?companyId=...      (listar sub-cuentas)
 *  - GET  /snapshots/?companyId=...            (listar snapshots)
 *
 * Endpoints que requieren Location Access Token:
 *  - POST /locations/{locationId}/tags
 *  - POST /locations/{locationId}/customFields
 *  - POST /locations/{locationId}/customValues
 *  - POST /opportunities/pipelines
 *  - POST /calendars/
 *  - POST /medias/upload-file
 *  - etc — todo lo que escribe dentro de la sub-cuenta.
 *
 * Esta clase resuelve esto transparentemente: cachea el location token por
 * locationId en memoria por la vida del proceso (TTL 23h, refresca cuando
 * está cerca de vencer).
 */
import { getSetting } from "@/lib/settings";
import type { HttpResult, LocationContext } from "./types";

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

/**
 * Cache de location tokens en memoria. Se invalida si pasaron más de 23h
 * o si recibimos 401 en una request usando el token cacheado.
 *
 * Nota: en Vercel serverless, este cache vive por instancia. Si la función
 * se duerme, el próximo request hará un fresh /oauth/locationToken — no
 * pasa nada, ese endpoint es rapidísimo.
 */
interface CachedLocationToken {
  access_token: string;
  expires_at: number; // timestamp ms
}
const tokenCache = new Map<string, CachedLocationToken>();
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000; // 23h, GHL emite por 24h

/**
 * Arma el contexto Location a partir del `ghl_location_id` del proyecto.
 * Devuelve `null` si falta el PIT o el companyId en settings.
 */
export async function getLocationContext(
  locationId: string,
): Promise<LocationContext | null> {
  const [pit, companyId] = await Promise.all([
    getSetting("ghl.agency_pit"),
    getSetting("ghl.agency_company_id"),
  ]);
  if (!pit || !companyId || !locationId) return null;
  return { pit, location_id: locationId, company_id: companyId };
}

/**
 * Canjea el Agency PIT por un Location Access Token con scope para la
 * sub-cuenta especificada. Cachea por locationId.
 *
 * Si el cache es válido y dentro del TTL, lo devuelve. Si no, llama a
 * /oauth/locationToken y guarda el resultado.
 *
 * GHL endpoint:
 *   POST /oauth/locationToken
 *   Authorization: Bearer <AGENCY_PIT>
 *   Body: { companyId, locationId }
 *   Response: { access_token: "...", expires_in: 86400, token_type: "Bearer", ... }
 */
async function getLocationAccessToken(
  ctx: LocationContext,
  forceRefresh = false,
): Promise<{ ok: true; token: string } | { ok: false; status: number; message: string }> {
  const cached = tokenCache.get(ctx.location_id);
  if (!forceRefresh && cached && cached.expires_at > Date.now()) {
    return { ok: true, token: cached.access_token };
  }

  if (!ctx.company_id) {
    return {
      ok: false,
      status: 0,
      message: "Falta ghl.agency_company_id en settings — no se puede emitir Location Token.",
    };
  }

  try {
    const res = await fetch(`${GHL_BASE_URL}/oauth/locationToken`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.pit}`,
        Version: GHL_API_VERSION,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      // /oauth/locationToken espera form-encoded, no JSON.
      body: new URLSearchParams({
        companyId: ctx.company_id,
        locationId: ctx.location_id,
      }).toString(),
      cache: "no-store",
    });

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

    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) {
      return {
        ok: false,
        status: 502,
        message: "GHL no devolvió access_token en /oauth/locationToken",
      };
    }

    const ttl = (data.expires_in ?? 86400) * 1000;
    tokenCache.set(ctx.location_id, {
      access_token: data.access_token,
      expires_at: Date.now() + Math.min(ttl, TOKEN_TTL_MS),
    });
    return { ok: true, token: data.access_token };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface LocationFetchOptions extends RequestInit {
  /** Si true, agrega el header `Location-Id` además de la auth. */
  scope_location?: boolean;
  /**
   * Si true, fuerza usar el Agency PIT directo en lugar del Location Token.
   * Útil para los pocos endpoints que requieren scope agencia (raros en
   * el provisioner; aplica para /oauth/locationToken mismo).
   */
  use_agency_pit?: boolean;
}

/**
 * `fetch` con los headers canónicos. Por default canjea el Agency PIT por
 * un Location Access Token. Si la URL es absoluta o el caller pone
 * `use_agency_pit: true`, usa el PIT directo.
 */
export async function locationFetch<T>(
  ctx: LocationContext,
  path: string,
  opts?: LocationFetchOptions,
): Promise<HttpResult<T>> {
  const url = path.startsWith("http") ? path : `${GHL_BASE_URL}${path}`;
  const scopeLocation = opts?.scope_location ?? false;

  // Resolver el bearer token: por default Location Token, salvo override.
  let bearer: string;
  if (opts?.use_agency_pit) {
    bearer = ctx.pit;
  } else {
    const tokenRes = await getLocationAccessToken(ctx);
    if (!tokenRes.ok) {
      return {
        ok: false,
        status: tokenRes.status,
        message: `No pudimos obtener Location Token: ${tokenRes.message}`,
      };
    }
    bearer = tokenRes.token;
  }

  const baseHeaders: Record<string, string> = {
    Authorization: `Bearer ${bearer}`,
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

    // Si el Location Token cacheado venció antes del TTL nominal y
    // recibimos 401, lo invalidamos y reintentamos UNA vez con token fresco.
    if (res.status === 401 && !opts?.use_agency_pit) {
      tokenCache.delete(ctx.location_id);
      const refreshed = await getLocationAccessToken(ctx, true);
      if (refreshed.ok) {
        const retry = await fetch(url, {
          ...opts,
          headers: {
            ...baseHeaders,
            Authorization: `Bearer ${refreshed.token}`,
            ...(opts?.headers as Record<string, string> | undefined),
          },
          cache: "no-store",
        });
        return await parseResponse<T>(retry);
      }
    }

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
