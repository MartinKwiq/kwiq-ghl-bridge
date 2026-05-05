import Link from "next/link";
import { sectionOrder, INTERVIEW } from "@/lib/interview-schema";
import { BRAND } from "@/lib/brand";
import { Logo } from "@/components/logo";

/**
 * Landing / punto de entrada.
 *
 * Muestra el logo de Kwiq, copy de bienvenida y los dos caminos:
 *  - Empezar entrevista real (requiere Gemini + Supabase configurados).
 *  - Probar la demo (0 configuración, guion determinístico).
 */
export default function HomePage() {
  const sections = sectionOrder();

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

        {/*
          Importante: la entrevista NO se puede iniciar desde la home.
          El único camino válido es la invitación por correo (magic link)
          que el equipo Kwiq le envía al cliente. Esa invitación vincula
          la sesión al `kwiq_project` correcto y al usuario logueado, así
          que nada queda huérfano.

          Si un cliente aterriza acá por accidente, el botón "Soy cliente
          Kwiq" lo lleva al login — y desde ahí va a poder retomar su
          entrevista en /interview.
         */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/interview/login"
            className="inline-flex items-center rounded-lg bg-kwiq-accent px-4 py-2 font-medium text-kwiq-bg transition hover:bg-kwiq-accentHover"
          >
            Soy cliente Kwiq · ingresar
          </Link>
          <Link
            href="/demo"
            className="inline-flex items-center rounded-lg border border-kwiq-border bg-kwiq-bg/40 px-4 py-2 font-medium text-kwiq-text transition hover:bg-kwiq-bg/70"
            title="Recorrido guiado, sin configuración previa"
          >
            Probar demo (sin configuración)
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
