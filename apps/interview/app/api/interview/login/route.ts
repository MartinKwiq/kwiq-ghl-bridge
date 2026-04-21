import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
});

/**
 * POST /api/interview/login
 *
 * Login de un cliente de entrevista (NO del equipo Kwiq). Autentica contra
 * Supabase Auth con email + password. A diferencia de /api/admin/login:
 *   - No hay restricción de dominio de email.
 *   - Valida que el user_id esté en `kwiq_interview_users` (no en
 *     `kwiq_admins`), para evitar que alguien del equipo use esta ruta.
 *
 * Si el usuario todavía no seteó su password (recién aceptó el invite y
 * canjeó el magic link desde /interview/accept-invite), el flow esperado
 * es ingresar por /interview/accept-invite primero y desde ahí setear
 * password. Este endpoint rechaza el caso sin password con 401 limpio.
 */
export async function POST(req: Request) {
  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const email = parsed.email.toLowerCase().trim();

  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password: parsed.password,
  });

  if (error || !data.user) {
    return NextResponse.json(
      { error: "invalid_credentials" },
      { status: 401 },
    );
  }

  // Doble check: el user debe estar en kwiq_interview_users.
  // Si quisieran loguearse como admin por esta ruta, los cerramos.
  const admin = supabaseAdmin();
  const { data: row } = await admin
    .from("kwiq_interview_users")
    .select("user_id, project_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!row) {
    await sb.auth.signOut();
    // Mensaje no-revelante: no queremos filtrar si el email existe en otra tabla.
    return NextResponse.json(
      { error: "not_interview_user" },
      { status: 403 },
    );
  }

  // Touch de last_login_at (y first_login_at si aún no estaba seteado).
  const now = new Date().toISOString();
  await admin
    .from("kwiq_interview_users")
    .update({
      last_login_at: now,
    })
    .eq("user_id", data.user.id);

  // first_login_at solo si es null (evitamos sobrescribir).
  await admin
    .from("kwiq_interview_users")
    .update({ first_login_at: now })
    .eq("user_id", data.user.id)
    .is("first_login_at", null);

  return NextResponse.json({
    ok: true,
    user_id: data.user.id,
    project_id: row.project_id,
  });
}
