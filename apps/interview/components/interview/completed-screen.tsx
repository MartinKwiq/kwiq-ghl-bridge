import Link from "next/link";
import { Logo } from "@/components/logo";
import { LogoutButton } from "@/components/interview/logout-button";

/**
 * Pantalla de cierre que se muestra cuando una sesión está en
 * `status = "completed"`. Antes el cliente entraba a /entrevista/[token]
 * de una entrevista ya completada y quedaba en el chat sin saber qué
 * estaba haciendo ahí — confuso.
 *
 * Esta pantalla:
 *  - confirma que la entrevista terminó.
 *  - explica los próximos pasos (qué hace el equipo Kwiq desde acá).
 *  - ofrece volver al listado de entrevistas.
 */
export function InterviewCompletedScreen({
  clientName,
  completedAt,
}: {
  clientName?: string | null;
  completedAt?: string | null;
}) {
  const displayDate = completedAt
    ? new Date(completedAt).toLocaleString("es-AR", {
        dateStyle: "long",
        timeStyle: "short",
      })
    : null;

  return (
    <main className="relative min-h-screen bg-kwiq-bg px-6 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(45,196,160,0.06),transparent_60%)]"
      />

      <div className="relative mx-auto flex max-w-2xl flex-col gap-8">
        <header className="flex items-center justify-between">
          <Link href="/interview" aria-label="Volver al inicio" className="inline-block">
            <Logo variant="wordmark" size={28} />
          </Link>
          <LogoutButton />
        </header>

        <section className="rounded-2xl border border-kwiq-ok/30 bg-kwiq-ok/5 p-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-kwiq-ok/40 bg-kwiq-ok/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-kwiq-ok">
            <span aria-hidden>✓</span>
            <span>Entrevista completada</span>
          </div>
          <h1 className="font-display text-3xl font-semibold uppercase tracking-wide text-kwiq-text">
            ¡Listo{clientName ? `, ${clientName}` : ""}!
          </h1>
          <p className="mt-3 text-sm text-kwiq-muted">
            Terminaste todas las secciones de la entrevista. Nuestro equipo
            ya tiene toda la información para configurar tu cuenta.
            {displayDate ? ` Finalizada el ${displayDate}.` : ""}
          </p>
        </section>

        <section className="rounded-2xl border border-kwiq-border bg-kwiq-panel p-6">
          <h2 className="text-sm uppercase tracking-[0.18em] text-kwiq-muted">
            Próximos pasos
          </h2>
          <ol className="mt-4 flex flex-col gap-3 text-sm text-kwiq-text">
            <li className="flex gap-3">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-kwiq-border bg-kwiq-bg/60 text-xs text-kwiq-accent">
                1
              </span>
              <span>
                <strong>Revisión interna.</strong> El equipo Kwiq revisa tus
                respuestas y prepara la configuración de tu CRM.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-kwiq-border bg-kwiq-bg/60 text-xs text-kwiq-accent">
                2
              </span>
              <span>
                <strong>Configuración automática.</strong> Cargamos en tu
                cuenta los pipelines, calendarios, campos personalizados y el
                asistente virtual que diseñaste.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-kwiq-border bg-kwiq-bg/60 text-xs text-kwiq-accent">
                3
              </span>
              <span>
                <strong>Te avisamos cuando esté lista.</strong> En las
                próximas horas vas a recibir un correo con el acceso a tu
                cuenta lista para usar.
              </span>
            </li>
          </ol>
        </section>

        <section className="rounded-xl border border-kwiq-border bg-kwiq-panel/40 p-5 text-sm text-kwiq-muted">
          <p>
            Si necesitas corregir alguna respuesta o agregar algo que se te
            haya olvidado, contactá al equipo Kwiq directamente. Toda la
            configuración es reversible.
          </p>
        </section>

        <div className="flex items-center justify-center pt-2">
          <Link
            href="/interview"
            className="rounded-lg border border-kwiq-border bg-kwiq-panel px-4 py-2 text-sm text-kwiq-text hover:border-kwiq-accent hover:text-kwiq-accent"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
