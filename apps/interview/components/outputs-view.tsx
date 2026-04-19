"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function OutputsView({
  token,
  initialConfig,
  initialPrompt,
}: {
  token: string;
  initialConfig?: Record<string, unknown>;
  initialPrompt?: string;
}) {
  const [config, setConfig] = useState<Record<string, unknown> | undefined>(initialConfig);
  const [prompt, setPrompt] = useState<string | undefined>(initialPrompt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"json" | "prompt">("json");

  async function regenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/outputs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { details?: string };
        throw new Error(body.details || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        ghl_autoconfig: Record<string, unknown>;
        conversation_ai_prompt: string;
      };
      setConfig(data.ghl_autoconfig);
      setPrompt(data.conversation_ai_prompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
  }

  function download(filename: string, text: string, mime: string) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const hasAny = Boolean(config || prompt);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={regenerate}
          disabled={loading}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition",
            loading
              ? "bg-kwiq-border text-kwiq-muted"
              : "bg-kwiq-accent text-kwiq-bg hover:bg-kwiq-accentHover",
          )}
        >
          {loading ? "Generando…" : hasAny ? "Regenerar con las respuestas más recientes" : "Generar outputs"}
        </button>
        {hasAny && (
          <>
            <button
              type="button"
              onClick={() => config && download("kwiq-config.json", JSON.stringify(config, null, 2), "application/json")}
              className="rounded-lg border border-kwiq-border px-3 py-2 text-sm hover:bg-kwiq-bg/40"
            >
              Descargar JSON
            </button>
            <button
              type="button"
              onClick={() => prompt && download("kwiq-agent-prompt.txt", prompt, "text/plain")}
              className="rounded-lg border border-kwiq-border px-3 py-2 text-sm hover:bg-kwiq-bg/40"
            >
              Descargar prompt
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-kwiq-err/40 bg-kwiq-err/10 px-3 py-2 text-sm text-kwiq-err">
          {error}
        </div>
      )}

      {!hasAny && !loading && (
        <p className="rounded-lg border border-kwiq-border bg-kwiq-panel p-4 text-sm text-kwiq-muted">
          Todavía no se generó la configuración. Podés hacerlo en cualquier momento
          de la entrevista; se versiona cada vez que regenerás.
        </p>
      )}

      {hasAny && (
        <div className="rounded-2xl border border-kwiq-border bg-kwiq-panel">
          <div className="flex border-b border-kwiq-border">
            <TabButton active={tab === "json"} onClick={() => setTab("json")}>
              Configuración Kwiq (JSON)
            </TabButton>
            <TabButton active={tab === "prompt"} onClick={() => setTab("prompt")}>
              Prompt del agente IA
            </TabButton>
            <div className="ml-auto flex items-center px-3">
              <button
                type="button"
                onClick={() =>
                  tab === "json"
                    ? config && copy(JSON.stringify(config, null, 2))
                    : prompt && copy(prompt)
                }
                className="text-xs text-kwiq-muted hover:text-kwiq-text"
              >
                Copiar
              </button>
            </div>
          </div>
          <pre className="kwiq-scroll max-h-[60vh] overflow-auto p-4 font-mono text-xs leading-relaxed">
            {tab === "json"
              ? config
                ? JSON.stringify(config, null, 2)
                : "// sin datos todavía"
              : prompt ?? "// sin datos todavía"}
          </pre>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-r border-kwiq-border px-4 py-2 text-sm",
        active
          ? "bg-kwiq-bg/40 text-kwiq-text"
          : "text-kwiq-muted hover:bg-kwiq-bg/20 hover:text-kwiq-text",
      )}
    >
      {children}
    </button>
  );
}
