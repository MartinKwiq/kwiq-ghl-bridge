import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/assets/[id]
 *
 * Borra el asset (fila + binario en Storage). Solo admins autenticados.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || id.length > 64) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

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
