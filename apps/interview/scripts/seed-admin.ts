/**
 * Seed del primer admin Kwiq.
 *
 * Crea a `martin@kwiq.io` con password por defecto `Kwiq!Admin-2026#bootstrap`.
 * Martín debe loguearse y cambiarla vía `/admin/perfil` (o Supabase dashboard).
 *
 * Requiere en `.env.local`:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso:
 *   npx tsx scripts/seed-admin.ts
 *   npx tsx scripts/seed-admin.ts otra-persona@kwiq.io "Custom Password 1!"
 *
 * Idempotente: si el usuario ya existe, no falla — solo informa y continúa.
 */

import { createClient } from "@supabase/supabase-js";

const DEFAULT_ADMIN_EMAIL = "martin@kwiq.io";
const DEFAULT_ADMIN_PASSWORD = "Kwiq!Admin-2026#bootstrap";

async function main() {
  const [, , emailArg, passwordArg] = process.argv;
  const email = (emailArg ?? DEFAULT_ADMIN_EMAIL).toLowerCase().trim();
  const password = passwordArg ?? DEFAULT_ADMIN_PASSWORD;

  if (!email.endsWith("@kwiq.io")) {
    console.error(`[seed-admin] Rechazado: ${email} no es @kwiq.io`);
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "[seed-admin] Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.",
    );
    process.exit(1);
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) ¿Ya existe?
  const { data: existing } = await sb.auth.admin.listUsers();
  const already = existing?.users.find((u) => u.email?.toLowerCase() === email);

  if (already) {
    console.log(`[seed-admin] ${email} ya existe (id=${already.id}).`);
    // Aseguramos que esté en kwiq_admins por si se borró manualmente.
    const { error } = await sb
      .from("kwiq_admins")
      .upsert({ user_id: already.id, role: "admin" }, { onConflict: "user_id" });
    if (error) {
      console.error("[seed-admin] No se pudo upsertar kwiq_admins:", error.message);
      process.exit(1);
    }
    console.log(`[seed-admin] kwiq_admins ok.`);
    return;
  }

  // 2) Crear usuario con email ya confirmado para evitar gate de verificación.
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: email.split("@")[0] },
  });

  if (createErr || !created.user) {
    console.error("[seed-admin] Error creando usuario:", createErr?.message);
    process.exit(1);
  }

  console.log(`[seed-admin] Usuario creado: ${created.user.id}`);
  console.log(`[seed-admin] Email    : ${email}`);
  console.log(`[seed-admin] Password : ${password}`);
  console.log(`[seed-admin] Cambiala tras el primer login.`);
}

main().catch((err) => {
  console.error("[seed-admin] Falló:", err);
  process.exit(1);
});
