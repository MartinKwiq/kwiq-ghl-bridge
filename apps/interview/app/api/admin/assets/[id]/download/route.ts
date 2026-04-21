import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdminRole } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNED_URL_TTL_SECONDS = 60 * 10; // 10 minutos

/**
 * GET /api/admin/assets/[id]/download
 *
 * Devuelve una URL firmada de Supabase Storage para descargar el asset.
 * Accesible para los 3 roles (owner / admin / operator) — el operator
 * necesita poder bajar los assets para terminar de configurar el proyecto.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || id.length > 64) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const me = await requireAdminRole(["owner", "admin", "operator"]);
  if (!me.ok) {
    return NextResponse.json(
      { error: me.error, message: me.message },
      { status: me.status },
    );
  }
  const admin = supabaseAdmin();

  // Lookup del asset
  const { data: asset, error: assetErr } = await admin
    .from("branding_assets")
    .select("id, file_path, original_name, mime_type")
    .eq("id", id)
    .maybeSingle();

  if (assetErr || !asset) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Signed URL
  const { data: signed, error: signErr } = await admin.storage
    .from("branding")
    .createSignedUrl(asset.file_path, SIGNED_URL_TTL_SECONDS, {
      download: asset.original_name ?? true,
    });

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { error: "sign_failed", detail: signErr?.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    url: signed.signedUrl,
    expires_in: SIGNED_URL_TTL_SECONDS,
    original_name: asset.original_name,
    mime_type: asset.mime_type,
  });
}
