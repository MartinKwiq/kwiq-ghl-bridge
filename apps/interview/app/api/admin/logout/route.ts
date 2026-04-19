import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * POST /api/admin/logout
 *
 * Cierra la sesión del admin (el form del layout hace POST y recarga).
 */
export async function POST() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  // Redirigimos a /admin/login tras logout.
  return NextResponse.redirect(
    new URL(
      "/admin/login",
      process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001",
    ),
    { status: 303 },
  );
}
