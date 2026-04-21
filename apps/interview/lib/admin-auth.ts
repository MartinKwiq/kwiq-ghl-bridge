/**
 * Helpers server-side para verificar rol de admin.
 *
 * El middleware Edge ya gatea "hay sesión + email @kwiq.io". Estos helpers se
 * usan en Server Components y Route Handlers para:
 *   - confirmar que el usuario está en `kwiq_admins` (allowlist),
 *   - leer su rol ('owner' | 'admin' | 'operator'),
 *   - validar que tiene permisos suficientes para la acción pedida.
 *
 * Cualquier función que devuelve `AdminAuthResult` con `ok: false` debe
 * traducirse a una respuesta 401/403 por el caller (Route Handler) o a un
 * redirect/notFound por el Server Component.
 */
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

export type KwiqAdminRole = "owner" | "admin" | "operator";

export type AdminAuthResult =
  | {
      ok: true;
      userId: string;
      email: string;
      role: KwiqAdminRole;
      displayName: string | null;
    }
  | {
      ok: false;
      status: 401 | 403;
      error: "not_authenticated" | "not_admin" | "insufficient_role";
      message: string;
    };

/**
 * Devuelve el admin actual con su rol, o un error estructurado si no.
 *
 * Uso típico en Route Handler:
 *   const me = await getCurrentAdmin();
 *   if (!me.ok) return NextResponse.json({ error: me.error }, { status: me.status });
 */
export async function getCurrentAdmin(): Promise<AdminAuthResult> {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) {
    return {
      ok: false,
      status: 401,
      error: "not_authenticated",
      message: "No hay sesión activa.",
    };
  }

  const admin = supabaseAdmin();
  const { data: row, error } = await admin
    .from("kwiq_admins")
    .select("user_id, role, display_name")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error || !row) {
    return {
      ok: false,
      status: 403,
      error: "not_admin",
      message: "Tu usuario no está en la allowlist de administradores.",
    };
  }

  const role = normalizeRole(row.role);
  return {
    ok: true,
    userId: row.user_id,
    email: auth.user.email || "",
    role,
    displayName: (row.display_name as string | null) ?? null,
  };
}

/**
 * Endurece `getCurrentAdmin()` exigiendo uno de los roles permitidos.
 *
 * Si el usuario está autenticado pero no tiene rol suficiente, devuelve 403
 * con `insufficient_role` — el caller lo traduce a UI friendly.
 */
export async function requireAdminRole(
  allowed: KwiqAdminRole[],
): Promise<AdminAuthResult> {
  const me = await getCurrentAdmin();
  if (!me.ok) return me;
  if (!allowed.includes(me.role)) {
    return {
      ok: false,
      status: 403,
      error: "insufficient_role",
      message: `Necesitás uno de estos roles: ${allowed.join(", ")}.`,
    };
  }
  return me;
}

function normalizeRole(raw: unknown): KwiqAdminRole {
  if (raw === "owner" || raw === "admin" || raw === "operator") return raw;
  // Cualquier valor legacy o inesperado cae a 'admin' — coincide con el
  // default histórico de la columna.
  return "admin";
}

/**
 * Flags derivados del rol — azúcar sintáctico para los componentes UI.
 */
export function adminCapabilities(role: KwiqAdminRole) {
  const isOwner = role === "owner";
  const isAdmin = role === "admin";
  const isOperator = role === "operator";

  return {
    isOwner,
    isAdmin,
    isOperator,

    // Escribir proyectos, settings no-secretos, ajustes de branding.
    canEditProjects: isOwner || isAdmin,

    // Tocar secretos (PIT, API keys, encryption key).
    canEditSecrets: isOwner,

    // Gestionar la allowlist de admins.
    canManageTeam: isOwner,

    // Invitar/borrar usuarios cliente.
    canManageClients: isOwner || isAdmin,

    // Correr el provisioner.
    canProvision: isOwner || isAdmin,
  };
}
