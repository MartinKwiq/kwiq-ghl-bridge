import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { createLocationForProject } from "@/lib/provisioner/create-location";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/proyectos/[slug]/create-location
 *
 * Reintenta la creación de la sub-cuenta GHL para un proyecto Kwiq que
 * todavía no la tiene. Útil cuando:
 *  - La primera creación falló por scopes faltantes en el PIT.
 *  - El admin regeneró el PIT con scopes correctos.
 *  - Faltaban datos en el form y se completaron después.
 *
 * Idempotente: si el proyecto ya tiene `ghl_location_id`, devuelve OK
 * sin tocar GHL.
 *
 * Autorización: owner o admin (no operator).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const me = await requireAdminRole(["owner", "admin"]);
  if (!me.ok) {
    return NextResponse.json(
      { error: me.error, message: me.message },
      { status: me.status },
    );
  }

  const { slug } = await params;
  const sb = supabaseAdmin();

  const { data: project, error: projectErr } = await sb
    .from("kwiq_projects")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (projectErr) {
    return NextResponse.json(
      { error: "db_error", detail: projectErr.message },
      { status: 500 },
    );
  }
  if (!project) {
    return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }

  const result = await createLocationForProject(project.id);

  // El status del result determina el HTTP status que devolvemos.
  const httpStatus =
    result.status === "created" || result.status === "already_exists"
      ? 200
      : result.status === "missing_data"
        ? 422
        : result.status === "config_error"
          ? 500
          : result.status === "ghl_error"
            ? result.ghl_status ?? 502
            : 500;

  return NextResponse.json(result, { status: httpStatus });
}
