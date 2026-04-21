"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Stage = "parsing" | "form" | "submitting" | "error";

/**
 * Flow de canje del magic link para clientes invitados.
 *
 * 1. Supabase redirige desde el mail a /interview/accept-invite con un
 *    fragment `#access_token=...&refresh_token=...&type=invite`.
 * 2. Este componente, ya en el browser, llama a `setSession()` con esos
 *    tokens — eso le pide a Supabase que setee las cookies de sesión.
 * 3. Muestra un form "Definí tu contraseña" y hace POST a
 *    /api/interview/accept-invite (que tiene la service_role para
 *    actualizar la password).
 * 4. Redirige a /interview.
 */
export function AcceptInviteForm() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("parsing");
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();

    (async () => {
      // Leemos fragment y/o query. Supabase v2 suele devolver tokens en hash.
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      const hashError = params.get("error_description");

      if (hashError) {
        setStage("error");
        setError(hashError);
        return;
      }

      if (access_token && refresh_token) {
        const { error: setErr } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (setErr) {
          setStage("error");
          setError("No pudimos validar tu invitación: " + setErr.message);
          return;
        }
        // Limpiamos el hash para evitar que queden tokens en la URL.
        if (typeof window !== "undefined") {
          history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search,
          );
        }
      }

      // Ya sea que vinimos del mail o que ya había sesión, chequeamos.
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setStage("error");
        setError(
          "Tu link de invitación expiró o ya lo usaste. Pedí al equipo Kwiq que te reenvíe la invitación.",
        );
        return;
      }
      setEmail(data.user.email ?? null);
      setStage("form");
    })();
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña tiene que tener al menos 8 caracteres.");
      return;
    }
    setError(null);
    setStage("submitting");
    try {
      const res = await fetch("/api/interview/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
        };
        setStage("form");
        if (body.error === "not_authenticated") {
          setError("Tu sesión expiró. Volvé a abrir el link del mail.");
        } else if (body.error === "not_interview_user") {
          setError(
            "Este email no está registrado como cliente. Contactá al equipo Kwiq.",
          );
        } else if (body.error === "password_update_failed") {
          setError(body.detail ?? "No pudimos guardar la contraseña.");
        } else {
          setError("Algo falló al guardar. Probá de nuevo.");
        }
        return;
      }
      router.replace("/interview");
      router.refresh();
    } catch {
      setStage("form");
      setError("No pudimos conectar con el servidor.");
    }
  }

  if (stage === "parsing") {
    return (
      <div className="text-sm text-kwiq-muted">
        Validando tu invitación…
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="rounded-md border border-kwiq-err/40 bg-kwiq-err/10 px-3 py-3 text-sm text-kwiq-err">
        {error ?? "No pudimos procesar tu invitación."}
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      {email && (
        <div className="rounded-lg border border-kwiq-border bg-kwiq-bg/40 px-3 py-2 text-sm text-kwiq-muted">
          Invitación para <span className="text-kwiq-text">{email}</span>
        </div>
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-kwiq-muted">Contraseña nueva</span>
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 text-sm outline-none focus:border-kwiq-accent"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-kwiq-muted">Repetí la contraseña</span>
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
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
        disabled={stage === "submitting" || !password || !password2}
        className={cn(
          "mt-2 rounded-lg px-4 py-2 text-sm font-medium transition",
          stage === "submitting" || !password || !password2
            ? "bg-kwiq-border text-kwiq-muted"
            : "bg-kwiq-accent text-kwiq-bg hover:bg-kwiq-accentHover",
        )}
      >
        {stage === "submitting" ? "Guardando…" : "Guardar y empezar"}
      </button>
    </form>
  );
}
