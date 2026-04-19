import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Dashboard /admin
 *
 * Vista general: cuántos proyectos hay, cuántas entrevistas activas,
 * entradas rápidas a "crear proyecto".
 */
export default async function AdminDashboardPage() {
  const sb = supabaseAdmin();

  const [{ count: projectCount }, { count: sessionCount }, { data: recent }] =
    await Promise.all([
      sb
        .from("kwiq_projects")
        .select("*", { count: "exact", head: true }),
      sb
        .from("interview_sessions")
        .select("*", { count: "exact", head: true })
        .in("status", ["in_progress", "draft"]),
      sb
        .from("kwiq_projects")
        .select("id, slug, client_name, status, updated_at")
        .order("updated_at", { ascending: false })
        .limit(8),
    ]);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="text-xs uppercase tracking-[0.18em] text-kwiq-muted">
          Panel admin
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold uppercase tracking-wide">
          Dashboard
        </h1>
        <p className="mt-2 text-sm text-kwiq-muted">
          Resumen rápido de los clientes onboardeados y las entrevistas en
          curso.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Proyectos totales" value={projectCount ?? 0} />
        <KpiCard
          label="Entrevistas activas"
          value={sessionCount ?? 0}
          hint="drafts + en curso"
        />
        <Link
          href="/admin/proyectos/nuevo"
          className="flex flex-col items-start justify-between rounded-2xl border border-kwiq-accent/30 bg-kwiq-accent/10 p-4 transition hover:border-kwiq-accent"
        >
          <span className="text-xs uppercase tracking-[0.18em] text-kwiq-accent">
            Acción rápida
          </span>
          <span className="mt-2 font-display text-xl font-semibold uppercase tracking-wide text-kwiq-text">
            Crear proyecto
          </span>
          <span className="mt-2 text-xs text-kwiq-muted">
            Cargá las credenciales del cliente y generá el link de entrevista.
          </span>
        </Link>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold uppercase tracking-wide">
            Últimos proyectos
          </h2>
          <Link
            href="/admin/proyectos"
            className="text-xs text-kwiq-muted hover:text-kwiq-text"
          >
            Ver todos →
          </Link>
        </div>

        {!recent || recent.length === 0 ? (
          <p className="rounded-xl border border-kwiq-border bg-kwiq-panel/40 p-6 text-sm text-kwiq-muted">
            Todavía no hay proyectos. Empezá con{" "}
            <Link
              href="/admin/proyectos/nuevo"
              className="text-kwiq-accent hover:underline"
            >
              crear uno nuevo
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-kwiq-border rounded-xl border border-kwiq-border bg-kwiq-panel/40">
            {recent.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <Link
                    href={`/admin/proyectos/${p.slug}`}
                    className="font-medium text-kwiq-text hover:text-kwiq-accent"
                  >
                    {p.client_name}
                  </Link>
                  <div className="text-xs text-kwiq-muted">
                    <code className="font-mono">{p.slug}</code> ·{" "}
                    {new Date(p.updated_at as string).toLocaleString("es-AR")}
                  </div>
                </div>
                <StatusBadge status={p.status as string} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-kwiq-border bg-kwiq-panel/40 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-kwiq-muted">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-semibold tracking-wide text-kwiq-text">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-kwiq-muted">{hint}</p>}
    </div>
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
