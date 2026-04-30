/**
 * Invitación de cliente — helper reutilizable.
 *
 * Encapsula la lógica de `auth.admin.inviteUserByEmail` para clientes
 * de entrevista, con toda la metadata correcta para que el trigger DB
 * `register_kwiq_admin` cree el row en `kwiq_interview_users` automáticamente.
 *
 * Se usa desde:
 *  - POST /api/admin/users (modo "client") — invitación stand-alone.
 *  - POST /api/admin/proyectos — invitación encadenada con la creación
 *    del proyecto (Sprint 1B+).
 */
import { supabaseAdmin } from "@/lib/supabase/server";

export interface InviteClientInput {
  email: string;
  displayName?: string | null;
  companyName?: string | null;
  phone?: string | null;
  projectId?: string | null;
  invitedBy: string;
}

export interface InviteClientResult {
  status: "invited" | "already_exists" | "error";
  /** ID del user en auth.users — solo en `invited` o `already_exists`. */
  userId?: string;
  email?: string;
  /** Detalle del error si status === "error". */
  message?: string;
}

/**
 * Manda invitación con magic link a un cliente nuevo. Si el email ya
 * existía en `auth.users` (por ej. invitación previa), Supabase devuelve
 * un error específico que tratamos como `already_exists` — no como falla,
 * porque el invite original sigue siendo válido.
 *
 * Idempotente desde el punto de vista del flow: llamar dos veces con el
 * mismo email produce un solo usuario en DB.
 */
export async function inviteClient(
  input: InviteClientInput,
): Promise<InviteClientResult> {
  const sb = supabaseAdmin();

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3001";
  const redirectTo = `${baseUrl}/interview/accept-invite`;

  const metadata: Record<string, string> = {
    kwiq_role: "client",
    display_name: input.displayName?.trim() || "",
    company_name: input.companyName?.trim() || "",
    phone: input.phone?.trim() || "",
    project_id: input.projectId || "",
    invited_by: input.invitedBy,
  };

  const { data, error } = await sb.auth.admin.inviteUserByEmail(input.email, {
    data: metadata,
    redirectTo,
  });

  if (error) {
    // Supabase devuelve "User already registered" si el email ya existía.
    // No es un error real: el cliente puede usar el invite anterior o
    // pedir un magic link nuevo desde /interview/login.
    const msg = error.message ?? String(error);
    if (
      /already (been )?registered/i.test(msg) ||
      /user already exists/i.test(msg)
    ) {
      return {
        status: "already_exists",
        email: input.email,
        message: "Este email ya estaba invitado. El cliente puede entrar desde /interview/login o pedir un magic link nuevo.",
      };
    }
    return {
      status: "error",
      message: msg,
    };
  }

  return {
    status: "invited",
    userId: data.user?.id,
    email: data.user?.email ?? input.email,
  };
}
