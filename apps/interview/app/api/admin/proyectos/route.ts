import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";
import { requireAdminRole } from "@/lib/admin-auth";
import { createLocationForProject } from "@/lib/provisioner/create-location";

export const runtime = "nodejs"; // node:crypto needed for AES-256-GCM
export const dynamic = "force-dynamic";

const SlugSchema = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "slug_invalid");

/** Email opcional con string vacío permitido (los formularios mandan "" a veces). */
const OptionalEmail = z
  .union([z.string().email().max(254), z.literal(""), z.null()])
  .optional();

/** Texto opcional con string vacío permitido. */
const OptionalText = (max: number) =>
  z.union([z.string().max(max), z.literal(""), z.null()]).optional();

const BodySchema = z.object({
  client_name: z.string().min(1).max(120),
  slug: SlugSchema,
  contact_email: OptionalEmail,
  auth_mode: z.enum(["pit_agency", "pit_location", "oauth_marketplace"]),
  ghl_location_id: OptionalText(64),
  ghl_company_id: OptionalText(64),
  ghl_pit: z.string().min(8).max(512).optional(),
  notes: OptionalText(2000),
  // ─── Sprint 1B: datos del negocio + admin para crear sub-cuenta GHL ───
  admin_first_name: OptionalText(80),
  admin_last_name: OptionalText(80),
  admin_phone: OptionalText(40),
  business_name: OptionalText(200),
  business_niche: OptionalText(80),
  business_phone: OptionalText(40),
  business_address: OptionalText(200),
  business_city: OptionalText(120),
  business_state: OptionalText(120),
  business_country: OptionalText(2), // ISO-3166-1 alpha-2
  business_postal_code: OptionalText(20),
  business_website: OptionalText(255),
  business_timezone: OptionalText(64),
  business_lat: z.number().min(-90).max(90).optional().nullable(),
  business_lng: z.number().min(-180).max(180).optional().nullable(),
  snapshot_id: OptionalText(64),
  /** Si true, después de crear el proyecto en DB, creamos también la
   *  sub-cuenta en GHL automáticamente. Default true para el flow nuevo;
   *  false para mantener compatibilidad con el flow legacy donde el admin
   *  crea la sub-cuenta a mano. */
  create_ghl_location: z.boolean().optional(),
});

/**
 * Normaliza un valor opcional: trim + null si quedó vacío.
 */
function blank(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

/**
 * POST /api/admin/proyectos
 *
 * Crea un proyecto Kwiq en `kwiq_projects`. Requiere owner o admin
 * (operator no puede crear proyectos). Si el `auth_mode` es `pit_location`,
 * cifra el PIT con AES-256-GCM antes de guardarlo.
 */
export async function POST(req: Request) {
  // 1) sesión + rol (owner o admin — operator solo puede ejecutar, no crear)
  const me = await requireAdminRole(["owner", "admin"]);
  if (!me.ok) {
    return NextResponse.json(
      { error: me.error, message: me.message },
      { status: me.status },
    );
  }
  const admin = supabaseAdmin();

  // 2) body
  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_body",
        detail: err instanceof z.ZodError ? err.issues[0]?.message : undefined,
      },
      { status: 400 },
    );
  }

  // 3) validaciones cruzadas de modo ↔ credenciales
  const locationId = blank(parsed.ghl_location_id);
  const companyId = blank(parsed.ghl_company_id);
  const contactEmail = blank(parsed.contact_email);
  const notes = blank(parsed.notes);

  if (parsed.auth_mode === "pit_location") {
    if (!parsed.ghl_pit || parsed.ghl_pit.trim().length < 8) {
      return NextResponse.json({ error: "missing_pit" }, { status: 400 });
    }
    if (!locationId) {
      return NextResponse.json({ error: "missing_location" }, { status: 400 });
    }
  }
  if (parsed.auth_mode === "oauth_marketplace" && !locationId) {
    return NextResponse.json({ error: "missing_location" }, { status: 400 });
  }

  // 4) cifrado del PIT (solo cuando aplica)
  let tokenEnc: string | null = null;
  if (parsed.auth_mode === "pit_location" && parsed.ghl_pit) {
    try {
      tokenEnc = encryptSecret(parsed.ghl_pit.trim());
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[admin/proyectos] encryptSecret falló:", err);
      return NextResponse.json(
        {
          error: "crypto_error",
          detail:
            "INTERVIEW_ENCRYPTION_KEY no está configurada correctamente.",
        },
        { status: 500 },
      );
    }
  }

  // 5) insert — onConflict=slug para detectar colisiones
  const statusAfterInsert =
    parsed.auth_mode === "pit_agency" || tokenEnc
      ? "ready_for_interview"
      : "draft";

  const { data: inserted, error: insertErr } = await admin
    .from("kwiq_projects")
    .insert({
      slug: parsed.slug,
      client_name: parsed.client_name.trim(),
      contact_email: contactEmail,
      status: statusAfterInsert,
      auth_mode: parsed.auth_mode,
      ghl_location_id: locationId,
      ghl_company_id: companyId,
      ghl_token_enc: tokenEnc,
      notes,
      created_by: me.userId,
      // Sprint 1B: persistimos los datos del negocio + admin para que
      // luego el provisioner pueda crear la sub-cuenta GHL.
      admin_first_name: blank(parsed.admin_first_name),
      admin_last_name: blank(parsed.admin_last_name),
      admin_phone: blank(parsed.admin_phone),
      business_name: blank(parsed.business_name),
      business_niche: blank(parsed.business_niche),
      business_phone: blank(parsed.business_phone),
      business_address: blank(parsed.business_address),
      business_city: blank(parsed.business_city),
      business_state: blank(parsed.business_state),
      business_country: blank(parsed.business_country)?.toUpperCase() ?? null,
      business_postal_code: blank(parsed.business_postal_code),
      business_website: blank(parsed.business_website),
      business_timezone: blank(parsed.business_timezone),
      business_lat: parsed.business_lat ?? null,
      business_lng: parsed.business_lng ?? null,
      snapshot_id: blank(parsed.snapshot_id),
    })
    .select("id, slug, status, auth_mode, created_at, ghl_location_id")
    .single();

  if (insertErr) {
    // Postgres unique_violation
    if (insertErr.code === "23505") {
      return NextResponse.json({ error: "slug_taken" }, { status: 409 });
    }
    // eslint-disable-next-line no-console
    console.error("[admin/proyectos] insert error:", insertErr);
    return NextResponse.json(
      { error: "db_error", detail: insertErr.message },
      { status: 500 },
    );
  }

  // 6) Creación automática de la sub-cuenta GHL (Sprint 1B)
  // Si el admin pidió crear la sub-cuenta y todavía no hay location_id,
  // intentamos crearla ahora. Si falla, devolvemos el proyecto creado +
  // error de GHL para que la UI muestre el detalle y permita reintentar.
  let ghl: Awaited<ReturnType<typeof createLocationForProject>> | null = null;
  if (parsed.create_ghl_location && !inserted.ghl_location_id) {
    ghl = await createLocationForProject(inserted.id);
    if (ghl.status === "created" || ghl.status === "already_exists") {
      // Refrescamos el proyecto con el location_id recién guardado.
      const { data: refreshed } = await admin
        .from("kwiq_projects")
        .select("id, slug, status, auth_mode, created_at, ghl_location_id")
        .eq("id", inserted.id)
        .single();
      if (refreshed) Object.assign(inserted, refreshed);
    }
  }

  return NextResponse.json(
    { ok: true, ...inserted, ghl_creation: ghl },
    { status: 201 },
  );
}

/**
 * GET /api/admin/proyectos — listado simple para fetch del lado cliente.
 * La mayoría de las vistas hacen query directa en RSC; esto es opcional.
 *
 * Visible para los 3 roles (owner / admin / operator). Operator necesita
 * ver el listado para poder ejecutar tareas sobre los proyectos asignados.
 */
export async function GET() {
  const me = await requireAdminRole(["owner", "admin", "operator"]);
  if (!me.ok) {
    return NextResponse.json(
      { error: me.error, message: me.message },
      { status: me.status },
    );
  }
  const admin = supabaseAdmin();

  const { data: projects, error } = await admin
    .from("kwiq_projects")
    .select(
      "id, slug, client_name, contact_email, status, auth_mode, ghl_location_id, updated_at, created_at",
    )
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "db_error", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ projects: projects ?? [] });
}
