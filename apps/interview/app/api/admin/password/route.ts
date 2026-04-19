import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  password: z.string().min(10).max(200),
});

/**
 * POST /api/admin/password
 *
 * Cambia la contraseña del admin logueado. Usa service_role sobre
 * auth.admin.updateUserById — más confiable que updateUser() en SSR porque
 * no depende de que la sesión client-side esté refrescada.
 */
export async function POST(req: Request) {
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

  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_body",
        detail:
          err instanceof z.ZodError
            ? err.issues[0]?.message
            : "Contraseña inválida.",
      },
      { status: 400 },
    );
  }

  const { error: upErr } = await admin.auth.admin.updateUserById(auth.user.id, {
    password: parsed.password,
  });

  if (upErr) {
    // eslint-disable-next-line no-console
    console.error("[admin/password] updateUserById", upErr);
    return NextResponse.json(
      { error: "update_failed", detail: upErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
