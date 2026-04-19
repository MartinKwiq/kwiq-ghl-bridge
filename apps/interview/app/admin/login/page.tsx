import Link from "next/link";
import { Logo } from "@/components/logo";
import { LoginForm } from "@/components/admin/login-form";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  const errorMessage = (() => {
    switch (error) {
      case "domain":
        return "Solo se permite el acceso con email @kwiq.io.";
      case "not_admin":
        return "Tu email es válido pero no estás en la allowlist de admins.";
      case "invalid_credentials":
        return "Email o contraseña incorrectos.";
      case "unexpected":
        return "Ocurrió un error inesperado. Intentá de nuevo.";
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
          Panel administrador
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold uppercase tracking-wide">
          Ingresá a Kwiq Admin
        </h1>
        <p className="mt-2 text-sm text-kwiq-muted">
          Acceso restringido al equipo Kwiq (<code>@kwiq.io</code>).
        </p>

        {errorMessage && (
          <div className="mt-4 rounded-md border border-kwiq-err/40 bg-kwiq-err/10 px-3 py-2 text-sm text-kwiq-err">
            {errorMessage}
          </div>
        )}

        <div className="mt-6">
          <LoginForm nextPath={next ?? "/admin"} />
        </div>

        <p className="mt-6 text-xs text-kwiq-muted">
          ¿Olvidaste tu contraseña? Pedile a otro admin que te la resetee desde
          el dashboard de Supabase, o contactá a martin@kwiq.io.
        </p>
      </div>
    </main>
  );
}
