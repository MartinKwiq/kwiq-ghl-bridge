"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Formulario mínimo para crear una sesión.
 * Pide opcionalmente el nombre de la empresa y el email del dueño.
 */
export default function NuevaEntrevistaPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim() || undefined,
          ownerEmail: ownerEmail.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { details?: string };
        throw new Error(body.details || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { token: string };
      router.push(`/entrevista/${data.token}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-12">
      <form
        onSubmit={start}
        className="w-full rounded-2xl border border-kwiq-border bg-kwiq-panel p-8"
      >
        <p className="text-xs uppercase tracking-[0.18em] text-kwiq-muted">Nueva entrevista</p>
        <h1 className="mt-2 text-2xl font-semibold">Contame un par de cosas para arrancar</h1>
        <p className="mt-2 text-sm text-kwiq-muted">
          Opcional — pero nos ayuda a personalizar la conversación desde el primer turno.
        </p>

        <label className="mt-6 block">
          <span className="text-xs text-kwiq-muted">Nombre de la empresa</span>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Ej: Kwiq"
            className="mt-1 w-full rounded-lg border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 text-sm outline-none focus:border-kwiq-accent"
          />
        </label>

        <label className="mt-4 block">
          <span className="text-xs text-kwiq-muted">Tu email</span>
          <input
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            placeholder="tu@empresa.com"
            className="mt-1 w-full rounded-lg border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 text-sm outline-none focus:border-kwiq-accent"
          />
        </label>

        {error && (
          <p className="mt-4 rounded-md border border-kwiq-err/40 bg-kwiq-err/10 px-3 py-2 text-sm text-kwiq-err">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-kwiq-accent px-4 py-2 font-medium text-white transition hover:bg-kwiq-accentHover disabled:opacity-50"
        >
          {loading ? "Creando…" : "Empezar"}
        </button>
      </form>
    </main>
  );
}
