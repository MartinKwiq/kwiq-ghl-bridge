import Link from "next/link";
import { redirect } from "next/navigation";
import { sectionOrder, INTERVIEW } from "@/lib/interview-schema";
import { BRAND } from "@/lib/brand";
import { Logo } from "@/components/logo";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Home — router de autenticación.
 *
 * Comportamiento:
 *  1) Si el visitante NO tiene sesión Supabase → mostramos la landing
 *     pública con un único CTA: "Soy cliente Kwiq · ingresar". No hay
 *     ningún botón que arranque entrevista directa, porque el único
 *     camino válido es la invitación por correo (que aterriza en
 *     /interview/accept-invite y crea cookie de sesión).
 *
 *  2) Si el visitante TIENE sesión y es admin Kwiq (@kwiq.io en
 *     kwiq_admins) → redirect a /admin (dashboard interno).
 *
 *  3) Si el visitante TIENE sesión y es cliente (kwiq_interview_users)
 *     → redirect a /interview (panel cliente con sus entrevistas).
 *
 *  4) Si el visitante tiene sesión pero no es ninguno de los dos
 *     (caso raro: cuenta huérfana sin rol asignado) → la dejamos en
 *     la landing pública con un mensaje de "tu cuenta está sin
 *     proyecto asignado, escribinos".
 *
 * Diseñado así porque el usuario reportó que poniendo la URL raíz
 * algunos clientes podían terminar dentro de la entrevista sin
 * pasar por login. Ahora siempre se pasa por el router de auth.
 */
export default async function HomePage() {
  const sections = sectionOrder();

  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();

  if (auth?.user) {
    const admin = supabaseAdmin();

    // Admin Kwiq tiene prioridad — si alguien está en ambas tablas, mandamos
    // al panel admin (caso real: el equipo testeando con su mismo email).
    const { data: adminRow } = await admin
      .from("kwiq_admins")
      .select("user_id")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (adminRow) {
      redirect("/admin");
    }

    const { data: clientRow } = await admin
      .from("kwiq_interview_users")
      .select("user_id")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (clientRow) {
      redirect("/interview");
    }

    // Sesión válida pero sin rol — caemos a la landing con un aviso.
  }

  const sessionExistsButNoRole = !!auth?.user;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-12">
      <div className="mb-6">
        <Logo variant="wordmark" size={56} />
      </div>

      <div className="w-full rounded-2xl border border-kwiq-border bg-kwiq-panel p-8 shadow-xl">
        <p className="text-xs uppercase tracking-[0.18em] text-kwiq-muted">
          {BRAND.name} · Onboarding
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold uppercase leading-tight tracking-tight sm:text-5xl">
          Dejá tu Kwiq configurado en una conversación.
        </h1>
        <p className="mt-4 text-kwiq-muted">
          Nada de planillas. Respondé unas preguntas y Kwiq arma tu CRM, tus
          calendarios, tus pipelines y el agente IA que va a atender a tus
          clientes — todo listo para usar.
        </p>

        <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {sections.map((s) => (
            <li
              key={s.id}
              className="rounded-lg border border-kwiq-border bg-kwiq-bg/40 px-3 py-2 text-sm"
            >
              <span className="text-kwiq-muted">{String(s.order).padStart(3, "0")}</span>{" "}
              <span className="text-kwiq-text">{s.title}</span>
            </li>
          ))}
        </ul>

        {sessionExistsButNoRole && (
          <div className="mt-6 rounded-lg border border-kwiq-warn/40 bg-kwiq-warn/10 px-4 py-3 text-sm text-kwiq-text">
            Estás logueado pero tu cuenta todavía no tiene proyecto asignado.
            Escribinos a{" "}
            <a
              href="mailto:hola@kwiq.io"
              className="underline hover:text-kwiq-warn"
            >
              hola@kwiq.io
            </a>{" "}
            y te lo asociamos.
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/interview/login"
            className="inline-flex items-center rounded-lg bg-kwiq-accent px-4 py-2 font-medium text-kwiq-bg transition hover:bg-kwiq-accentHover"
          >
            Soy cliente Kwiq · ingresar
          </Link>
          <span className="text-xs text-kwiq-muted">
            Schema versión <code className="font-mono">{INTERVIEW.version}</code>
          </span>
        </div>

        <p className="mt-4 text-xs text-kwiq-muted">
          ¿No recibiste el correo con tu link de acceso? Escribinos a{" "}
          <a href="mailto:hola@kwiq.io" className="underline hover:text-kwiq-text">
            hola@kwiq.io
          </a>
          .
        </p>
      </div>

      <footer className="mt-10 text-xs text-kwiq-muted">
        {BRAND.name} · {BRAND.tagline}
      </footer>
    </main>
  );
}
