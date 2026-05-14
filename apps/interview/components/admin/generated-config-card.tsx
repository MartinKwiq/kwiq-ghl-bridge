"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Card "Configuración Generada" para /admin/proyectos/[slug].
 *
 * Muestra inline el prompt del agente IA y el autoconfig JSON producidos
 * por la entrevista — para que el admin no tenga que navegar a
 * /entrevista/[token]/outputs para verlos.
 *
 * Features:
 *  - Prompt con scroll y botón "Copiar al portapapeles" (con feedback de
 *    "Copiado ✓" durante 2 seg).
 *  - Metadata visible: palabras, dentro del límite GHL, nombre del agente.
 *  - Autoconfig JSON expandible (details/summary) para debugging.
 *  - Botón "Regenerar con respuestas más recientes" → POST /api/outputs.
 */

interface PromptBundle {
  prompt?: string;
  response_style?: string;
  handoff_phrase?: string;
  custom_values_referenced?: string[];
  metadata?: {
    name?: string;
    language?: string;
    tone?: string;
    word_count?: number;
    character_count?: number;
    within_ghl_limit?: boolean;
    blocks?: Array<{ name: string; words: number }>;
  };
}

interface Meta {
  sessionId: string;
  generatedAt: string;
  version: number;
}

export function GeneratedConfigCard({
  promptBundle,
  promptMeta,
  autoconfig,
  autoconfigMeta,
  defaultSessionToken,
}: {
  promptBundle: PromptBundle | null;
  promptMeta: Meta | null;
  autoconfig: Record<string, unknown> | null;
  autoconfigMeta: Meta | null;
  /** Token de la sesión cuyos outputs vamos a regenerar (default: la más
   *  reciente). Si null, deshabilitamos el botón. */
  defaultSessionToken: string | null;
}) {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  const hasContent = !!promptBundle?.prompt || !!autoconfig;

  async function copyPrompt() {
    if (!promptBundle?.prompt) return;
    try {
      await navigator.clipboard.writeText(promptBundle.prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      setCopiedPrompt(false);
    }
  }

  async function regenerate() {
    if (!defaultSessionToken || regenerating) return;
    setRegenerating(true);
    setRegenError(null);
    try {
      const res = await fetch("/api/outputs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: defaultSessionToken }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          details?: string;
          error?: string;
        };
        setRegenError(
          body.details ||
            body.error ||
            "No pudimos regenerar. Revisá los logs del server.",
        );
        return;
      }
      // Recargamos la página para mostrar la versión nueva.
      window.location.reload();
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : "Error de red.");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <section className="rounded-2xl border border-kwiq-border bg-kwiq-panel/40 p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-kwiq-text">
            Configuración generada
          </h2>
          <p className="mt-1 text-xs text-kwiq-muted">
            Prompt del agente IA + JSON de configuración listos para aplicar
            a la sub-cuenta GHL. Se actualizan al regenerar outputs después
            de cambios en la entrevista.
          </p>
        </div>
        {defaultSessionToken && (
          <button
            type="button"
            onClick={() => void regenerate()}
            disabled={regenerating}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs transition",
              regenerating
                ? "border-kwiq-border bg-kwiq-bg/40 text-kwiq-muted"
                : "border-kwiq-accent/40 bg-kwiq-accent/10 text-kwiq-accent hover:bg-kwiq-accent/15",
            )}
            title="Vuelve a generar el prompt y el autoconfig usando las respuestas más recientes de la entrevista"
          >
            {regenerating ? "Regenerando…" : "Regenerar con respuestas más recientes"}
          </button>
        )}
      </div>

      {regenError && (
        <div className="mb-3 rounded-md border border-kwiq-err/40 bg-kwiq-err/10 px-3 py-2 text-xs text-kwiq-err">
          {regenError}
        </div>
      )}

      {!hasContent && (
        <div className="rounded-xl border border-dashed border-kwiq-border bg-kwiq-bg/40 p-4 text-sm text-kwiq-muted">
          Todavía no hay outputs generados. Apretá <strong>Regenerar</strong>{" "}
          una vez que el cliente haya avanzado en la entrevista, o esperá a
          que termine la sección Contexto General y se generen automáticamente.
        </div>
      )}

      {/* ── Prompt del agente IA ─────────────────────────────────── */}
      {promptBundle?.prompt && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium uppercase tracking-[0.18em] text-kwiq-muted">
              Prompt del agente IA
            </h3>
            <div className="flex items-center gap-2">
              <PromptMetadataChips bundle={promptBundle} />
              <button
                type="button"
                onClick={() => void copyPrompt()}
                className="rounded-md border border-kwiq-border bg-kwiq-bg/60 px-2 py-1 text-xs text-kwiq-muted hover:border-kwiq-accent hover:text-kwiq-accent"
                title="Copiar el prompt al portapapeles para pegarlo en GHL"
              >
                {copiedPrompt ? "✓ Copiado" : "Copiar"}
              </button>
            </div>
          </div>

          <pre className="kwiq-scroll max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg border border-kwiq-border bg-kwiq-bg/60 p-4 font-mono text-[12px] leading-relaxed text-kwiq-text">
            {promptBundle.prompt}
          </pre>

          {/* Metadata extra */}
          <div className="flex flex-wrap gap-3 text-xs text-kwiq-muted">
            {promptBundle.response_style && (
              <span>
                <strong className="text-kwiq-text">Response style:</strong>{" "}
                {promptBundle.response_style}
              </span>
            )}
            {promptBundle.handoff_phrase && (
              <span>
                <strong className="text-kwiq-text">Handoff:</strong>{" "}
                &quot;{promptBundle.handoff_phrase}&quot;
              </span>
            )}
            {promptBundle.custom_values_referenced &&
              promptBundle.custom_values_referenced.length > 0 && (
                <span>
                  <strong className="text-kwiq-text">Variables:</strong>{" "}
                  {promptBundle.custom_values_referenced.length} referenciadas
                </span>
              )}
            {promptMeta && (
              <span>
                <strong className="text-kwiq-text">Versión:</strong> v
                {promptMeta.version} ·{" "}
                {new Date(promptMeta.generatedAt).toLocaleString("es-MX", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Autoconfig JSON ─────────────────────────────────────── */}
      {autoconfig && (
        <details className="mt-5 rounded-lg border border-kwiq-border bg-kwiq-bg/40 p-3">
          <summary className="cursor-pointer text-sm text-kwiq-muted hover:text-kwiq-text">
            <strong className="text-kwiq-text">Autoconfig JSON</strong>{" "}
            (estructura completa que consume el provisioner){" "}
            {autoconfigMeta && (
              <span className="text-xs">· v{autoconfigMeta.version}</span>
            )}
          </summary>
          <pre className="kwiq-scroll mt-3 max-h-[420px] overflow-auto whitespace-pre rounded-md bg-kwiq-bg/60 p-3 font-mono text-[11px] leading-relaxed text-kwiq-text">
            {JSON.stringify(autoconfig, null, 2)}
          </pre>
        </details>
      )}
    </section>
  );
}

function PromptMetadataChips({ bundle }: { bundle: PromptBundle }) {
  const m = bundle.metadata;
  if (!m) return null;
  const wordCount = m.word_count ?? 0;
  const within = m.within_ghl_limit ?? true;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {m.name && (
        <span className="rounded-full border border-kwiq-border bg-kwiq-bg/60 px-2 py-0.5 text-[10px] uppercase tracking-widest text-kwiq-muted">
          {m.name}
        </span>
      )}
      {wordCount > 0 && (
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest",
            within
              ? "border-kwiq-ok/40 bg-kwiq-ok/10 text-kwiq-ok"
              : "border-kwiq-err/40 bg-kwiq-err/10 text-kwiq-err",
          )}
          title={
            within
              ? "Dentro del límite de 2000 palabras de GHL"
              : "Excede el límite — recortar antes de aplicar"
          }
        >
          {wordCount} palabras
        </span>
      )}
    </div>
  );
}
