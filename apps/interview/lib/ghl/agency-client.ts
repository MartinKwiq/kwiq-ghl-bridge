/**
 * Cliente HTTP mínimo contra la API v2 de LeadConnector (GoHighLevel) con
 * autenticación por Agency PIT. Solo se usa desde el servidor (nunca exponer
 * el PIT al browser).
 *
 * Diseño:
 *  - El token y el companyId viven en `kwiq_settings` (`ghl.agency_pit`,
 *    `ghl.agency_company_id`). Si alguno falta, las funciones devuelven
 *    `{ ok: false, reason: "not_configured" }` — la UI los pide cargar en
 *    /admin/ajustes.
 *  - Toda llamada usa los headers canónicos de HighLevel:
 *      Authorization: Bearer <pit>
 *      Version: 2021-07-28
 *      Accept: application/json
 *  - Los errores se devuelven como data (no se tiran) para que el server
 *    component los renderice sin tirar el panel entero.
 *
 * Ref: docs/02-gohighlevel-api-rest.md y docs/01-gohighlevel-auth-oauth.md
 */
import { getSetting } from "@/lib/settings";

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

export interface AgencyContext {
  pit: string;
  companyId: string;
}

export type AgencyResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "not_configured"; missing: string[] }
  | { ok: false; reason: "http_error"; status: number; message: string }
  | { ok: false; reason: "network_error"; message: string };

/**
 * Lee el PIT y el companyId desde settings y los devuelve juntos. Devuelve
 * `null` si alguno falta, anotando cuáles.
 */
export async function getAgencyContext(): Promise<
  { ok: true; ctx: AgencyContext } | { ok: false; missing: string[] }
> {
  const [pit, companyId] = await Promise.all([
    getSetting("ghl.agency_pit"),
    getSetting("ghl.agency_company_id"),
  ]);
  const missing: string[] = [];
  if (!pit) missing.push("ghl.agency_pit");
  if (!companyId) missing.push("ghl.agency_company_id");
  if (missing.length) return { ok: false, missing };
  return { ok: true, ctx: { pit: pit as string, companyId: companyId as string } };
}

async function agencyFetch<T>(
  ctx: AgencyContext,
  path: string,
  init?: RequestInit,
): Promise<AgencyResult<T>> {
  const url = path.startsWith("http") ? path : `${GHL_BASE_URL}${path}`;
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${ctx.pit}`,
        Version: GHL_API_VERSION,
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
      // No cachear nada — el panel se refresca manualmente.
      cache: "no-store",
    });
    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = (await res.json()) as { message?: string; error?: string };
        message = body.message ?? body.error ?? message;
      } catch {
        // ignore
      }
      return {
        ok: false,
        reason: "http_error",
        status: res.status,
        message,
      };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      reason: "network_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------- Snapshots ----------

export interface AgencySnapshot {
  id: string;
  name: string;
  type?: string | null;
}

/**
 * GET /snapshots/?companyId=...  — lista de snapshots disponibles para la
 * agencia. La API devuelve `{ snapshots: [...] }` en v2.
 */
export async function fetchAgencySnapshots(
  ctx: AgencyContext,
): Promise<AgencyResult<AgencySnapshot[]>> {
  const res = await agencyFetch<{ snapshots?: AgencySnapshot[] }>(
    ctx,
    `/snapshots/?companyId=${encodeURIComponent(ctx.companyId)}`,
  );
  if (!res.ok) return res;
  return { ok: true, data: res.data.snapshots ?? [] };
}

// ---------- Locations ----------

export interface AgencyLocation {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  companyId?: string | null;
  dateAdded?: string | null;
  timezone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
}

/**
 * GET /locations/search?companyId=...&limit=...  — todas las sub-cuentas bajo
 * la agencia. Soporta paginación vía skip/limit; acá traemos hasta 100 porque
 * es suficiente para el panel inicial.
 */
export async function fetchAgencyLocations(
  ctx: AgencyContext,
  opts?: { limit?: number },
): Promise<AgencyResult<AgencyLocation[]>> {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
  const qs = new URLSearchParams({
    companyId: ctx.companyId,
    limit: String(limit),
  });
  const res = await agencyFetch<{ locations?: AgencyLocation[] }>(
    ctx,
    `/locations/search?${qs.toString()}`,
  );
  if (!res.ok) return res;
  return { ok: true, data: res.data.locations ?? [] };
}

/**
 * Input para crear una nueva sub-cuenta. Replica los campos que GHL
 * requiere u ofrece en el wizard "Add sub-account":
 *
 *  - `name`, `phone`, `address`, `city`, `state`, `country`,
 *    `postalCode`, `website`, `timezone`: del negocio.
 *  - `firstName`, `lastName`, `email`: del usuario admin de la sub-cuenta
 *    (humano que va a recibir la invitación de GHL).
 *  - `prospectInfo`: GHL clona estos datos como el primer "prospect" en
 *    la nueva sub-cuenta — útil pero opcional.
 *  - `snapshotId`: si está, GHL aplica el snapshot al crear (workflows,
 *    templates, etc.). Si no, la sub-cuenta nace vacía.
 *  - `companyId`: la agencia bajo la que cuelga (siempre el de Kwiq).
 *
 * Nota: GHL exige al menos `name`, `email`, `firstName`, `lastName`,
 * `phone` y `country`. El resto es opcional pero recomendado.
 */
export interface CreateLocationInput {
  name: string;
  phone: string;
  email: string;
  firstName: string;
  lastName: string;
  address?: string;
  city?: string;
  state?: string;
  country: string;
  postalCode?: string;
  website?: string;
  timezone: string;
  snapshotId?: string;
  /** Coordenadas del negocio (si las capturamos vía mapa). */
  lat?: number;
  lng?: number;
}

/** Respuesta de POST /locations/ — solo los campos que nos importan. */
export interface CreatedLocation {
  id: string;
  name: string;
  email?: string | null;
  companyId?: string | null;
  timezone?: string | null;
}

/**
 * POST /locations/ — crea una sub-cuenta nueva bajo la agencia. El PIT
 * tiene que tener el scope `locations.write`; sin él, GHL responde 403
 * con un mensaje genérico.
 *
 * GHL devuelve el `id` (que es nuestro `ghl_location_id`). Lo guardamos
 * en `kwiq_projects` para que el resto del provisioner pueda configurar
 * la sub-cuenta usando el header `Location-Id`.
 *
 * Es seguro reintentar este call si falla a mitad — GHL no expone un
 * concepto de "idempotency-key", pero la combinación (companyId + name +
 * email) es chequeada y devuelve 409 si ya existe.
 */
export async function createLocation(
  ctx: AgencyContext,
  input: CreateLocationInput,
): Promise<AgencyResult<CreatedLocation>> {
  const body: Record<string, unknown> = {
    companyId: ctx.companyId,
    name: input.name,
    phone: input.phone,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    country: input.country,
    timezone: input.timezone,
  };

  if (input.address) body.address = input.address;
  if (input.city) body.city = input.city;
  if (input.state) body.state = input.state;
  if (input.postalCode) body.postalCode = input.postalCode;
  if (input.website) body.website = input.website;
  if (input.snapshotId) body.snapshotId = input.snapshotId;

  // GHL acepta lat/lng como geocodificación pre-resuelta — nos ahorra que
  // ellos hagan geocoding interno (con mejor consistencia si usamos Mapbox).
  if (typeof input.lat === "number" && typeof input.lng === "number") {
    body.location = { lat: input.lat, lng: input.lng };
  }

  // Prospect: GHL crea un contacto inicial con los datos del admin. Útil
  // como "primer registro" de la sub-cuenta.
  body.prospectInfo = {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
  };

  const res = await agencyFetch<{ id?: string; location?: CreatedLocation } & CreatedLocation>(
    ctx,
    `/locations/`,
    { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } },
  );
  if (!res.ok) return res;

  // GHL a veces devuelve { id, ... } directo y a veces { location: { id, ... } }
  // según la versión del endpoint. Normalizamos.
  const data = res.data;
  const created: CreatedLocation = data.location
    ? data.location
    : {
        id: data.id ?? "",
        name: data.name ?? input.name,
        email: data.email ?? input.email,
        companyId: data.companyId ?? ctx.companyId,
        timezone: data.timezone ?? input.timezone,
      };

  if (!created.id) {
    return {
      ok: false,
      reason: "http_error",
      status: 500,
      message: "GHL respondió 200 pero no devolvió `id` de la sub-cuenta nueva.",
    };
  }

  return { ok: true, data: created };
}

// ---------- Helpers UI ----------

/** Formatea el error de un AgencyResult para mostrar al admin sin stack traces. */
export function describeAgencyError(r: Exclude<AgencyResult<unknown>, { ok: true }>): string {
  switch (r.reason) {
    case "not_configured":
      return `Faltan ajustes: ${r.missing.join(", ")}`;
    case "http_error":
      return `HighLevel respondió ${r.status}: ${r.message}`;
    case "network_error":
      return `No pude alcanzar HighLevel — ${r.message}`;
  }
}

/**
 * Qué recurso se intentó consultar — se usa para dar hints accionables cuando
 * HighLevel devuelve 401/403 (típicamente scopes del PIT).
 */
export type AgencyResource =
  | "snapshots"
  | "locations"
  | "contacts"
  | "custom-values"
  | "calendars"
  | "conversations";

/**
 * Scope que típicamente hay que prender en el PIT para cada recurso.
 * El panel de GHL usa estos mismos nombres en los checkboxes al crear un PIT.
 */
const SCOPE_BY_RESOURCE: Record<AgencyResource, string> = {
  snapshots: "snapshots.readonly",
  locations: "locations.readonly",
  contacts: "contacts.readonly / contacts.write",
  "custom-values": "locations/customValues.readonly / .write",
  calendars: "calendars.readonly / calendars.write",
  conversations: "conversations.readonly / conversations.write",
};

export interface AgencyErrorHint {
  /** Copy corto y accionable — "Qué hacer para destrabarlo". */
  hint: string;
  /** Ruta interna recomendada para resolverlo (si aplica). */
  href?: string;
}

/**
 * Devuelve un hint accionable para el admin según el tipo de error y el
 * recurso que se estaba consultando. `null` si no hay nada inteligente que
 * decir más allá del mensaje crudo.
 */
export function agencyErrorHint(
  r: Exclude<AgencyResult<unknown>, { ok: true }>,
  resource: AgencyResource,
): AgencyErrorHint | null {
  if (r.reason === "not_configured") {
    return {
      hint: "Cargá el PIT y el companyId en Ajustes.",
      href: "/admin/ajustes",
    };
  }
  if (r.reason === "http_error" && (r.status === 401 || r.status === 403)) {
    // Caso especial: el endpoint /snapshots/ tiene una limitación conocida
    // del lado de GoHighLevel — no honora el scope `snapshots.readonly` en
    // PITs aunque el checkbox aparezca al crear la llave. Regenerar la PIT
    // no arregla esto, por eso el hint genérico ("regeneralo") es
    // engañoso acá.
    if (resource === "snapshots" && r.status === 403) {
      return {
        hint:
          `GoHighLevel no deja listar snapshots desde una PIT, aunque tildes el checkbox "snapshots.readonly" al emitirla — es una limitación documentada de su lado. ` +
          `Tu llave y tu companyId pueden estar perfectos; regenerarla no cambia este error. Para confirmarlo, usá "Diagnosticar" en Ajustes: si locations y companies dan verde pero snapshots queda en rojo, es exactamente este caso. ` +
          `Workaround actual: pegá el ID del snapshot a mano en la configuración de cada proyecto. El endpoint de "aplicar snapshot" sí funciona con PIT; solo el de "listar" está bloqueado.`,
        href: "/admin/ajustes",
      };
    }
    const scope = SCOPE_BY_RESOURCE[resource];
    return {
      hint:
        `El PIT no tiene permiso sobre ${resource} — el scope "${scope}" no está grabado en el token. ` +
        `Los permisos se graban dentro del PIT solo al emitirlo: tildar el checkbox en HighLevel > Settings > ` +
        `Private Integrations y guardar NO alcanza; hay que apretar "Regenerate Token" (o crear uno nuevo) y ` +
        `pegar la llave nueva en Ajustes. Usá la herramienta "Diagnosticar" en Ajustes para ver qué scopes ` +
        `trae realmente tu token.`,
      href: "/admin/ajustes",
    };
  }
  if (r.reason === "http_error" && r.status === 429) {
    return {
      hint: "Alcanzaste el rate limit de HighLevel (100 req/10s). Esperá unos segundos y refrescá.",
    };
  }
  if (r.reason === "network_error") {
    return {
      hint: "Revisá conectividad saliente de Vercel hacia services.leadconnectorhq.com.",
    };
  }
  return null;
}
