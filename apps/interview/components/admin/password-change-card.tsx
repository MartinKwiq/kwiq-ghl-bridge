"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Card de "Cambiar contraseña" en /admin/ajustes.
 *
 * Hace POST a /api/admin/password con la nueva contraseña. El endpoint
 * usa supabase.auth.updateUser({ password }) server-side sobre la sesión
 * actual del admin.
 */
export function PasswordChangeCard() {
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    if (pwd.length < 10) {
      setMsg({ ok: false, text: "La contraseña nueva tiene que tener ≥ 10 caracteres." });
      return;
    }
    if (pwd !== pwd2) {
      setMsg({ ok: false, text: "Las contraseñas no coinciden." });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !body.ok) {
        setMsg({
          ok: false,
          text: body.detail || body.error || "No pudimos cambiarla.",
        });
        return;
      }
      setMsg({ ok: true, text: "✓ Contraseña actualizada." });
      setPwd("");
      setPwd2("");
    } catch {
      setMsg({ ok: false, text: "Error de red." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl border border-kwiq-border bg-kwiq-panel/40 p-5"
    >
      <div>
        <h3 className="text-sm font-medium text-kwiq-text">Cambiar contraseña</h3>
        <p className="mt-0.5 text-xs text-kwiq-muted">
          Mínimo 10 caracteres. Después de cambiarla, la sesión sigue activa.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          type="password"
          required
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          placeholder="Nueva contraseña"
          autoComplete="new-password"
          className="rounded-lg border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 text-sm outline-none focus:border-kwiq-accent"
        />
        <input
          type="password"
          required
          value={pwd2}
          onChange={(e) => setPwd2(e.target.value)}
          placeholder="Repetí la nueva contraseña"
          autoComplete="new-password"
          className="rounded-lg border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 text-sm outline-none focus:border-kwiq-accent"
        />
      </div>
      {msg && (
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            msg.ok
              ? "border-kwiq-ok/40 bg-kwiq-ok/10 text-kwiq-ok"
              : "border-kwiq-err/40 bg-kwiq-err/10 text-kwiq-err",
          )}
        >
          {msg.text}
        </div>
      )}
      <button
        type="submit"
        disabled={loading || !pwd || !pwd2}
        className={cn(
          "self-start rounded-lg px-4 py-2 text-sm font-medium transition",
          loading || !pwd || !pwd2
            ? "bg-kwiq-border text-kwiq-muted"
            : "bg-kwiq-accent text-kwiq-bg hover:bg-kwiq-accentHover",
        )}
      >
        {loading ? "Guardando…" : "Actualizar contraseña"}
      </button>
    </form>
  );
}
