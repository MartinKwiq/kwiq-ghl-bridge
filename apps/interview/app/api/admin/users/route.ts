import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users
 *
 * Lista:
 *  - equipo interno de Kwiq (kwiq_admins + auth.users)
 *  - clientes de entrevista (kwiq_interview_users + auth.users)
 *
 * Autorización:
 *  - equipo: owner y admin ven la lista (solo owner puede modificar).
 *  - clientes: owner y admin ven la lista y pueden modificar.
 *  - operator: 403 (por ahora no tiene visibilidad de usuarios).
 */
export async function GET() {
  const me = await requireAdminRole(["owner", "admin"]);
  if (!me.ok) {
    return NextResponse.json(
      { error: me.error, message: me.message },
      { status: me.status },
    );
  }

  const sb = supabaseAdmin();

  // Equipo interno.
  const { data: admins, error: adminsErr } = await sb
    .from("kwiq_admins")
    .select("user_id, role, display_name, created_at")
    .order("created_at", { ascending: true });

  if (adminsErr) {
    return NextResponse.json(
      { error: "db_error", detail: adminsErr.message },
      { status: 500 },
    );
  }

  // Fetch emails desde auth.users (admin.listUsers pagina, pedimos un batch grande).
  const { data: authUsers, error: listErr } = await sb.auth.admin.listUsers({
    page: 1,
    perPage: 500,
  });
  if (listErr) {
    return NextResponse.json(
      { error: "auth_list_failed", detail: listErr.message },
      { status: 500 },
    );
  }
  const emailById = new Map(
    authUsers.users.map((u) => [u.id, u.email ?? ""]),
  );
  const lastSignInById = new Map(
    authUsers.users.map((u) => [u.id, u.last_sign_in_at ?? null]),
  );

  const team = (admins ?? []).map((a) => ({
    user_id: a.user_id,
    email: emailById.get(a.user_id) || "",
    role: a.role,
    display_name: a.display_name,
    created_at: a.created_at,
    last_sign_in_at: lastSignInById.get(a.user_id) || null,
  }));

  // Clientes.
  const { data: clients, error: clientsErr } = await sb
    .from("kwiq_interview_users")
    .select(
      "user_id, email, display_name, company_name, phone, project_id, invited_at, first_login_at, last_login_at, interview_completed_at",
    )
    .order("invited_at", { ascending: false });

  if (clientsErr) {
    return NextResponse.json(
      { error: "db_error", detail: clientsErr.message },
      { status: 500 },
    );
  }

  // Join liviano con proyectos para mostrar el nombre.
  const projectIds = [
    ...new Set(
      (clients ?? []).map((c) => c.project_id).filter(Boolean) as string[],
    ),
  ];
  let projectsById: Record<string, { slug: string; client_name: string }> = {};
  if (projectIds.length > 0) {
    const { data: projects } = await sb
      .from("kwiq_projects")
      .select("id, slug, client_name")
      .in("id", projectIds);
    projectsById = Object.fromEntries(
      (projects ?? []).map((p) => [
        p.id,
        { slug: p.slug, client_name: p.client_name },
      ]),
    );
  }

  const clientList = (clients ?? []).map((c) => ({
    ...c,
    project: c.project_id ? (projectsById[c.project_id] ?? null) : null,
  }));

  return NextResponse.json({
    me: { role: me.role, userId: me.userId },
    team,
    clients: clientList,
  });
}

/**
 * POST /api/admin/users
 *
 * Invita un usuario nuevo — equipo o cliente, según body.
 *
 * Body:
 *   { kind: "team", email, role: "admin" | "operator", displayName? }
 *   { kind: "client", email, displayName?, companyName?, phone?, projectId? }
 *
 * Autorización:
 *   - team:   solo owner.
 *   - client: owner y admin.
 *
 * Implementación:
 *   - Llama `auth.admin.inviteUserByEmail(email, { data: { kwiq_role, ... } })`.
 *   - El trigger `register_kwiq_admin` en la DB enruta al usuario recién
 *     creado a `kwiq_admins` o `kwiq_interview_users` según `kwiq_role`.
 *   - Vercel/Supabase le manda un email con el magic link para setear password.
 */
const TeamInvite = z.object({
  kind: z.literal("team"),
  email: z.string().email(),
  role: z.enum(["admin", "operator"]),
  displayName: z.string().trim().max(120).optional(),
});

const ClientInvite = z.object({
  kind: z.literal("client"),
  email: z.string().email(),
  displayName: z.string().trim().max(120).optional(),
  companyName: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  projectId: z.string().uuid().optional(),
});

const InviteBody = z.discriminatedUnion("kind", [TeamInvite, ClientInvite]);

export async function POST(req: Request) {
  let body: z.infer<typeof InviteBody>;
  try {
    body = InviteBody.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_body",
        detail:
          err instanceof z.ZodError
            ? err.issues[0]?.message
            : "Body inválido.",
      },
      { status: 400 },
    );
  }

  // Autorización según tipo.
  const allowed =
    body.kind === "team"
      ? (["owner"] as const)
      : (["owner", "admin"] as const);
  const me = await requireAdminRole([...allowed]);
  if (!me.ok) {
    return NextResponse.json(
      { error: me.error, message: me.message },
      { status: me.status },
    );
  }

  // Validación específica team.
  if (body.kind === "team") {
    if (!body.email.toLowerCase().endsWith("@kwiq.io")) {
      return NextResponse.json(
        {
          error: "invalid_email_domain",
          detail: "El equipo interno solo acepta emails @kwiq.io.",
        },
        { status: 400 },
      );
    }
  }

  const sb = supabaseAdmin();

  // Armamos el metadata para que el trigger sepa qué tipo crear.
  const metadata: Record<string, string> =
    body.kind === "team"
      ? {
          kwiq_role: "admin",
          kwiq_admin_role: body.role,
          display_name: body.displayName || "",
        }
      : {
          kwiq_role: "client",
          display_name: body.displayName || "",
          company_name: body.companyName || "",
          phone: body.phone || "",
          project_id: body.projectId || "",
          invited_by: me.userId,
        };

  // URL de redirect post-magic-link.
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3001";
  const redirectTo =
    body.kind === "team"
      ? `${baseUrl}/admin/accept-invite`
      : `${baseUrl}/interview/accept-invite`;

  const { data, error: inviteErr } = await sb.auth.admin.inviteUserByEmail(
    body.email,
    {
      data: metadata,
      redirectTo,
    },
  );

  if (inviteErr) {
    // eslint-disable-next-line no-console
    console.error("[admin/users] invite error", inviteErr);
    return NextResponse.json(
      { error: "invite_failed", detail: inviteErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: data.user?.id,
      email: data.user?.email,
      kind: body.kind,
    },
  });
}
