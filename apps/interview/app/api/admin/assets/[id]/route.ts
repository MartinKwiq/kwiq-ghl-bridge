import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdminRole } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/assets/[id]
 *
 * Borra el asset (fila + binario en Storage). owner y admin pueden borrar.
 * El operator puede ver/descargar (otra ruta) pero no puede borrar — los
 * assets son material del cliente y conviene tener un audit-trail acotado
 * a quien además podría editar el proyecto.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || id.length > 64) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const me = await requireAdminRole(["owner", "admin"]);
  if (!me.ok) {
    return NextResponse.json(
      { error: me.error, message: me.message },
      { status: me.status },
    );
  }
  const admin = supabaseAdmin();

  const { data: asset } = await admin
    .from("branding_assets")
    .select("id, file_path")
    .eq("id", id)
    .maybeSingle();

  if (!asset) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Borrar blob del bucket (no-op si ya no existe).
  await admin.storage.from("branding").remove([asset.file_path]).catch(() => {});

  const { error: delErr } = await admin
    .from("branding_assets")
    .delete()
    .eq("id", id);

  if (delErr) {
    return NextResponse.json(
      { error: "db_error", detail: delErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
