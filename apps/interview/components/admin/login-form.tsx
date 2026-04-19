"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Formulario de login de admin Kwiq (email + password).
 *
 * Hace POST a /api/admin/login, que setea las cookies de Supabase y devuelve
 * éxito/fallo. En caso de éxito, `router.replace(nextPath)` lleva al dashboard
 * y fuerza al RSC tree a rehidratar con la sesión nueva.
 */
export function LoginForm({ nextPath = "/admin" }: { nextPath?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (body.error === "domain") {
          setError("Solo se permite el acceso con email @kwiq.io.");
        } else if (body.error === "not_admin") {
          setError("Tu email no está en la allowlist de admins.");
        } else if (body.error === "invalid_credentials") {
          setError("Email o contraseña incorrectos.");
        } else {
          setError("No pudimos iniciar sesión. Probá de nuevo.");
        }
        return;
      }
      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("No pudimos conectar con el servidor. Revisá la red.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-kwiq-muted">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@kwiq.io"
          className="rounded-lg border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 text-sm outline-none focus:border-kwiq-accent"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-kwiq-muted">Contraseña</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 text-sm outline-none focus:border-kwiq-accent"
        />
      </label>

      {error && (
        <div className="rounded-md border border-kwiq-err/40 bg-kwiq-err/10 px-3 py-2 text-sm text-kwiq-err">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !email || !password}
        className={cn(
          "mt-2 rounded-lg px-4 py-2 text-sm font-medium transition",
          loading || !email || !password
            ? "bg-kwiq-border text-kwiq-muted"
            : "bg-kwiq-accent text-kwiq-bg hover:bg-kwiq-accentHover",
        )}
      >
        {loading ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
