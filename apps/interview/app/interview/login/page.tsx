import Link from "next/link";
import { Logo } from "@/components/logo";
import { ClientLoginForm } from "@/components/interview/client-login-form";

export const dynamic = "force-dynamic";

/**
 * Página pública de login para clientes invitados.
 *
 * Pathway de acceso:
 *  - El cliente recibió un magic link → aterrizó en /interview/accept-invite →
 *    seteó contraseña → ahora puede loguearse acá con email + password.
 *  - Después del login, termina en /interview (landing autenticada).
 */
export default async function ClientLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  const errorMessage = (() => {
    switch (error) {
      case "not_interview_user":
        return "Este email no está invitado como cliente.";
      case "invalid_credentials":
        return "Email o contraseña incorrectos.";
      case "session_expired":
        return "Tu sesión expiró. Volvé a ingresar.";
      default:
        return null;
    }
  })();

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
          Acceso cliente
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold uppercase tracking-wide">
          Entrá a tu entrevista Kwiq
        </h1>
        <p className="mt-2 text-sm text-kwiq-muted">
          Usá el email al que recibiste la invitación y la contraseña que
          definiste al ingresar por primera vez.
        </p>

        {errorMessage && (
          <div className="mt-4 rounded-md border border-kwiq-err/40 bg-kwiq-err/10 px-3 py-2 text-sm text-kwiq-err">
            {errorMessage}
          </div>
        )}

        <div className="mt-6">
          <ClientLoginForm nextPath={next ?? "/interview"} />
        </div>

        <p className="mt-6 text-xs text-kwiq-muted">
          ¿Primera vez acá? Revisá tu bandeja de entrada — te enviamos un link
          mágico para setear tu contraseña.
        </p>
      </div>
    </main>
  );
}
