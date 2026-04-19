import { SetupWizard } from "@/components/admin/setup-wizard";

export const dynamic = "force-dynamic";

/**
 * /admin/setup — wizard no-code para configurar Supabase por primera vez.
 *
 * No requiere auth (y no puede requerirla: si estamos acá es porque las env
 * vars aún no están cargadas). El wizard:
 *   1. Pide URL + anon key + service_role key de Supabase.
 *   2. Genera INTERVIEW_ENCRYPTION_KEY automáticamente.
 *   3. POST a /api/admin/setup → escribe .env.local en disco.
 *   4. Pide reiniciar `npm run dev` y redirige a /admin/login.
 *
 * Producción (Vercel): las env vars deben setearse en Project Settings →
 * Environment Variables. El wizard te da el bloque listo para pegar.
 */
export default function SetupPage() {
  const envState = {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    INTERVIEW_ENCRYPTION_KEY: Boolean(process.env.INTERVIEW_ENCRYPTION_KEY),
  };
  const allSet = Object.values(envState).every(Boolean);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-12">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-kwiq-muted">
          Kwiq · configuración inicial
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold uppercase tracking-wide">
          Conectar Supabase
        </h1>
        <p className="mt-2 text-sm text-kwiq-muted">
          Primera corrida. Pegá las 3 llaves de tu proyecto Supabase y ya
          queda funcionando. No necesitás editar archivos.
        </p>
      </header>

      <section className="rounded-2xl border border-kwiq-border bg-kwiq-panel/40 p-6">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-kwiq-muted">
          Estado actual
        </h2>
        <ul className="space-y-2 text-sm">
          <EnvRow label="NEXT_PUBLIC_SUPABASE_URL" ok={envState.NEXT_PUBLIC_SUPABASE_URL} />
          <EnvRow
            label="NEXT_PUBLIC_SUPABASE_ANON_KEY"
            ok={envState.NEXT_PUBLIC_SUPABASE_ANON_KEY}
          />
          <EnvRow
            label="SUPABASE_SERVICE_ROLE_KEY"
            ok={envState.SUPABASE_SERVICE_ROLE_KEY}
          />
          <EnvRow
            label="INTERVIEW_ENCRYPTION_KEY"
            ok={envState.INTERVIEW_ENCRYPTION_KEY}
          />
        </ul>
        {allSet && (
          <p className="mt-4 rounded-md border border-kwiq-ok/40 bg-kwiq-ok/10 px-3 py-2 text-sm text-kwiq-ok">
            ✓ Todo configurado. Podés ir a{" "}
            <a href="/admin/login" className="underline">
              /admin/login
            </a>
            .
          </p>
        )}
      </section>

      <SetupWizard />

      <section className="rounded-2xl border border-kwiq-border bg-kwiq-bg/40 p-6 text-sm text-kwiq-muted">
        <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-kwiq-muted">
          ¿Dónde encuentro estas llaves?
        </h2>
        <ol className="ml-5 list-decimal space-y-1">
          <li>
            Entrá a{" "}
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="text-kwiq-accent hover:underline"
            >
              supabase.com/dashboard
            </a>{" "}
            y abrí tu proyecto.
          </li>
          <li>
            Settings → API → &quot;Project URL&quot; y &quot;API Keys&quot;.
          </li>
          <li>
            Copiá el URL, el <code className="font-mono">anon</code> (public)
            y el <code className="font-mono">service_role</code> (⚠ secreto).
          </li>
        </ol>
      </section>
    </main>
  );
}

function EnvRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 font-mono text-xs">
      <span className="text-kwiq-muted">{label}</span>
      <span
        className={
          "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest " +
          (ok
            ? "border-kwiq-ok/40 bg-kwiq-ok/10 text-kwiq-ok"
            : "border-kwiq-warn/40 bg-kwiq-warn/10 text-kwiq-warn")
        }
      >
        {ok ? "configurada" : "falta"}
      </span>
    </li>
  );
}
