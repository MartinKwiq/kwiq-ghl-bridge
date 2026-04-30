import Link from "next/link";
import { Logo } from "@/components/logo";
import { AdminAcceptInviteForm } from "@/components/admin/accept-invite-form";

export const dynamic = "force-dynamic";

/**
 * Landing pública a la que aterriza un admin nuevo después de hacer click
 * en el magic link del email de invitación al equipo Kwiq.
 *
 * El trabajo real lo hace <AdminAcceptInviteForm /> en el browser, porque
 * los tokens de Supabase vienen en el fragment (`#access_token=...`) y el
 * server no los ve.
 *
 * Ruta hermana: `/interview/accept-invite` (mismo flow pero para clientes
 * invitados a hacer la entrevista).
 */
export default function AdminAcceptInvitePage() {
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
          Activación de cuenta · Equipo Kwiq
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold uppercase tracking-wide">
          Definí tu contraseña
        </h1>
        <p className="mt-2 text-sm text-kwiq-muted">
          Bienvenido al equipo. Para entrar al panel de administración tenés
          que elegir una contraseña ahora — la vas a usar para loguearte en{" "}
          <code className="text-kwiq-text">/admin/login</code> a partir de
          ahora.
        </p>

        <div className="mt-6">
          <AdminAcceptInviteForm />
        </div>

        <p className="mt-6 text-xs text-kwiq-muted">
          Si esta es tu primera vez en Kwiq, guardá bien tu contraseña — no la
          podemos recuperar nosotros, solo restablecerla por email.
        </p>
      </div>
    </main>
  );
}
