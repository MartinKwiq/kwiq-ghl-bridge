import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";

export const runtime = "nodejs"; // node:crypto needed for AES-256-GCM
export const dynamic = "force-dynamic";

const SlugSchema = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "slug_invalid");

const BodySchema = z.object({
  client_name: z.string().min(1).max(120),
  slug: SlugSchema,
  contact_email: z
    .union([z.string().email().max(254), z.literal(""), z.null()])
    .optional(),
  auth_mode: z.enum(["pit_agency", "pit_location", "oauth_marketplace"]),
  ghl_location_id: z
    .union([z.string().min(1).max(64), z.literal(""), z.null()])
    .optional(),
  ghl_company_id: z
    .union([z.string().min(1).max(64), z.literal(""), z.null()])
    .optional(),
  ghl_pit: z.string().min(8).max(512).optional(),
  notes: z
    .union([z.string().max(2000), z.literal(""), z.null()])
    .optional(),
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
 * Crea un proyecto Kwiq en `kwiq_projects`. Requiere admin logueado y en
 * allowlist. Si el `auth_mode` es `pit_location`, cifra el PIT con AES-256-GCM
 * antes de guardarlo.
 */
export async function POST(req: Request) {
  // 1) sesión admin
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data: adminRow } = await admin
    .from("kwiq_admins")
    .select("user_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!adminRow) {
    return NextResponse.json({ error: "not_admin" }, { status: 403 });
  }

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
      created_by: auth.user.id,
    })
    .select("id, slug, status, auth_mode, created_at")
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

  return NextResponse.json({ ok: true, ...inserted }, { status: 201 });
}

/**
 * GET /api/admin/proyectos — listado simple para fetch del lado cliente.
 * La mayoría de las vistas hacen query directa en RSC; esto es opcional.
 */
export async function GET() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data: adminRow } = await admin
    .from("kwiq_admins")
    .select("user_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!adminRow) {
    return NextResponse.json({ error: "not_admin" }, { status: 403 });
  }

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
