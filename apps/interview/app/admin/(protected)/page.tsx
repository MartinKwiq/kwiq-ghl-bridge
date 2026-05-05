import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sectionOrder, getSectionById } from "@/lib/interview-schema";

export const dynamic = "force-dynamic";

interface ProjectRow {
  id: string;
  slug: string;
  client_name: string;
  contact_email: string | null;
  status: string;
  ghl_location_id: string | null;
  updated_at: string;
  created_at: string;
}

interface SessionRow {
  id: string;
  project_id: string;
  status: string;
  current_section_id: string | null;
  completed_section_ids: string[] | null;
  created_at: string;
  updated_at: string;
  paused_at: string | null;
  completed_at: string | null;
}

/**
 * Dashboard /admin
 *
 * Vista general accionable: KPIs globales + cards por proyecto reciente con
 * estado de la entrevista + estado de la sub-cuenta GHL + accesos rápidos.
 *
 * El objetivo es que el admin pueda responder de un vistazo:
 *   - ¿Qué clientes tengo activos?
 *   - ¿Cuáles están haciendo la entrevista AHORA?
 *   - ¿Cuáles ya terminaron y faltan provisionar?
 *   - ¿Hay alguno trabado (sub-cuenta no creada, cliente no activó, etc.)?
 */
export default async function AdminDashboardPage() {
  const sb = supabaseAdmin();
  const totalSections = sectionOrder().length;

  // 1. Proyectos recientes.
  const { data: recentProjects } = await sb
    .from("kwiq_projects")
    .select(
      "id, slug, client_name, contact_email, status, ghl_location_id, updated_at, created_at",
    )
    .order("updated_at", { ascending: false })
    .limit(10);

  const projects = (recentProjects ?? []) as ProjectRow[];
  const projectIds = projects.map((p) => p.id);

  // 2. Sesiones de esos proyectos (la más reciente por proyecto).
  const sessionsByProject = new Map<string, SessionRow>();
  if (projectIds.length > 0) {
    const { data: sessions } = await sb
      .from("interview_sessions")
      .select(
        "id, project_id, status, current_section_id, completed_section_ids, created_at, updated_at, paused_at, completed_at",
      )
      .in("project_id", projectIds)
      .order("updated_at", { ascending: false });

    for (const s of (sessions ?? []) as SessionRow[]) {
      // Nos quedamos con la más reciente por project_id (la primera que vemos
      // gracias al ORDER BY DESC).
      if (!sessionsByProject.has(s.project_id)) {
        sessionsByProject.set(s.project_id, s);
      }
    }
  }

  // 3. KPIs globales.
  const [
    { count: projectCount },
    { count: inProgressCount },
    { count: pausedCount },
    { count: completedCount },
    { count: provisionedCount },
  ] = await Promise.all([
    sb.from("kwiq_projects").select("*", { count: "exact", head: true }),
    sb
      .from("interview_sessions")
      .select("*", { count: "exact", head: true })
      .eq("status", "in_progress"),
    sb
      .from("interview_sessions")
      .select("*", { count: "exact", head: true })
      .eq("status", "paused"),
    sb
      .from("interview_sessions")
      .select("*", { count: "exact", head: true })
      .eq("status", "completed"),
    sb
      .from("kwiq_projects")
      .select("*", { count: "exact", head: true })
      .not("ghl_location_id", "is", null),
  ]);

  // 4. Detectar alertas accionables.
  const alerts: Array<{ slug: string; client: string; issue: string }> = [];
  for (const p of projects) {
    if (!p.ghl_location_id) {
      alerts.push({
        slug: p.slug,
        client: p.client_name,
        issue: "Sub-cuenta GHL todavía no creada",
      });
    }
  }

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
          Resumen accionable: estado de cada cliente y sus entrevistas.
        </p>
      </section>

      {/* ─── KPIs globales ─────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Proyectos" value={projectCount ?? 0} tone="neutral" />
        <KpiCard
          label="Sub-cuentas creadas"
          value={provisionedCount ?? 0}
          hint={`de ${projectCount ?? 0}`}
          tone="ok"
        />
        <KpiCard
          label="En curso"
          value={inProgressCount ?? 0}
          hint="entrevistas activas"
          tone="warn"
        />
        <KpiCard
          label="Pausadas"
          value={pausedCount ?? 0}
          hint="esperando que el cliente vuelva"
          tone="paused"
        />
        <KpiCard
          label="Completas"
          value={completedCount ?? 0}
          hint="listas para provisionar"
          tone="ok"
        />
      </section>

      {/* ─── Acción rápida ─────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/admin/proyectos/nuevo"
          className="flex flex-col items-start justify-between rounded-2xl border border-kwiq-accent/30 bg-kwiq-accent/10 p-4 transition hover:border-kwiq-accent"
        >
          <span className="text-xs uppercase tracking-[0.18em] text-kwiq-accent">
            + Crear proyecto nuevo
          </span>
          <span className="mt-2 text-xs text-kwiq-muted">
            Crea el proyecto, la sub-cuenta GHL y manda invitación al cliente
            en un solo click.
          </span>
        </Link>
        <Link
          href="/admin/proyectos"
          className="flex flex-col items-start justify-between rounded-2xl border border-kwiq-border bg-kwiq-panel/40 p-4 transition hover:border-kwiq-text/40"
        >
          <span className="text-xs uppercase tracking-[0.18em] text-kwiq-muted">
            Ver todos los proyectos
          </span>
          <span className="mt-2 text-xs text-kwiq-muted">
            Lista completa con búsqueda y filtros por estado.
          </span>
        </Link>
      </section>

      {/* ─── Alertas (si hay) ──────────────────────────────────── */}
      {alerts.length > 0 && (
        <section className="rounded-2xl border border-kwiq-warn/40 bg-kwiq-warn/5 p-4">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-kwiq-warn">
            ⚠ Pendientes de atención ({alerts.length})
          </h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {alerts.slice(0, 5).map((a) => (
              <li key={a.slug} className="text-kwiq-muted">
                <Link
                  href={`/admin/proyectos/${a.slug}`}
                  className="text-kwiq-text hover:text-kwiq-accent"
                >
                  {a.client}
                </Link>
                : {a.issue}
              </li>
            ))}
            {alerts.length > 5 && (
              <li className="text-xs text-kwiq-muted/80">
                … y {alerts.length - 5} más
              </li>
            )}
          </ul>
        </section>
      )}

      {/* ─── Últimos proyectos con detalle ─────────────────────── */}
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

        {projects.length === 0 ? (
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
          <ul className="grid gap-3 md:grid-cols-2">
            {projects.map((p) => {
              const session = sessionsByProject.get(p.id);
              return (
                <ProjectCard
                  key={p.id}
                  project={p}
                  session={session}
                  totalSections={totalSections}
                />
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function ProjectCard({
  project,
  session,
  totalSections,
}: {
  project: ProjectRow;
  session: SessionRow | undefined;
  totalSections: number;
}) {
  const interviewState = describeInterviewState(session, totalSections);
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-kwiq-border bg-kwiq-panel/40 p-4 transition hover:border-kwiq-text/40">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/admin/proyectos/${project.slug}`}
          className="min-w-0 flex-1"
        >
          <p className="truncate font-medium text-kwiq-text hover:text-kwiq-accent">
            {project.client_name}
          </p>
          {project.contact_email && (
            <p className="truncate text-xs text-kwiq-muted">
              {project.contact_email}
            </p>
          )}
        </Link>
        <ProjectStatusBadge
          status={project.status}
          hasGhlLocation={Boolean(project.ghl_location_id)}
        />
      </div>

      {/* Estado de la entrevista — la info más útil del card */}
      <div className="rounded-lg border border-kwiq-border bg-kwiq-bg/40 px-3 py-2">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className={`font-medium ${interviewState.toneClass}`}>
            {interviewState.label}
          </span>
          {interviewState.subtitle && (
            <span className="text-kwiq-muted">{interviewState.subtitle}</span>
          )}
        </div>
        {interviewState.progressPct !== undefined && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-kwiq-border/40">
            <div
              className={`h-full transition-all ${interviewState.barClass}`}
              style={{ width: `${interviewState.progressPct}%` }}
            />
          </div>
        )}
        {interviewState.detail && (
          <p className="mt-2 text-xs text-kwiq-muted">{interviewState.detail}</p>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-kwiq-muted">
        <span>
          Última act.{" "}
          {new Date(project.updated_at).toLocaleString("es-AR", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </span>
        <Link
          href={`/admin/proyectos/${project.slug}`}
          className="text-kwiq-accent hover:underline"
        >
          Ver detalle →
        </Link>
      </div>
    </li>
  );
}

interface InterviewStateView {
  label: string;
  subtitle?: string;
  detail?: string;
  toneClass: string;
  barClass: string;
  progressPct?: number;
}

/**
 * Describe el estado de la entrevista de un proyecto en términos humanos.
 * Combina la sesión más reciente con el conteo de secciones para devolver
 * un objeto que la card sabe renderizar.
 */
function describeInterviewState(
  session: SessionRow | undefined,
  totalSections: number,
): InterviewStateView {
  if (!session) {
    return {
      label: "Entrevista no iniciada",
      subtitle: "esperando al cliente",
      detail: "El cliente todavía no entró al link del email de invitación.",
      toneClass: "text-kwiq-muted",
      barClass: "bg-kwiq-border",
      progressPct: 0,
    };
  }

  const completed = (session.completed_section_ids ?? []).length;
  const pct = Math.round((completed / totalSections) * 100);
  const currentTitle = session.current_section_id
    ? (getSectionById(session.current_section_id)?.title ??
        session.current_section_id)
    : null;

  if (session.status === "completed") {
    return {
      label: "✓ Entrevista completada",
      subtitle: "lista para provisionar",
      detail: session.completed_at
        ? `Completada ${new Date(session.completed_at).toLocaleString("es-AR")}`
        : undefined,
      toneClass: "text-kwiq-ok",
      barClass: "bg-kwiq-ok",
      progressPct: 100,
    };
  }

  if (session.status === "paused") {
    return {
      label: "⏸ Pausada",
      subtitle: `${completed}/${totalSections} (${pct}%)`,
      detail: session.paused_at
        ? `Pausada ${relativeTimeFromNow(new Date(session.paused_at))} · próxima sección: ${currentTitle ?? "—"}`
        : `Próxima sección: ${currentTitle ?? "—"}`,
      toneClass: "text-kwiq-accent",
      barClass: "bg-kwiq-accent",
      progressPct: pct,
    };
  }

  // in_progress / draft
  const updated = new Date(session.updated_at);
  return {
    label: "● En progreso",
    subtitle: `${completed}/${totalSections} (${pct}%)`,
    detail: `Última actividad ${relativeTimeFromNow(updated)} · próxima sección: ${currentTitle ?? "—"}`,
    toneClass: "text-kwiq-warn",
    barClass: "bg-kwiq-warn",
    progressPct: pct,
  };
}

function relativeTimeFromNow(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "hace segundos";
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `hace ${days} día${days > 1 ? "s" : ""}`;
  const months = Math.floor(days / 30);
  return `hace ${months} mes${months > 1 ? "es" : ""}`;
}

type KpiTone = "neutral" | "ok" | "warn" | "paused";

function KpiCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: KpiTone;
}) {
  const valueClass =
    tone === "ok"
      ? "text-kwiq-ok"
      : tone === "warn"
        ? "text-kwiq-warn"
        : tone === "paused"
          ? "text-kwiq-accent"
          : "text-kwiq-text";
  return (
    <div className="rounded-2xl border border-kwiq-border bg-kwiq-panel/40 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-kwiq-muted">
        {label}
      </p>
      <p className={`mt-2 font-display text-3xl font-semibold tracking-wide ${valueClass}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-kwiq-muted">{hint}</p>}
    </div>
  );
}

function ProjectStatusBadge({
  status,
  hasGhlLocation,
}: {
  status: string;
  hasGhlLocation: boolean;
}) {
  // Si el proyecto NO tiene location creada, lo marcamos especial — es un
  // "pendiente de provisioning" que el admin tiene que resolver.
  if (!hasGhlLocation) {
    return (
      <span className="shrink-0 rounded-full border border-kwiq-warn/40 bg-kwiq-warn/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-kwiq-warn">
        Sub-cuenta pendiente
      </span>
    );
  }

  const { label, cls } = statusStyle(status);
  return (
    <span
      className={
        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest " +
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
