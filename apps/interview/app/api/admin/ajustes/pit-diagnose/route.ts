/**
 * GET /api/admin/ajustes/pit-diagnose
 *
 * Diagnóstico del Agency PIT cargado en settings. Devuelve 2 fuentes de verdad:
 *
 *  1. `token_meta` → lo que dice el propio token por dentro (si es un JWT se
 *     decodifica sin validar firma — solo se lee el payload). Acá vemos los
 *     scopes "horneados" en el token al emitirse, a qué companyId pertenece,
 *     si es Company o Location level, y cuándo expira.
 *
 *  2. `probes` → pruebas en vivo contra services.leadconnectorhq.com usando
 *     el PIT cargado. Cada probe apunta a un endpoint que requiere un scope
 *     específico; si devuelve 2xx el scope está operativo, si devuelve 401/403
 *     el scope falta o no fue emitido en el token.
 *
 * Nunca devolvemos el PIT en claro ni a la respuesta ni a logs — solo
 * metadata derivada.
 *
 * Auth: requiere owner o admin (no operator — no ve settings globales).
 */
import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { getAgencyContext } from "@/lib/ghl/agency-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

// ---------- Tipos de respuesta ----------

interface TokenMeta {
  /** companyId (o authClassId) grabado en el JWT. */
  issued_to_company_id: string | null;
  /** locationId si el PIT es de sub-cuenta (no de agencia). */
  issued_to_location_id: string | null;
  /** "Company" | "Location" | otro — indica el tipo de PIT. */
  auth_class: string | null;
  /** Lista de scopes grabados dentro del token al emitirse. */
  scopes: string[];
  issued_at: string | null;
  expires_at: string | null;
}

interface ProbeResult {
  /** Identificador human-readable del recurso (p.ej. "snapshots"). */
  resource: string;
  /** Scope que típicamente se necesita para este endpoint. */
  expected_scope: string;
  /** ¿La probe devolvió 2xx? */
  ok: boolean;
  status: number | null;
  /** Mensaje que devolvió GHL si falló (sin secretos). */
  message: string | null;
}

interface DiagResponse {
  token_format: "jwt" | "opaque";
  token_meta: TokenMeta | null;
  settings_company_id: string;
  /** `true` si el JWT apunta a un companyId distinto del que hay en settings. */
  company_mismatch: boolean;
  /**
   * Si la probe de `companies` falló pero la de `locations` funcionó, intentamos
   * descubrir el companyId real de la agencia mirando el campo `companyId` que
   * viene adentro del primer location devuelto. Si encontramos algo distinto al
   * que hay en settings, lo exponemos acá como sugerencia al admin.
   */
  discovered_company_id: string | null;
  probes: ProbeResult[];
}

// ---------- JWT helpers ----------

function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + padding, "base64").toString("utf8");
}

function tryDecodeJwt(token: string): TokenMeta | null {
  if (!token || !token.includes(".")) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let raw: Record<string, unknown>;
  try {
    const segment = parts[1];
    if (!segment) return null;
    raw = JSON.parse(base64UrlDecode(segment)) as Record<string, unknown>;
  } catch {
    return null;
  }

  const companyId =
    typeof raw.companyId === "string"
      ? (raw.companyId as string)
      : typeof raw.authClassId === "string" && raw.authClass === "Company"
        ? (raw.authClassId as string)
        : null;

  const locationId =
    typeof raw.locationId === "string"
      ? (raw.locationId as string)
      : typeof raw.authClassId === "string" && raw.authClass === "Location"
        ? (raw.authClassId as string)
        : null;

  const authClass =
    typeof raw.authClass === "string" ? (raw.authClass as string) : null;

  // Scopes viven en distintas claves según la versión del token de GHL.
  // Probamos varias en orden.
  let scopes: string[] = [];
  const oauthMeta = raw.oauthMeta as { scopes?: unknown } | undefined;
  if (Array.isArray(oauthMeta?.scopes)) {
    scopes = oauthMeta!.scopes.filter((s): s is string => typeof s === "string");
  } else if (Array.isArray(raw.scopes)) {
    scopes = (raw.scopes as unknown[]).filter(
      (s): s is string => typeof s === "string",
    );
  } else if (typeof raw.scope === "string") {
    scopes = (raw.scope as string).split(/\s+/).filter(Boolean);
  }

  const iat = typeof raw.iat === "number" ? (raw.iat as number) : null;
  const exp = typeof raw.exp === "number" ? (raw.exp as number) : null;

  return {
    issued_to_company_id: companyId,
    issued_to_location_id: locationId,
    auth_class: authClass,
    scopes,
    issued_at: iat ? new Date(iat * 1000).toISOString() : null,
    expires_at: exp ? new Date(exp * 1000).toISOString() : null,
  };
}

// ---------- Probes ----------

async function probe(
  pit: string,
  resource: string,
  path: string,
  scope: string,
): Promise<ProbeResult> {
  try {
    const res = await fetch(`${GHL_BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${pit}`,
        Version: GHL_API_VERSION,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (res.ok) {
      return {
        resource,
        expected_scope: scope,
        ok: true,
        status: res.status,
        message: null,
      };
    }
    let message: string = res.statusText;
    try {
      const body = (await res.json()) as {
        message?: string;
        error?: string;
      };
      message = body.message ?? body.error ?? message;
    } catch {
      // cuerpo no-JSON, nos quedamos con el statusText
    }
    return {
      resource,
      expected_scope: scope,
      ok: false,
      status: res.status,
      message,
    };
  } catch (err) {
    return {
      resource,
      expected_scope: scope,
      ok: false,
      status: null,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------- Handler ----------

export async function GET() {
  const me = await requireAdminRole(["owner", "admin"]);
  if (!me.ok) {
    return NextResponse.json(
      { error: me.error, message: me.message },
      { status: me.status },
    );
  }

  const ctxRes = await getAgencyContext();
  if (!ctxRes.ok) {
    return NextResponse.json(
      { error: "not_configured", missing: ctxRes.missing },
      { status: 400 },
    );
  }

  const { pit, companyId } = ctxRes.ctx;

  const tokenMeta = tryDecodeJwt(pit);
  const tokenFormat: "jwt" | "opaque" = tokenMeta ? "jwt" : "opaque";

  const companyMismatch = Boolean(
    tokenMeta?.issued_to_company_id &&
      tokenMeta.issued_to_company_id !== companyId,
  );

  // Probes en paralelo — todos son reads idempotentes con `limit=1` cuando
  // aplica para no inflar el rate-limit.
  //
  // `companies` funciona como control: si ese endpoint devuelve 2xx con el
  // mismo companyId pero snapshots rebota con 403, el problema NO es que la
  // companyId esté mal — es una limitación específica de /snapshots/ con
  // PITs que está documentada en el foro de GHL.
  const probes = await Promise.all([
    probe(
      pit,
      "snapshots",
      `/snapshots/?companyId=${encodeURIComponent(companyId)}&limit=1`,
      "snapshots.readonly",
    ),
    probe(
      pit,
      "locations",
      `/locations/search?companyId=${encodeURIComponent(companyId)}&limit=1`,
      "locations.readonly",
    ),
    probe(
      pit,
      "companies",
      `/companies/${encodeURIComponent(companyId)}`,
      "companies.readonly",
    ),
  ]);

  // Si companies falló pero locations funcionó, tratamos de descubrir el
  // companyId "real" de la agencia leyendo el campo `companyId` del primer
  // location devuelto. Cada location en GHL trae adentro el ID de su agencia
  // padre — así conseguimos sugerencia automática sin que el admin tenga
  // que cazarlo en URLs.
  const snapshotsProbe = probes.find((p) => p.resource === "snapshots");
  const locationsProbe = probes.find((p) => p.resource === "locations");
  const companiesProbe = probes.find((p) => p.resource === "companies");

  let discoveredCompanyId: string | null = null;
  if (locationsProbe?.ok && !companiesProbe?.ok) {
    try {
      const res = await fetch(
        `${GHL_BASE_URL}/locations/search?companyId=${encodeURIComponent(companyId)}&limit=1`,
        {
          headers: {
            Authorization: `Bearer ${pit}`,
            Version: GHL_API_VERSION,
            Accept: "application/json",
          },
          cache: "no-store",
        },
      );
      if (res.ok) {
        const body = (await res.json()) as {
          locations?: Array<{ companyId?: string }>;
        };
        const first = body.locations?.[0]?.companyId;
        if (first && first !== companyId) {
          discoveredCompanyId = first;
        }
      }
    } catch {
      // Si la sonda falla no hacemos nada — la información que ya
      // tenemos alcanza para que el admin arregle a mano.
    }
  }

  // silence "unused" cuando el probe existe pero no se usa
  void snapshotsProbe;

  const response: DiagResponse = {
    token_format: tokenFormat,
    token_meta: tokenMeta,
    settings_company_id: companyId,
    company_mismatch: companyMismatch,
    discovered_company_id: discoveredCompanyId,
    probes,
  };

  return NextResponse.json(response);
}
