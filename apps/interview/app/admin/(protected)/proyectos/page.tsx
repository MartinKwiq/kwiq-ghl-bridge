import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Listado /admin/proyectos — todos los clientes Kwiq con su estado de
 * onboarding. Desde acá se arranca una entrevista, se copia el link o se
 * archiva un proyecto.
 */
export default async function ProyectosPage() {
  const sb = supabaseAdmin();

  const { data: projects } = await sb
    .from("kwiq_projects")
    .select(
      "id, slug, client_name, contact_email, status, auth_mode, ghl_location_id, updated_at, created_at",
    )
    .order("updated_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-kwiq-muted">
            Admin · proyectos
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold uppercase tracking-wide">
            Proyectos Kwiq
          </h1>
          <p className="mt-2 text-sm text-kwiq-muted">
            Cada proyecto = 1 cliente con sus credenciales GHL y su entrevista.
          </p>
        </div>
        <Link
          href="/admin/proyectos/nuevo"
          className="rounded-lg bg-kwiq-accent px-4 py-2 text-sm font-medium text-kwiq-bg transition hover:bg-kwiq-accentHover"
        >
          + Nuevo proyecto
        </Link>
      </div>

      {!projects || projects.length === 0 ? (
        <p className="rounded-xl border border-kwiq-border bg-kwiq-panel/40 p-6 text-sm text-kwiq-muted">
          Todavía no hay proyectos. Cargá el primero con el botón de arriba.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-kwiq-border bg-kwiq-panel/40">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-kwiq-border text-xs uppercase tracking-widest text-kwiq-muted">
              <tr>
                <th className="px-4 py-3 font-normal">Cliente</th>
                <th className="px-4 py-3 font-normal">Auth</th>
                <th className="px-4 py-3 font-normal">Location ID</th>
                <th className="px-4 py-3 font-normal">Estado</th>
                <th className="px-4 py-3 font-normal">Última act.</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-kwiq-border">
              {projects.map((p) => (
                <tr key={p.id} className="hover:bg-kwiq-bg/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/proyectos/${p.slug}`}
                      className="font-medium text-kwiq-text hover:text-kwiq-accent"
                    >
                      {p.client_name}
                    </Link>
                    <div className="text-xs text-kwiq-muted">
                      <code className="font-mono">{p.slug}</code>
                      {p.contact_email && <> · {p.contact_email}</>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-kwiq-muted">
                    <AuthBadge mode={p.auth_mode as string} />
                  </td>
                  <td className="px-4 py-3 text-kwiq-muted">
                    <code className="font-mono text-xs">
                      {p.ghl_location_id ?? "—"}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status as string} />
                  </td>
                  <td className="px-4 py-3 text-xs text-kwiq-muted">
                    {new Date(p.updated_at as string).toLocaleString("es-AR")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/proyectos/${p.slug}`}
                      className="text-xs text-kwiq-muted hover:text-kwiq-accent"
                    >
                      Abrir →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AuthBadge({ mode }: { mode: string }) {
  const label =
    mode === "pit_agency"
      ? "PIT agencia"
      : mode === "pit_location"
        ? "PIT sub-account"
        : "OAuth";
  return (
    <span className="rounded-full border border-kwiq-border bg-kwiq-bg/40 px-2 py-0.5 text-[10px] uppercase tracking-widest">
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { label, cls } = statusStyle(status);
  return (
    <span
      className={
        "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest " +
        cls
      }
    >
      {label}
    </span>
  );
}

function statusStyle(status: string): { label: string; cls: string } {
  switch (status) {
    case "draft":
      return {
        label: "Borrador",
        cls: "border-kwiq-border bg-kwiq-bg/40 text-kwiq-muted",
      };
    case "ready_for_interview":
      return {
        label: "Listo p/ entrevista",
        cls: "border-kwiq-accent/40 bg-kwiq-accent/10 text-kwiq-accent",
      };
    case "interview_in_progress":
      return {
        label: "Entrevista en curso",
        cls: "border-kwiq-warn/40 bg-kwiq-warn/10 text-kwiq-warn",
      };
    case "ready_to_provision":
      return {
        label: "Listo p/ provision",
        cls: "border-kwiq-accent2/40 bg-kwiq-accent2/10 text-kwiq-accent2",
      };
    case "provisioned":
      return {
        label: "Provisionado",
        cls: "border-kwiq-ok/40 bg-kwiq-ok/10 text-kwiq-ok",
      };
    case "archived":
      return {
        label: "Archivado",
        cls: "border-kwiq-border bg-kwiq-bg/40 text-kwiq-muted",
      };
    default:
      return { label: status, cls: "border-kwiq-border text-kwiq-muted" };
  }
}
