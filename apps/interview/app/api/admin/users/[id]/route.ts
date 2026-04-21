import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/users/[id]
 *
 * Modifica un usuario existente. Body discriminado por `kind`:
 *
 *   { kind: "team", role: "owner" | "admin" | "operator" }
 *     → cambia rol en kwiq_admins.  Solo owner. No se puede degradar al
 *       último owner (siempre tiene que quedar al menos uno).
 *
 *   { kind: "client", displayName?, companyName?, phone?, projectId? }
 *     → edita metadata del cliente. Owner y admin.
 */
const TeamPatch = z.object({
  kind: z.literal("team"),
  role: z.enum(["owner", "admin", "operator"]),
});

const ClientPatch = z.object({
  kind: z.literal("client"),
  displayName: z.string().trim().max(120).nullish(),
  companyName: z.string().trim().max(200).nullish(),
  phone: z.string().trim().max(40).nullish(),
  projectId: z.string().uuid().nullish(),
});

const PatchBody = z.discriminatedUnion("kind", [TeamPatch, ClientPatch]);

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await req.json());
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

  const sb = supabaseAdmin();

  if (body.kind === "team") {
    // Nunca dejar al sistema sin owners.
    if (body.role !== "owner") {
      const { data: owners } = await sb
        .from("kwiq_admins")
        .select("user_id")
        .eq("role", "owner");
      const ownerIds = new Set((owners ?? []).map((o) => o.user_id));
      if (ownerIds.has(id) && ownerIds.size <= 1) {
        return NextResponse.json(
          {
            error: "last_owner",
            detail:
              "No podés degradar al último owner. Promoví a otra persona primero.",
          },
          { status: 400 },
        );
      }
    }

    const { error } = await sb
      .from("kwiq_admins")
      .update({ role: body.role })
      .eq("user_id", id);

    if (error) {
      return NextResponse.json(
        { error: "update_failed", detail: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  // Cliente.
  const patch: Record<string, string | null> = {};
  if (body.displayName !== undefined)
    patch.display_name = body.displayName || null;
  if (body.companyName !== undefined)
    patch.company_name = body.companyName || null;
  if (body.phone !== undefined) patch.phone = body.phone || null;
  if (body.projectId !== undefined)
    patch.project_id = body.projectId || null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const { error } = await sb
    .from("kwiq_interview_users")
    .update(patch)
    .eq("user_id", id);

  if (error) {
    return NextResponse.json(
      { error: "update_failed", detail: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/admin/users/[id]?kind=team|client
 *
 * Borra la fila en kwiq_admins o kwiq_interview_users, y también borra la
 * entrada en auth.users para que el email pueda reutilizarse.
 *
 * Autorización:
 *  - team:   solo owner. No se permite auto-borrado.
 *  - client: owner y admin.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  if (kind !== "team" && kind !== "client") {
    return NextResponse.json(
      { error: "invalid_kind", detail: "kind debe ser 'team' o 'client'." },
      { status: 400 },
    );
  }

  const allowed =
    kind === "team" ? (["owner"] as const) : (["owner", "admin"] as const);
  const me = await requireAdminRole([...allowed]);
  if (!me.ok) {
    return NextResponse.json(
      { error: me.error, message: me.message },
      { status: me.status },
    );
  }

  if (kind === "team" && id === me.userId) {
    return NextResponse.json(
      {
        error: "cannot_self_delete",
        detail: "No podés borrarte a vos mismo. Pedile a otro owner que lo haga.",
      },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();

  // Si es team y es el último owner, bloqueamos.
  if (kind === "team") {
    const { data: row } = await sb
      .from("kwiq_admins")
      .select("role")
      .eq("user_id", id)
      .maybeSingle();
    if (row?.role === "owner") {
      const { count } = await sb
        .from("kwiq_admins")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "owner");
      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          {
            error: "last_owner",
            detail:
              "Es el último owner del sistema. Promoví a otra persona a owner antes de borrarlo.",
          },
          { status: 400 },
        );
      }
    }
  }

  // auth.admin.deleteUser cascadea a kwiq_admins/kwiq_interview_users por
  // la FK `on delete cascade`.
  const { error } = await sb.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json(
      { error: "delete_failed", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
