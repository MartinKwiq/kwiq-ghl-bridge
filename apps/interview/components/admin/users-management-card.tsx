"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * /admin/ajustes — gestión de usuarios.
 *
 * Dos secciones:
 *   - "Equipo Kwiq": admins internos (owner/admin/operator). Solo owner edita.
 *   - "Clientes": personas externas que hacen la entrevista. Owner y admin editan.
 *
 * Los datos se sirven desde GET /api/admin/users y las mutaciones van a
 * POST/PATCH/DELETE /api/admin/users[/id]. Las validaciones finas (último
 * owner, dominio @kwiq.io para team, etc.) viven en el backend — acá solo
 * mostramos el error que vuelve.
 */

type Me = { role: "owner" | "admin" | "operator"; userId: string };

type TeamMember = {
  user_id: string;
  email: string;
  role: "owner" | "admin" | "operator";
  display_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
};

type ClientUser = {
  user_id: string;
  email: string;
  display_name: string | null;
  company_name: string | null;
  phone: string | null;
  project_id: string | null;
  invited_at: string;
  first_login_at: string | null;
  last_login_at: string | null;
  interview_completed_at: string | null;
  project: { slug: string; client_name: string } | null;
};

type UsersPayload = {
  me: Me;
  team: TeamMember[];
  clients: ClientUser[];
};

type Tab = "team" | "clients";

export function UsersManagementCard() {
  const [data, setData] = useState<UsersPayload | null>(null);
  const [tab, setTab] = useState<Tab>("team");
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as
        | UsersPayload
        | { error?: string; message?: string; detail?: string };
      if (!res.ok || !("team" in body)) {
        const err = body as {
          error?: string;
          message?: string;
          detail?: string;
        };
        setLoadErr(
          err.message ||
            err.detail ||
            err.error ||
            "No pudimos cargar los usuarios.",
        );
        setData(null);
        return;
      }
      setData(body);
    } catch {
      setLoadErr("Error de red al cargar usuarios.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) {
    return (
      <div className="rounded-xl border border-kwiq-border bg-kwiq-panel/40 p-5 text-sm text-kwiq-muted">
        Cargando usuarios…
      </div>
    );
  }

  if (loadErr || !data) {
    return (
      <div className="rounded-xl border border-kwiq-err/40 bg-kwiq-err/10 p-5 text-sm text-kwiq-err">
        {loadErr ?? "No pudimos cargar los usuarios."}
      </div>
    );
  }

  const { me, team, clients } = data;
  const canEditTeam = me.role === "owner";
  const canEditClients = me.role === "owner" || me.role === "admin";

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-kwiq-border bg-kwiq-panel/40 p-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-kwiq-text">Usuarios</h3>
        <p className="text-xs text-kwiq-muted">
          Equipo interno con roles (owner, admin, operator) y clientes que
          reciben el link de entrevista. Los clientes se loguean en{" "}
          <code className="font-mono text-[11px]">/interview/login</code>,
          no en <code className="font-mono text-[11px]">/admin/login</code>.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-kwiq-border">
        <TabButton active={tab === "team"} onClick={() => setTab("team")}>
          Equipo Kwiq{" "}
          <span className="ml-1 text-kwiq-muted">({team.length})</span>
        </TabButton>
        <TabButton
          active={tab === "clients"}
          onClick={() => setTab("clients")}
        >
          Clientes{" "}
          <span className="ml-1 text-kwiq-muted">({clients.length})</span>
        </TabButton>
      </div>

      {tab === "team" ? (
        <TeamTab
          team={team}
          myUserId={me.userId}
          canEdit={canEditTeam}
          onChange={reload}
        />
      ) : (
        <ClientsTab
          clients={clients}
          canEdit={canEditClients}
          onChange={reload}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative px-3 py-2 text-xs font-medium uppercase tracking-wide transition",
        active
          ? "text-kwiq-text after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-kwiq-accent"
          : "text-kwiq-muted hover:text-kwiq-text",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Team tab
// ---------------------------------------------------------------------------

function TeamTab({
  team,
  myUserId,
  canEdit,
  onChange,
}: {
  team: TeamMember[];
  myUserId: string;
  canEdit: boolean;
  onChange: () => void;
}) {
  const [showInvite, setShowInvite] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {!canEdit && (
        <p className="rounded-md border border-kwiq-border/60 bg-kwiq-bg/40 p-3 text-xs text-kwiq-muted">
          Solo un <strong>owner</strong> puede invitar o modificar usuarios del
          equipo. Si necesitás cambios, pedile a un owner.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-kwiq-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-kwiq-bg/40 text-[11px] uppercase tracking-wide text-kwiq-muted">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Rol</th>
              <th className="px-3 py-2">Último login</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {team.map((m) => (
              <TeamRow
                key={m.user_id}
                member={m}
                isMe={m.user_id === myUserId}
                canEdit={canEdit}
                onChange={onChange}
              />
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <>
          {!showInvite ? (
            <button
              type="button"
              onClick={() => setShowInvite(true)}
              className="self-start rounded-lg bg-kwiq-accent px-4 py-2 text-sm font-medium text-kwiq-bg transition hover:bg-kwiq-accentHover"
            >
              + Invitar a alguien del equipo
            </button>
          ) : (
            <InviteTeamForm
              onCancel={() => setShowInvite(false)}
              onSuccess={() => {
                setShowInvite(false);
                onChange();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function TeamRow({
  member,
  isMe,
  canEdit,
  onChange,
}: {
  member: TeamMember;
  isMe: boolean;
  canEdit: boolean;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState<"role" | "delete" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function changeRole(nextRole: TeamMember["role"]) {
    if (nextRole === member.role) return;
    setBusy("role");
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${member.user_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "team", role: nextRole }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !body.ok) {
        setErr(body.detail || body.error || "No pudimos cambiar el rol.");
        return;
      }
      onChange();
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `¿Eliminar a ${member.email}? Pierde el acceso al instante y no se puede deshacer.`,
      )
    ) {
      return;
    }
    setBusy("delete");
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin/users/${member.user_id}?kind=team`,
        { method: "DELETE" },
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !body.ok) {
        setErr(body.detail || body.error || "No pudimos borrar.");
        return;
      }
      onChange();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <tr className="border-t border-kwiq-border text-kwiq-text">
        <td className="px-3 py-2 font-mono text-[12px]">
          {member.email}
          {isMe && (
            <span className="ml-2 rounded bg-kwiq-accent/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kwiq-accent">
              vos
            </span>
          )}
        </td>
        <td className="px-3 py-2">{member.display_name ?? "—"}</td>
        <td className="px-3 py-2">
          {canEdit && !isMe ? (
            <select
              value={member.role}
              disabled={busy === "role"}
              onChange={(e) =>
                void changeRole(e.target.value as TeamMember["role"])
              }
              className="rounded-md border border-kwiq-border bg-kwiq-bg/60 px-2 py-1 text-xs"
            >
              <option value="owner">owner</option>
              <option value="admin">admin</option>
              <option value="operator">operator</option>
            </select>
          ) : (
            <RoleBadge role={member.role} />
          )}
        </td>
        <td className="px-3 py-2 text-xs text-kwiq-muted">
          {formatDate(member.last_sign_in_at)}
        </td>
        <td className="px-3 py-2 text-right">
          {canEdit && !isMe && (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy === "delete"}
              className="text-xs text-kwiq-err hover:underline disabled:opacity-50"
            >
              {busy === "delete" ? "Borrando…" : "Eliminar"}
            </button>
          )}
        </td>
      </tr>
      {err && (
        <tr className="border-t border-kwiq-border">
          <td
            colSpan={5}
            className="px-3 py-2 text-xs text-kwiq-err bg-kwiq-err/5"
          >
            {err}
          </td>
        </tr>
      )}
    </>
  );
}

function RoleBadge({ role }: { role: TeamMember["role"] }) {
  const styles = {
    owner: "border-kwiq-accent/50 bg-kwiq-accent/10 text-kwiq-accent",
    admin: "border-kwiq-ok/40 bg-kwiq-ok/10 text-kwiq-ok",
    operator: "border-kwiq-border bg-kwiq-bg/60 text-kwiq-muted",
  }[role];
  return (
    <span
      className={cn(
        "inline-block rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        styles,
      )}
    >
      {role}
    </span>
  );
}

function InviteTeamForm({
  onCancel,
  onSuccess,
}: {
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"admin" | "operator">("admin");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "team",
          email: email.trim(),
          role,
          displayName: displayName.trim() || undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !body.ok) {
        setErr(body.detail || body.error || "No pudimos invitar.");
        return;
      }
      onSuccess();
    } catch {
      setErr("Error de red.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-lg border border-kwiq-border bg-kwiq-bg/30 p-4"
    >
      <p className="text-xs text-kwiq-muted">
        Se le va a mandar un magic link por email para que defina su contraseña.
        Solo emails <code className="font-mono">@kwiq.io</code>.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="persona@kwiq.io"
          className="rounded-md border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 text-sm outline-none focus:border-kwiq-accent"
        />
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Nombre (opcional)"
          className="rounded-md border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 text-sm outline-none focus:border-kwiq-accent"
        />
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-kwiq-muted">Rol:</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "admin" | "operator")}
          className="rounded-md border border-kwiq-border bg-kwiq-bg/60 px-2 py-1 text-sm"
        >
          <option value="admin">admin — crea proyectos y edita todo menos secretos</option>
          <option value="operator">operator — solo lectura</option>
        </select>
      </div>
      {err && (
        <div className="rounded-md border border-kwiq-err/40 bg-kwiq-err/10 p-2 text-xs text-kwiq-err">
          {err}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading || !email}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition",
            loading || !email
              ? "bg-kwiq-border text-kwiq-muted"
              : "bg-kwiq-accent text-kwiq-bg hover:bg-kwiq-accentHover",
          )}
        >
          {loading ? "Enviando…" : "Enviar invitación"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-kwiq-border px-4 py-2 text-sm text-kwiq-muted hover:text-kwiq-text"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Clients tab
// ---------------------------------------------------------------------------

function ClientsTab({
  clients,
  canEdit,
  onChange,
}: {
  clients: ClientUser[];
  canEdit: boolean;
  onChange: () => void;
}) {
  const [showInvite, setShowInvite] = useState(false);
  const sorted = useMemo(() => clients, [clients]);

  return (
    <div className="flex flex-col gap-3">
      {!canEdit && (
        <p className="rounded-md border border-kwiq-border/60 bg-kwiq-bg/40 p-3 text-xs text-kwiq-muted">
          Solo roles owner y admin pueden crear o modificar clientes.
        </p>
      )}

      {sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-kwiq-border/60 bg-kwiq-bg/20 p-4 text-sm text-kwiq-muted">
          Todavía no invitaste clientes. Cuando generes un link de entrevista
          para alguien, aparece acá con su estado de onboarding.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-kwiq-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-kwiq-bg/40 text-[11px] uppercase tracking-wide text-kwiq-muted">
              <tr>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Empresa</th>
                <th className="px-3 py-2">Proyecto</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <ClientRow
                  key={c.user_id}
                  client={c}
                  canEdit={canEdit}
                  onChange={onChange}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <>
          {!showInvite ? (
            <button
              type="button"
              onClick={() => setShowInvite(true)}
              className="self-start rounded-lg bg-kwiq-accent px-4 py-2 text-sm font-medium text-kwiq-bg transition hover:bg-kwiq-accentHover"
            >
              + Invitar a un cliente
            </button>
          ) : (
            <InviteClientForm
              onCancel={() => setShowInvite(false)}
              onSuccess={() => {
                setShowInvite(false);
                onChange();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function ClientRow({
  client,
  canEdit,
  onChange,
}: {
  client: ClientUser;
  canEdit: boolean;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const status = deriveClientStatus(client);

  async function remove() {
    if (
      !window.confirm(
        `¿Eliminar a ${client.email}? Pierde el acceso a su entrevista.`,
      )
    )
      return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin/users/${client.user_id}?kind=client`,
        { method: "DELETE" },
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !body.ok) {
        setErr(body.detail || body.error || "No pudimos borrar.");
        return;
      }
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <tr className="border-t border-kwiq-border text-kwiq-text">
        <td className="px-3 py-2 font-mono text-[12px]">{client.email}</td>
        <td className="px-3 py-2">{client.display_name ?? "—"}</td>
        <td className="px-3 py-2">{client.company_name ?? "—"}</td>
        <td className="px-3 py-2 text-xs">
          {client.project ? (
            <span className="inline-block rounded border border-kwiq-border bg-kwiq-bg/40 px-2 py-0.5 font-mono">
              {client.project.slug}
            </span>
          ) : (
            <span className="text-kwiq-muted">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-xs">
          <ClientStatusBadge status={status} />
        </td>
        <td className="px-3 py-2 text-right">
          {canEdit && (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="text-xs text-kwiq-err hover:underline disabled:opacity-50"
            >
              {busy ? "Borrando…" : "Eliminar"}
            </button>
          )}
        </td>
      </tr>
      {err && (
        <tr className="border-t border-kwiq-border">
          <td
            colSpan={6}
            className="px-3 py-2 text-xs text-kwiq-err bg-kwiq-err/5"
          >
            {err}
          </td>
        </tr>
      )}
    </>
  );
}

function deriveClientStatus(c: ClientUser):
  | "invited"
  | "logged_in"
  | "completed" {
  if (c.interview_completed_at) return "completed";
  if (c.first_login_at) return "logged_in";
  return "invited";
}

function ClientStatusBadge({
  status,
}: {
  status: "invited" | "logged_in" | "completed";
}) {
  const map = {
    invited: {
      label: "Invitado",
      cls: "border-kwiq-border bg-kwiq-bg/60 text-kwiq-muted",
    },
    logged_in: {
      label: "En progreso",
      cls: "border-kwiq-warn/40 bg-kwiq-warn/10 text-kwiq-warn",
    },
    completed: {
      label: "Completó",
      cls: "border-kwiq-ok/40 bg-kwiq-ok/10 text-kwiq-ok",
    },
  }[status];
  return (
    <span
      className={cn(
        "inline-block rounded-md border px-2 py-0.5 text-[11px] font-medium",
        map.cls,
      )}
    >
      {map.label}
    </span>
  );
}

function InviteClientForm({
  onCancel,
  onSuccess,
}: {
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<
    { id: string; slug: string; client_name: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Cargamos proyectos disponibles para el selector.
    void fetch("/api/admin/proyectos", { cache: "no-store" })
      .then((r) => r.json().catch(() => ({})))
      .then((body) => {
        if (Array.isArray(body?.projects)) setProjects(body.projects);
      })
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "client",
          email: email.trim(),
          displayName: displayName.trim() || undefined,
          companyName: companyName.trim() || undefined,
          phone: phone.trim() || undefined,
          projectId: projectId || undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !body.ok) {
        setErr(body.detail || body.error || "No pudimos invitar.");
        return;
      }
      onSuccess();
    } catch {
      setErr("Error de red.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-lg border border-kwiq-border bg-kwiq-bg/30 p-4"
    >
      <p className="text-xs text-kwiq-muted">
        Le mandamos un email al cliente con un magic link para que fije
        contraseña, y después entra en{" "}
        <code className="font-mono">/interview/login</code>. Podés dejarlo sin
        proyecto asociado y vincularlo después.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="cliente@empresa.com"
          className="rounded-md border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 text-sm outline-none focus:border-kwiq-accent"
        />
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Nombre (opcional)"
          className="rounded-md border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 text-sm outline-none focus:border-kwiq-accent"
        />
        <input
          type="text"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Empresa (opcional)"
          className="rounded-md border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 text-sm outline-none focus:border-kwiq-accent"
        />
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Teléfono (opcional)"
          className="rounded-md border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 text-sm outline-none focus:border-kwiq-accent"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-kwiq-muted">Proyecto Kwiq asociado (opcional)</label>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded-md border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 text-sm outline-none focus:border-kwiq-accent"
        >
          <option value="">— Sin proyecto —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.client_name} ({p.slug})
            </option>
          ))}
        </select>
      </div>
      {err && (
        <div className="rounded-md border border-kwiq-err/40 bg-kwiq-err/10 p-2 text-xs text-kwiq-err">
          {err}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading || !email}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition",
            loading || !email
              ? "bg-kwiq-border text-kwiq-muted"
              : "bg-kwiq-accent text-kwiq-bg hover:bg-kwiq-accentHover",
          )}
        >
          {loading ? "Enviando…" : "Enviar invitación"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-kwiq-border px-4 py-2 text-sm text-kwiq-muted hover:text-kwiq-text"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// utils
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return "nunca";
  try {
    return new Date(iso).toLocaleDateString("es-AR", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}
