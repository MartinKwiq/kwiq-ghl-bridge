import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { StartSessionButton } from "@/components/interview/start-session-button";
import { LogoutButton } from "@/components/interview/logout-button";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionRow = {
  id: string;
  session_token: string;
  status: string;
  current_section_id: string | null;
  created_at: string;
  updated_at: string | null;
  completed_at: string | null;
};

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
export default async function InterviewLandingPage() {
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
      "id, session_token, status, current_section_id, created_at, updated_at, completed_at",
    )
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const rows = (sessions ?? []) as SessionRow[];

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

        <section className="rounded-2xl border border-kwiq-border bg-kwiq-panel p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-kwiq-muted">
            {project ? `Proyecto · ${project.client_name}` : "Bienvenido"}
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold uppercase tracking-wide">
            Hola, {displayName}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-kwiq-muted">
            Desde acá podés iniciar una entrevista nueva o retomar una que ya
            habías empezado. Toda la información se guarda automáticamente —
            podés pausar y volver cuando quieras.
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
                const href = `/entrevista/${s.session_token}`;
                return (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-xl border border-kwiq-border bg-kwiq-panel px-4 py-3"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm text-kwiq-text">
                        {isDone ? "Entrevista completada" : "En progreso"}
                        {s.current_section_id ? (
                          <span className="text-kwiq-muted">
                            {" "}
                            · sección {s.current_section_id}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-kwiq-muted">
                        Iniciada{" "}
                        {new Date(s.created_at).toLocaleString("es-AR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                    <Link
                      href={href}
                      className="rounded-md border border-kwiq-border bg-kwiq-bg/60 px-3 py-1.5 text-xs text-kwiq-text hover:bg-kwiq-bg"
                    >
                      {isDone ? "Ver" : "Retomar"}
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
