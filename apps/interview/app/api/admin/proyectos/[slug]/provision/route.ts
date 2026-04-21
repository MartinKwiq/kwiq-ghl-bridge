/**
 * POST /api/admin/proyectos/[slug]/provision
 *
 * Dispara el provisioner sobre un proyecto Kwiq. Body:
 *   { mode: "dry_run" | "apply" }
 *
 * - Requiere admin logueado y en `kwiq_admins`.
 * - Corre `runProvisioner()` inline (sin queue). Devuelve el RunReport.
 * - Los errores globales del orquestador se reportan con status 200 +
 *   `report.status === "failed"` para que la UI los renderice igual que
 *   un fallo parcial (mostrar mensaje al admin).
 *
 * GET /api/admin/proyectos/[slug]/provision
 *
 * Devuelve los últimos N runs del proyecto (default 10) para que el panel
 * del admin muestre el historial sin tocar Supabase del lado cliente.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { runProvisioner } from "@/lib/provisioner";
import { requireAdminRole, type KwiqAdminRole } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// runProvisioner puede tardar varios segundos (varios round-trips HTTP a GHL).
// En Vercel Pro el máximo de duration de un serverless route es 60s. Subirlo
// si es necesario; mientras tanto 60s alcanza para el MVP.
export const maxDuration = 60;

const BodySchema = z.object({
  mode: z.enum(["dry_run", "apply"]),
});

type RouteParams = { params: Promise<{ slug: string }> };

// Quién puede hacer qué con el provisioner:
//  - POST (correr provisioner): owner, admin, operator
//    El operator es justamente el rol pensado para "ejecutor" — corre runs
//    sobre proyectos que ya configuró el equipo, sin poder editar settings
//    ni crear proyectos.
//  - GET (ver historial): owner, admin, operator
const ALLOWED_ROLES: KwiqAdminRole[] = ["owner", "admin", "operator"];

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
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_body",
        detail: err instanceof z.ZodError ? err.issues[0]?.message : undefined,
      },
      { status: 400 },
    );
  }

  const admin = supabaseAdmin();
  const { data: project, error: projErr } = await admin
    .from("kwiq_projects")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (projErr) {
    return NextResponse.json(
      { error: "db_error", detail: projErr.message },
      { status: 500 },
    );
  }
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const report = await runProvisioner({
      project_id: project.id as string,
      mode: body.mode,
      triggered_by: me.userId,
    });
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    // Los errores dentro del orquestador ya se vuelcan al RunReport; esto
    // atrapa fallos "pre-insert" u otras excepciones del runtime.
    // eslint-disable-next-line no-console
    console.error("[provision] runProvisioner threw:", err);
    return NextResponse.json(
      {
        error: "run_failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

export async function GET(_req: Request, { params }: RouteParams) {
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

  const { data: runs, error } = await admin
    .from("kwiq_provisioning_runs")
    .select(
      "id, status, error_message, step_results, started_at, finished_at, created_at, triggered_by",
    )
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json(
      { error: "db_error", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ runs: runs ?? [] });
}
