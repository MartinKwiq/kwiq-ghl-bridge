/**
 * POST /api/admin/proyectos/[slug]/location-pit
 *
 * Guarda el Sub-account PIT (Private Integration Token) de la sub-cuenta
 * GHL del proyecto. Antes de persistirlo, lo VALIDA haciendo un GET
 * /locations/{id} contra GHL — si responde 200, el PIT es válido y lo
 * cifra y guarda. Si responde 401/403, devuelve error con detalle para
 * que el admin sepa qué hacer.
 *
 * DELETE /api/admin/proyectos/[slug]/location-pit
 *
 * Borra el PIT (rotación / revocación). Quedan los timestamps para
 * auditoría.
 *
 * Solo accesible para admins Kwiq con rol owner | admin.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdminRole, type KwiqAdminRole } from "@/lib/admin-auth";
import { encryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  pit: z.string().min(20).max(2000),
});

type RouteParams = { params: Promise<{ slug: string }> };

const ALLOWED_ROLES: KwiqAdminRole[] = ["owner", "admin"];

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

export async function POST(req: Request, { params }: RouteParams) {
  const me = await requireAdminRole(ALLOWED_ROLES);
  if (!me.ok) {
    return NextResponse.json(
      { error: me.error, message: me.message },
      { status: me.status },
    );
  }

  const { slug } = await params;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "Falta el campo `pit` (string válido)." },
      { status: 400 },
    );
  }

  const admin = supabaseAdmin();

  const { data: project, error: projErr } = await admin
    .from("kwiq_projects")
    .select("id, ghl_location_id, ghl_location_pit_enc")
    .eq("slug", slug)
    .maybeSingle();

  if (projErr) {
    return NextResponse.json(
      { error: "db_error", message: projErr.message },
      { status: 500 },
    );
  }
  if (!project) {
    return NextResponse.json(
      { error: "not_found", message: "Proyecto no encontrado." },
      { status: 404 },
    );
  }
  if (!project.ghl_location_id) {
    return NextResponse.json(
      {
        error: "no_location",
        message:
          "Este proyecto todavía no tiene sub-cuenta GHL creada. Creala primero antes de cargar el PIT.",
      },
      { status: 400 },
    );
  }

  // ── Validación del PIT contra GHL ─────────────────────────────────
  // Hacemos GET /locations/{id} con el PIT. Si devuelve 200, el PIT es
  // válido y tiene al menos read sobre la sub-cuenta. Si 401/403, el
  // PIT está mal o le faltan scopes.
  const pit = body.pit.trim();
  const validation = await validatePit(pit, project.ghl_location_id);
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: "pit_invalid",
        message: validation.message,
        ghl_status: validation.status,
      },
      { status: 400 },
    );
  }

  // ── Cifrado y persistencia ────────────────────────────────────────
  let cipher: string;
  try {
    cipher = encryptSecret(pit);
  } catch (err) {
    return NextResponse.json(
      {
        error: "encryption_failed",
        message:
          "El PIT no se pudo cifrar. Avisale al equipo Kwiq — falta configurar INTERVIEW_ENCRYPTION_KEY en Vercel.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  const isFirstLoad = !project.ghl_location_pit_enc;
  const now = new Date().toISOString();

  const { error: updErr } = await admin
    .from("kwiq_projects")
    .update({
      ghl_location_pit_enc: cipher,
      ghl_location_pit_loaded_at: isFirstLoad ? now : undefined,
      ghl_location_pit_rotated_at: isFirstLoad ? null : now,
      ghl_location_pit_loaded_by: me.userId,
    })
    .eq("id", project.id);

  if (updErr) {
    return NextResponse.json(
      { error: "db_error", message: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    is_first_load: isFirstLoad,
    location_name: validation.location_name,
    validated_at: now,
  });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const me = await requireAdminRole(ALLOWED_ROLES);
  if (!me.ok) {
    return NextResponse.json(
      { error: me.error, message: me.message },
      { status: me.status },
    );
  }

  const { slug } = await params;
  const admin = supabaseAdmin();

  const { data: project } = await admin
    .from("kwiq_projects")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error: updErr } = await admin
    .from("kwiq_projects")
    .update({
      ghl_location_pit_enc: null,
      ghl_location_pit_rotated_at: new Date().toISOString(),
    })
    .eq("id", project.id);

  if (updErr) {
    return NextResponse.json(
      { error: "db_error", message: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

/**
 * Valida un PIT contra GHL haciendo GET /locations/{id}. Devuelve OK si
 * el PIT puede leer la sub-cuenta (mínimo scope `locations.readonly`).
 *
 * Si falla, devuelve un mensaje accionable explicando qué tiene que
 * arreglar el admin.
 */
async function validatePit(
  pit: string,
  locationId: string,
): Promise<
  | { ok: true; location_name?: string }
  | { ok: false; status: number; message: string }
> {
  try {
    const res = await fetch(`${GHL_BASE_URL}/locations/${locationId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${pit}`,
        Version: GHL_API_VERSION,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        location?: { name?: string };
        name?: string;
      };
      return {
        ok: true,
        location_name: data.location?.name ?? data.name,
      };
    }

    if (res.status === 401) {
      return {
        ok: false,
        status: 401,
        message:
          "El PIT no es válido o ya fue revocado. Generá uno nuevo desde Settings → Private Integrations dentro de la sub-cuenta GHL.",
      };
    }

    if (res.status === 403) {
      return {
        ok: false,
        status: 403,
        message:
          "El PIT no tiene scope `locations.readonly`. Editalo en GHL y agregale al menos los scopes de lectura/escritura para tags, customFields, customValues, opportunities y calendars.",
      };
    }

    if (res.status === 404) {
      return {
        ok: false,
        status: 404,
        message:
          "GHL no encuentra la sub-cuenta con ese location_id. ¿Estás generando el PIT desde la sub-cuenta correcta?",
      };
    }

    let detail = res.statusText;
    try {
      const body = (await res.json()) as { message?: string };
      detail = body.message ?? detail;
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      status: res.status,
      message: `GHL devolvió ${res.status}: ${detail}`,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: `No pudimos llegar a GHL: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
