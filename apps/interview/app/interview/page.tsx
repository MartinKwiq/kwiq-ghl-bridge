import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { StartSessionButton } from "@/components/interview/start-session-button";
import { LogoutButton } from "@/components/interview/logout-button";
import { sectionOrder, getSectionById } from "@/lib/interview-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionRow = {
  id: string;
  session_token: string;
  status: string;
  current_section_id: string | null;
  completed_section_ids: string[] | null;
  created_at: string;
  updated_at: string | null;
  completed_at: string | null;
  paused_at: string | null;
};

/** Traducciones user-friendly del status de una sesión. */
function statusLabel(status: string): { label: string; tone: "ok" | "pending" | "paused" } {
  switch (status) {
    case "completed":
      return { label: "Entrevista completada", tone: "ok" };
    case "paused":
      return { label: "Pausada", tone: "paused" };
    case "in_progress":
      return { label: "En progreso", tone: "pending" };
    default:
      return { label: status, tone: "pending" };
  }
}

/**
 * Landing autenticada del cliente. Muestra:
 *  - saludo + proyecto.
 *  - CTA para empezar una nueva entrevista.
 *  - lista de sesiones previas con link para retomar o ver.
 *
 * Si no hay sesión → redirect a /interview/login.
 * Si hay sesión pero no está en kwiq_interview_users (ej. un admin entró
 * por error) → redirect a /admin.
 */
export default async function InterviewLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ paused?: string }>;
}) {
  const params = await searchParams;
  const justPaused = params.paused === "1";

  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();

  if (!auth?.user) {
    redirect("/interview/login");
  }

  const admin = supabaseAdmin();

  const { data: client } = await admin
    .from("kwiq_interview_users")
    .select(
      "user_id, email, display_name, company_name, project_id, first_login_at",
    )
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!client) {
    // Probablemente es un admin o un user suelto. Lo mandamos al panel
    // admin; si tampoco es admin, ese middleware lo echa.
    redirect("/admin");
  }

  let project: { id: string; slug: string; client_name: string } | null = null;
  if (client.project_id) {
    const { data: proj } = await admin
      .from("kwiq_projects")
      .select("id, slug, client_name")
      .eq("id", client.project_id)
      .maybeSingle();
    project = proj ?? null;
  }

  const { data: sessions } = await admin
    .from("interview_sessions")
    .select(
      "id, session_token, status, current_section_id, completed_section_ids, created_at, updated_at, completed_at, paused_at",
    )
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const rows = (sessions ?? []) as SessionRow[];
  const totalSections = sectionOrder().length;

  const displayName =
    client.display_name || client.company_name || client.email || "Cliente";

  return (
    <main className="relative min-h-screen bg-kwiq-bg px-6 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(45,196,160,0.05),transparent_60%)]"
      />

      <div className="relative mx-auto flex max-w-4xl flex-col gap-8">
        <header className="flex items-center justify-between">
          <Link href="/" aria-label="Inicio Kwiq" className="inline-block">
            <Logo variant="wordmark" size={28} />
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs text-kwiq-muted">{client.email}</span>
            <LogoutButton />
          </div>
        </header>

        {justPaused && (
          <div className="rounded-xl border border-kwiq-accent/40 bg-kwiq-accent/10 px-4 py-3 text-sm text-kwiq-text">
            <strong>Guardamos tu progreso.</strong>{" "}
            <span className="text-kwiq-muted">
              Cuando quieras seguir, entra a la entrevista pausada abajo —
              retomas exactamente donde quedaste.
            </span>
          </div>
        )}

        <section className="rounded-2xl border border-kwiq-border bg-kwiq-panel p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-kwiq-muted">
            {project ? `Proyecto · ${project.client_name}` : "Bienvenido"}
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold uppercase tracking-wide">
            Hola, {displayName}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-kwiq-muted">
            Desde aquí puedes iniciar una entrevista nueva o retomar una que
            ya habías empezado. Toda la información se guarda automáticamente
            — puedes pausar y volver cuando quieras.
          </p>
          <div className="mt-5">
            <StartSessionButton />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm uppercase tracking-[0.18em] text-kwiq-muted">
            Tus entrevistas
          </h2>
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-kwiq-border bg-kwiq-panel/40 p-6 text-sm text-kwiq-muted">
              Todavía no empezaste ninguna entrevista. Hacé click en{" "}
              <em>Empezar nueva entrevista</em> para arrancar.
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((s) => {
                const isDone = s.status === "completed" || !!s.completed_at;
                const status = statusLabel(s.status);
                const completedCount = (s.completed_section_ids ?? []).length;
                const currentTitle = s.current_section_id
                  ? getSectionById(s.current_section_id)?.title ??
                    s.current_section_id
                  : null;
                const href = `/entrevista/${s.session_token}`;
                const actionLabel = isDone
                  ? "Ver"
                  : s.status === "paused"
                    ? "Retomar"
                    : "Continuar";
                return (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-kwiq-border bg-kwiq-panel px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={
                            "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest " +
                            (status.tone === "ok"
                              ? "border border-kwiq-ok/40 bg-kwiq-ok/10 text-kwiq-ok"
                              : status.tone === "paused"
                                ? "border border-kwiq-accent/40 bg-kwiq-accent/10 text-kwiq-accent"
                                : "border border-kwiq-border bg-kwiq-bg/40 text-kwiq-muted")
                          }
                        >
                          {status.label}
                        </span>
                        <span className="text-sm text-kwiq-text">
                          {completedCount} de {totalSections} secciones
                          {currentTitle && !isDone ? (
                            <span className="text-kwiq-muted">
                              {" "}· próxima: {currentTitle}
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <span className="text-xs text-kwiq-muted">
                        Iniciada{" "}
                        {new Date(s.created_at).toLocaleString("es-AR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                        {s.paused_at && s.status === "paused" ? (
                          <>
                            {" "}· pausada{" "}
                            {new Date(s.paused_at).toLocaleString("es-AR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </>
                        ) : null}
                      </span>
                    </div>
                    <Link
                      href={href}
                      className="shrink-0 rounded-md border border-kwiq-border bg-kwiq-bg/60 px-3 py-1.5 text-xs text-kwiq-text hover:bg-kwiq-bg"
                    >
                      {actionLabel}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
