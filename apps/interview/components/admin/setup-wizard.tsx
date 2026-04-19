"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Wizard de primera corrida. Pide 3 llaves, genera encryption key del lado
 * server y escribe `.env.local`. Después pide reiniciar `npm run dev`.
 *
 * NOTA: en producción (Vercel) este wizard sigue sirviendo como guía — el
 * endpoint /api/admin/setup detecta que está en un filesystem read-only y
 * devuelve un bloque de texto para pegar en Project Settings.
 */
export function SetupWizard() {
  const [url, setUrl] = useState("");
  const [anon, setAnon] = useState("");
  const [serviceRole, setServiceRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<null | {
    ok: boolean;
    mode: "wrote_file" | "env_block";
    envBlock?: string;
    path?: string;
  }>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          NEXT_PUBLIC_SUPABASE_URL: url.trim(),
          NEXT_PUBLIC_SUPABASE_ANON_KEY: anon.trim(),
          SUPABASE_SERVICE_ROLE_KEY: serviceRole.trim(),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        mode?: "wrote_file" | "env_block";
        envBlock?: string;
        path?: string;
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        setError(body.detail || body.error || "No pudimos guardar.");
        return;
      }
      setResult({
        ok: true,
        mode: body.mode ?? "wrote_file",
        envBlock: body.envBlock,
        path: body.path,
      });
    } catch {
      setError("No pudimos conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  if (result?.ok && result.mode === "wrote_file") {
    return (
      <section className="rounded-2xl border border-kwiq-ok/40 bg-kwiq-ok/5 p-6">
        <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-kwiq-ok">
          ✓ Configurado
        </h2>
        <p className="mt-2 text-sm text-kwiq-text">
          Guardamos tus llaves en{" "}
          <code className="font-mono text-xs">{result.path}</code>.
        </p>
        <ol className="mt-4 ml-5 list-decimal space-y-1 text-sm text-kwiq-muted">
          <li>
            Parate en el terminal y reiniciá con{" "}
            <code className="rounded bg-kwiq-bg/60 px-1 font-mono">
              Ctrl+C
            </code>{" "}
            +{" "}
            <code className="rounded bg-kwiq-bg/60 px-1 font-mono">
              npm run dev
            </code>
            .
          </li>
          <li>
            Abrí{" "}
            <a href="/admin/login" className="text-kwiq-accent hover:underline">
              /admin/login
            </a>{" "}
            y entrá con tu cuenta Kwiq.
          </li>
        </ol>
      </section>
    );
  }

  if (result?.ok && result.mode === "env_block") {
    return (
      <section className="rounded-2xl border border-kwiq-warn/40 bg-kwiq-warn/5 p-6">
        <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-kwiq-warn">
          Copiá esto en Vercel
        </h2>
        <p className="mt-2 text-sm text-kwiq-text">
          Estamos en un filesystem read-only (probablemente Vercel). Copiá
          este bloque en{" "}
          <em>Project Settings → Environment Variables</em> y redeployá.
        </p>
        <pre className="mt-4 overflow-auto rounded-lg border border-kwiq-border bg-kwiq-bg/60 p-3 font-mono text-xs">
          {result.envBlock}
        </pre>
      </section>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-2xl border border-kwiq-border bg-kwiq-panel/40 p-6"
    >
      <h2 className="font-display text-lg font-semibold uppercase tracking-wide">
        Pegá tus llaves
      </h2>

      <Field
        label="Project URL"
        hint="Ej: https://fljbdgaqkvkzdkypgcpk.supabase.co"
      >
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://xxxx.supabase.co"
          className={inputCls + " font-mono"}
        />
      </Field>

      <Field
        label="anon (public) key"
        hint="Empieza con eyJhbGc... — es segura para el cliente."
      >
        <textarea
          required
          value={anon}
          onChange={(e) => setAnon(e.target.value)}
          rows={3}
          placeholder="eyJhbGciOi..."
          className={inputCls + " resize-none font-mono text-xs"}
        />
      </Field>

      <Field
        label="service_role key"
        hint="⚠ Secreta. Solo server-side. Nunca la pegues en el cliente."
      >
        <textarea
          required
          value={serviceRole}
          onChange={(e) => setServiceRole(e.target.value)}
          rows={3}
          placeholder="eyJhbGciOi..."
          className={inputCls + " resize-none font-mono text-xs"}
        />
      </Field>

      {error && (
        <div className="rounded-md border border-kwiq-err/40 bg-kwiq-err/10 px-3 py-2 text-sm text-kwiq-err">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !url || !anon || !serviceRole}
        className={cn(
          "mt-2 rounded-lg px-4 py-2 text-sm font-medium transition",
          loading || !url || !anon || !serviceRole
            ? "bg-kwiq-border text-kwiq-muted"
            : "bg-kwiq-accent text-kwiq-bg hover:bg-kwiq-accentHover",
        )}
      >
        {loading ? "Guardando…" : "Guardar y conectar"}
      </button>

      <p className="text-xs text-kwiq-muted">
        También vamos a generar una llave de cifrado
        (INTERVIEW_ENCRYPTION_KEY) automáticamente.
      </p>
    </form>
  );
}

const inputCls =
  "rounded-lg border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 text-sm outline-none focus:border-kwiq-accent";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-kwiq-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-kwiq-muted/80">{hint}</span>}
    </label>
  );
}
