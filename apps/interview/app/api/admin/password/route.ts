import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdminRole } from "@/lib/admin-auth";

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
  // Cualquier miembro del equipo Kwiq puede cambiar su propia contraseña.
  const me = await requireAdminRole(["owner", "admin", "operator"]);
  if (!me.ok) {
    return NextResponse.json(
      { error: me.error, message: me.message },
      { status: me.status },
    );
  }
  const admin = supabaseAdmin();

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

  const { error: upErr } = await admin.auth.admin.updateUserById(me.userId, {
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
