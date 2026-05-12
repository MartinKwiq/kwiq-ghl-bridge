"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Botón "Empezar nueva entrevista". Hace POST a /api/interview/start y
 * redirige a /entrevista/[token] con la sesión recién creada.
 */
export function StartSessionButton({
  label = "Empezar nueva entrevista",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/interview/start", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        token?: string;
        error?: string;
      };
      if (!res.ok || !body.token) {
        setError(
          body.error === "not_authenticated"
            ? "Tu sesión expiró. Vuelve a entrar."
            : "No pudimos iniciar la sesión. Prueba de nuevo.",
        );
        return;
      }
      router.push(`/entrevista/${body.token}`);
    } catch {
      setError("No pudimos conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={go}
        disabled={loading}
        className={cn(
          "rounded-lg px-4 py-2 text-sm font-medium transition",
          loading
            ? "bg-kwiq-border text-kwiq-muted"
            : "bg-kwiq-accent text-kwiq-bg hover:bg-kwiq-accentHover",
        )}
      >
        {loading ? "Arrancando…" : label}
      </button>
      {error && (
        <p className="mt-2 text-xs text-kwiq-err">{error}</p>
      )}
    </div>
  );
}
