import Link from "next/link";
import { Logo } from "@/components/logo";
import { AcceptInviteForm } from "@/components/interview/accept-invite-form";

export const dynamic = "force-dynamic";

/**
 * Landing pública a la que aterriza el cliente después de hacer click
 * en el magic link del email de invitación.
 *
 * El trabajo real lo hace <AcceptInviteForm /> en el browser, porque los
 * tokens vienen en el fragment (`#access_token=...`) y el server no los ve.
 */
export default function AcceptInvitePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-kwiq-bg px-6 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(45,196,160,0.08),transparent_60%)]"
      />

      <div className="relative w-full max-w-md rounded-2xl border border-kwiq-border bg-kwiq-panel p-8 shadow-2xl">
        <Link href="/" aria-label="Inicio Kwiq" className="inline-block">
          <Logo variant="wordmark" size={32} />
        </Link>
        <p className="mt-6 text-xs uppercase tracking-[0.18em] text-kwiq-muted">
          Activación de cuenta
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold uppercase tracking-wide">
          Definí tu contraseña
        </h1>
        <p className="mt-2 text-sm text-kwiq-muted">
          Para volver a entrar a tu entrevista en cualquier momento, necesitás
          una contraseña. Elegí una de al menos 8 caracteres.
        </p>

        <div className="mt-6">
          <AcceptInviteForm />
        </div>

        <p className="mt-6 text-xs text-kwiq-muted">
          Guardá estos datos — vas a usarlos para volver a{" "}
          <Link
            href="/interview/login"
            className="text-kwiq-accent hover:underline"
          >
            /interview/login
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
