"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Panel de "Provisionar en GHL" — se renderiza en `/admin/proyectos/[slug]`.
 *
 * Flujo:
 *  1. El admin ve el último run (si hay) + 2 botones: "Dry-run" y "Aplicar".
 *  2. Al hacer click, POST a /api/admin/proyectos/[slug]/provision con el mode.
 *  3. La UI pasa a "running" (el spinner refleja la espera inline del request,
 *     que puede durar varios segundos — el servidor corre el provisioner
 *     sincrónico por ahora).
 *  4. Cuando el POST vuelve, muestra el RunReport y refresca el SSR con
 *     router.refresh() para que el bloque "últimas corridas" pinte la nueva.
 *
 * Estados:
 *  - idle        → botones habilitados, resumen del último run o empty state.
 *  - running     → botones deshabilitados, dots animados, mensaje de espera.
 *  - done        → muestra el report devuelto por el POST (succeeded/partial).
 *  - failed      → muestra el error + permite reintentar.
 */

type RunStatus = "pending" | "running" | "succeeded" | "failed" | "partial";

interface StepResultItem {
  local_key: string;
  action: "create" | "update" | "skip" | "error";
  external_id?: string;
  error?: string;
}

interface StepResult {
  step: string;
  status: "ok" | "error" | "skipped";
  created: number;
  updated: number;
  skipped: number;
  error_message?: string;
  duration_ms: number;
  items?: StepResultItem[];
}

export interface RunReport {
  run_id: string;
  status: RunStatus;
  step_results: StepResult[];
  error_message?: string;
  started_at: string;
  finished_at: string;
}

export interface ProvisionPanelProps {
  slug: string;
  /** Si el proyecto no tiene ghl_location_id, no ofrecemos el botón. */
  locationReady: boolean;
  /** Último run del proyecto (si hay). Viene del SSR. */
  lastRun?: RunReport | null;
  /** Cantidad total de runs históricos — solo se usa para el copy. */
  totalRuns?: number;
}

type UiState =
  | { kind: "idle" }
  | { kind: "running"; mode: "dry_run" | "apply" }
  | { kind: "done"; report: RunReport }
  | { kind: "failed"; message: string };

export function ProvisionPanel({
  slug,
  locationReady,
  lastRun,
  totalRuns,
}: ProvisionPanelProps) {
  const router = useRouter();
  const initialReport = lastRun ?? null;
  const [state, setState] = useState<UiState>(
    initialReport ? { kind: "done", report: initialReport } : { kind: "idle" },
  );

  const busy = state.kind === "running";

  const runProvision = useCallback(
    async (mode: "dry_run" | "apply") => {
      setState({ kind: "running", mode });
      try {
        const res = await fetch(`/api/admin/proyectos/${slug}/provision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            detail?: string;
          };
          setState({
            kind: "failed",
            message:
              body.detail ??
              body.error ??
              `El servidor respondió ${res.status}.`,
          });
          return;
        }
        const data = (await res.json()) as { report: RunReport };
        setState({ kind: "done", report: data.report });
        // Refrescar la página para que los datos SSR (historial, status
        // del proyecto) reflejen el nuevo run.
        router.refresh();
      } catch (err) {
        setState({
          kind: "failed",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [slug, router],
  );

  return (
    <section className="rounded-2xl border border-kwiq-border bg-kwiq-panel/40 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold uppercase tracking-wide">
          Provisionar en GHL
        </h2>
        {typeof totalRuns === "number" && totalRuns > 0 && (
          <span className="text-xs text-kwiq-muted">
            {totalRuns} corrida{totalRuns === 1 ? "" : "s"} en total
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-kwiq-muted">
        Aplica el <code className="font-mono text-xs">ghl_autoconfig_json</code>{" "}
        generado por la entrevista a la sub-cuenta de GHL. Idempotente:
        re-ejecutarlo no crea recursos duplicados.
      </p>

      {!locationReady && (
        <div className="mt-4 rounded-xl border border-kwiq-warn/40 bg-kwiq-warn/10 p-4 text-sm text-kwiq-text">
          <p className="font-medium">Faltan datos del proyecto.</p>
          <p className="mt-1 text-xs text-kwiq-muted">
            Este proyecto no tiene <code className="font-mono">ghl_location_id</code>{" "}
            asignado. Vinculá una sub-cuenta primero.
          </p>
        </div>
      )}

      {locationReady && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => runProvision("dry_run")}
            className="rounded-lg border border-kwiq-border bg-kwiq-bg/60 px-4 py-2 text-sm text-kwiq-text transition hover:border-kwiq-accent hover:text-kwiq-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && state.mode === "dry_run" ? (
              <span className="inline-flex items-center gap-2">
                <Spinner /> Simulando…
              </span>
            ) : (
              "Dry-run"
            )}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => runProvision("apply")}
            className="rounded-lg border border-kwiq-accent2 bg-kwiq-accent2/20 px-4 py-2 text-sm font-medium text-kwiq-accent2 transition hover:bg-kwiq-accent2/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && state.mode === "apply" ? (
              <span className="inline-flex items-center gap-2">
                <Spinner /> Provisionando…
              </span>
            ) : (
              "Aplicar a GHL"
            )}
          </button>
          <span className="text-xs text-kwiq-muted">
            El dry-run no toca GHL — calcula qué crearía, actualizaría o saltearía.
          </span>
        </div>
      )}

      {state.kind === "failed" && (
        <div className="mt-5 rounded-xl border border-kwiq-err/40 bg-kwiq-err/10 p-4 text-sm text-kwiq-text">
          <p className="font-medium">El provisioner falló.</p>
          <p className="mt-1 text-xs text-kwiq-muted">{state.message}</p>
          <p className="mt-3 text-xs text-kwiq-muted">
            Revisá{" "}
            <Link
              href="/admin/ajustes"
              className="text-kwiq-accent hover:underline"
            >
              /admin/ajustes
            </Link>{" "}
            si el PIT o los scopes no están configurados.
          </p>
        </div>
      )}

      {state.kind === "done" && <RunReportCard report={state.report} />}
    </section>
  );
}

function RunReportCard({ report }: { report: RunReport }) {
  const totals = useMemo(() => {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const s of report.step_results) {
      created += s.created;
      updated += s.updated;
      skipped += s.skipped;
    }
    return { created, updated, skipped };
  }, [report]);

  const durationMs = useMemo(() => {
    const a = Date.parse(report.started_at);
    const b = Date.parse(report.finished_at);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return Math.max(0, b - a);
  }, [report]);

  return (
    <div className="mt-5 rounded-xl border border-kwiq-border bg-kwiq-bg/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <RunStatusBadge status={report.status} />
          <span className="text-xs text-kwiq-muted">
            {new Date(report.finished_at).toLocaleString("es-AR")}
            {durationMs !== null && (
              <> · {(durationMs / 1000).toFixed(1)}s</>
            )}
          </span>
        </div>
        <span className="font-mono text-[10px] text-kwiq-muted">
          {report.run_id || "(sin run_id)"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <TotalChip label="Creados" value={totals.created} tone="accent" />
        <TotalChip label="Actualizados" value={totals.updated} tone="warn" />
        <TotalChip label="Saltados" value={totals.skipped} tone="muted" />
      </div>

      {report.error_message && (
        <p className="mt-3 rounded-lg border border-kwiq-err/40 bg-kwiq-err/10 px-3 py-2 text-xs text-kwiq-text">
          {report.error_message}
        </p>
      )}

      {report.step_results.length === 0 ? (
        <p className="mt-3 text-xs text-kwiq-muted">
          El run no ejecutó ningún step (¿autoconfig vacío?).
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {report.step_results.map((s) => (
            <StepRow key={s.step} step={s} />
          ))}
        </ul>
      )}
    </div>
  );
}

function StepRow({ step }: { step: StepResult }) {
  const items = step.items ?? [];
  const hasItems = items.length > 0;
  return (
    <li className="rounded-lg border border-kwiq-border bg-kwiq-panel/40 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-kwiq-text">{step.step}</span>
        <div className="flex items-center gap-2">
          <StepStatusBadge status={step.status} />
          <span className="text-xs text-kwiq-muted">
            +{step.created} ·{" "}
            <span className="text-kwiq-warn">~{step.updated}</span> ·{" "}
            <span className="text-kwiq-muted">={step.skipped}</span>
            {step.duration_ms ? ` · ${step.duration_ms}ms` : ""}
          </span>
        </div>
      </div>
      {step.error_message && (
        <p className="mt-1 text-xs text-kwiq-err">{step.error_message}</p>
      )}
      {hasItems && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-kwiq-muted hover:text-kwiq-text">
            Ver detalle ({items.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-xs">
            {items.map((it, i) => (
              <li
                key={`${it.local_key}-${i}`}
                className={
                  "flex flex-col gap-1 rounded border border-kwiq-border/50 bg-kwiq-bg/40 px-2 py-1 " +
                  (it.error
                    ? "border-kwiq-err/30 bg-kwiq-err/5"
                    : "")
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="break-all font-mono">{it.local_key}</span>
                  <span className="flex items-center gap-2">
                    <ItemActionBadge action={it.action} />
                    {it.external_id && (
                      <span
                        className="font-mono text-[10px] text-kwiq-muted"
                        title={it.external_id}
                      >
                        {it.external_id.length > 12
                          ? `${it.external_id.slice(0, 12)}…`
                          : it.external_id}
                      </span>
                    )}
                  </span>
                </div>
                {it.error && (
                  <p className="text-[11px] leading-snug text-kwiq-err">
                    {it.error}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function RunStatusBadge({ status }: { status: RunStatus }) {
  const { label, cls } = runStatusStyle(status);
  return (
    <span
      className={
        "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest " +
        cls
      }
    >
      {label}
    </span>
  );
}

function runStatusStyle(status: RunStatus): { label: string; cls: string } {
  switch (status) {
    case "succeeded":
      return {
        label: "OK",
        cls: "border-kwiq-ok/40 bg-kwiq-ok/10 text-kwiq-ok",
      };
    case "partial":
      return {
        label: "Parcial",
        cls: "border-kwiq-warn/40 bg-kwiq-warn/10 text-kwiq-warn",
      };
    case "failed":
      return {
        label: "Falló",
        cls: "border-kwiq-err/40 bg-kwiq-err/10 text-kwiq-err",
      };
    case "running":
      return {
        label: "Corriendo",
        cls: "border-kwiq-accent/40 bg-kwiq-accent/10 text-kwiq-accent",
      };
    default:
      return {
        label: status,
        cls: "border-kwiq-border bg-kwiq-bg/40 text-kwiq-muted",
      };
  }
}

function StepStatusBadge({ status }: { status: StepResult["status"] }) {
  const cls =
    status === "ok"
      ? "border-kwiq-ok/40 bg-kwiq-ok/10 text-kwiq-ok"
      : status === "error"
        ? "border-kwiq-err/40 bg-kwiq-err/10 text-kwiq-err"
        : "border-kwiq-border bg-kwiq-bg/40 text-kwiq-muted";
  return (
    <span
      className={
        "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest " +
        cls
      }
    >
      {status}
    </span>
  );
}

function ItemActionBadge({ action }: { action: StepResultItem["action"] }) {
  const map: Record<StepResultItem["action"], { label: string; cls: string }> = {
    create: {
      label: "+ create",
      cls: "border-kwiq-accent/40 bg-kwiq-accent/10 text-kwiq-accent",
    },
    update: {
      label: "~ update",
      cls: "border-kwiq-warn/40 bg-kwiq-warn/10 text-kwiq-warn",
    },
    skip: {
      label: "= skip",
      cls: "border-kwiq-border bg-kwiq-bg/40 text-kwiq-muted",
    },
    error: {
      label: "× error",
      cls: "border-kwiq-err/40 bg-kwiq-err/10 text-kwiq-err",
    },
  };
  const s = map[action];
  return (
    <span
      className={
        "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest " +
        s.cls
      }
    >
      {s.label}
    </span>
  );
}

function TotalChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "accent" | "warn" | "muted";
}) {
  const cls =
    tone === "accent"
      ? "border-kwiq-accent/40 bg-kwiq-accent/10 text-kwiq-accent"
      : tone === "warn"
        ? "border-kwiq-warn/40 bg-kwiq-warn/10 text-kwiq-warn"
        : "border-kwiq-border bg-kwiq-bg/40 text-kwiq-muted";
  return (
    <div className={"rounded-lg border px-3 py-2 " + cls}>
      <div className="text-xs uppercase tracking-widest">{label}</div>
      <div className="mt-0.5 font-mono text-lg">{value}</div>
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}
