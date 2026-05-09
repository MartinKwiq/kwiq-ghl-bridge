"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Panel "Inventario en GHL" — diagnóstico read-only.
 *
 * Muestra qué hay actualmente cargado en la sub-cuenta GHL: tags,
 * custom values, custom fields, pipelines, calendarios y users.
 * Útil para entender qué pre-pobló el snapshot vs qué es nuestro.
 *
 * Botón "Sincronizar" → hace GET al endpoint /inventory y refresca el
 * panel con los datos de GHL.
 */

interface InventoryEntry {
  id: string;
  name?: string;
  key?: string;
  fieldKey?: string;
  dataType?: string;
  model?: string;
  value?: string | null;
  stages?: Array<{ id: string; name: string; position?: number }>;
  email?: string;
}

interface InventorySection {
  count: number;
  items: InventoryEntry[];
  fetched: boolean;
  error?: string;
}

interface InventoryReport {
  location_id: string;
  fetched_at: string;
  duration_ms: number;
  tags: InventorySection;
  custom_values: InventorySection;
  custom_fields: InventorySection;
  pipelines: InventorySection;
  calendars: InventorySection;
  users: InventorySection;
}

export function InventoryPanel({
  slug,
  locationReady,
  pitLoaded,
  cachedReport,
  cachedFetchedAt,
}: {
  slug: string;
  locationReady: boolean;
  pitLoaded: boolean;
  /** Inventario cacheado en DB (last_inventory_jsonb). Hidrata el estado al abrir la página. */
  cachedReport?: InventoryReport | null;
  cachedFetchedAt?: string | null;
}) {
  const [report, setReport] = useState<InventoryReport | null>(
    cachedReport ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    cachedReport
      ? {
          tags: cachedReport.tags.count > 0,
          custom_values: cachedReport.custom_values.count > 0,
          custom_fields: cachedReport.custom_fields.count > 0,
          pipelines: cachedReport.pipelines.count > 0,
          calendars: cachedReport.calendars.count > 0,
          users: cachedReport.users.count > 0,
        }
      : {},
  );

  const canSync = locationReady && pitLoaded;

  async function sync() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/proyectos/${slug}/inventory`, {
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as
        | InventoryReport
        | { error?: string; message?: string };
      if (!res.ok) {
        const errBody = body as { error?: string; message?: string };
        setError(
          errBody.message ??
            errBody.error ??
            `No pudimos llegar a GHL (HTTP ${res.status}).`,
        );
        return;
      }
      setReport(body as InventoryReport);
      // Abrir secciones que tengan algo, así no hay que clickear todas.
      const r = body as InventoryReport;
      setOpenSections({
        tags: r.tags.count > 0,
        custom_values: r.custom_values.count > 0,
        custom_fields: r.custom_fields.count > 0,
        pipelines: r.pipelines.count > 0,
        calendars: r.calendars.count > 0,
        users: r.users.count > 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-kwiq-border bg-kwiq-panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-kwiq-muted">
            GHL · Inventario actual
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold uppercase tracking-wide">
            Qué hay creado en la sub-cuenta
          </h2>
          <p className="mt-2 text-sm text-kwiq-muted">
            Lectura directa de GHL. Sirve para ver qué trajo el snapshot y qué
            falta crear desde Kwiq.
          </p>
        </div>
        <button
          type="button"
          onClick={sync}
          disabled={!canSync || loading}
          className={cn(
            "inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium transition",
            !canSync
              ? "border border-kwiq-border bg-kwiq-bg/30 text-kwiq-muted cursor-not-allowed"
              : loading
                ? "border border-kwiq-border bg-kwiq-bg/40 text-kwiq-muted"
                : "bg-kwiq-accent text-kwiq-bg hover:bg-kwiq-accentHover",
          )}
          title={
            !locationReady
              ? "Falta crear la sub-cuenta GHL"
              : !pitLoaded
                ? "Falta cargar el Sub-account PIT"
                : undefined
          }
        >
          {loading ? "Consultando GHL…" : report ? "Sincronizar" : "Cargar inventario"}
        </button>
      </div>

      {!canSync && (
        <p className="mt-4 rounded-lg border border-kwiq-warn/40 bg-kwiq-warn/10 px-3 py-2 text-sm text-kwiq-text">
          {!locationReady
            ? "Creá la sub-cuenta GHL primero."
            : "Cargá el Sub-account PIT en la card de arriba para poder consultar GHL."}
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-kwiq-err/40 bg-kwiq-err/10 px-3 py-2 text-sm text-kwiq-err">
          {error}
        </div>
      )}

      {report && (
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-kwiq-muted">
            <span>
              Sincronizado{" "}
              {new Date(report.fetched_at).toLocaleString("es-AR", {
                dateStyle: "short",
                timeStyle: "medium",
              })}
            </span>
            <span>·</span>
            <span>{report.duration_ms} ms</span>
            {cachedReport &&
              cachedFetchedAt &&
              report.fetched_at === cachedReport.fetched_at && (
                <span className="rounded-full border border-kwiq-border bg-kwiq-bg/40 px-2 py-0.5 text-[10px] uppercase tracking-widest">
                  caché
                </span>
              )}
          </div>

          <Section
            label="Tags"
            kind="tags"
            section={report.tags}
            open={openSections.tags ?? false}
            onToggle={() =>
              setOpenSections((s) => ({ ...s, tags: !s.tags }))
            }
            renderItem={(item) => (
              <span className="text-kwiq-text">{item.name ?? item.id}</span>
            )}
          />

          <Section
            label="Custom Values (variables del agente IA)"
            kind="custom_values"
            section={report.custom_values}
            open={openSections.custom_values ?? false}
            onToggle={() =>
              setOpenSections((s) => ({
                ...s,
                custom_values: !s.custom_values,
              }))
            }
            renderItem={(item) => (
              <div className="flex flex-wrap items-baseline gap-2">
                <code className="rounded bg-kwiq-bg/60 px-1.5 py-0.5 font-mono text-xs text-kwiq-text">
                  {item.key ?? item.name}
                </code>
                <span className="text-kwiq-text">{item.name}</span>
                {item.value && (
                  <span className="text-kwiq-muted">
                    = &quot;{truncate(item.value, 60)}&quot;
                  </span>
                )}
                {!item.value && (
                  <span className="text-xs italic text-kwiq-warn">vacío</span>
                )}
              </div>
            )}
          />

          <Section
            label="Custom Fields (campos de pacientes/oportunidades)"
            kind="custom_fields"
            section={report.custom_fields}
            open={openSections.custom_fields ?? false}
            onToggle={() =>
              setOpenSections((s) => ({
                ...s,
                custom_fields: !s.custom_fields,
              }))
            }
            renderItem={(item) => (
              <div className="flex flex-wrap items-baseline gap-2">
                <code className="rounded bg-kwiq-bg/60 px-1.5 py-0.5 font-mono text-xs text-kwiq-text">
                  {item.fieldKey ?? item.id.slice(0, 8)}
                </code>
                <span className="text-kwiq-text">{item.name}</span>
                <span className="text-xs text-kwiq-muted">
                  {item.model ?? "?"} · {item.dataType ?? "?"}
                </span>
              </div>
            )}
          />

          <Section
            label="Pipelines (embudos de venta)"
            kind="pipelines"
            section={report.pipelines}
            open={openSections.pipelines ?? false}
            onToggle={() =>
              setOpenSections((s) => ({ ...s, pipelines: !s.pipelines }))
            }
            renderItem={(item) => (
              <div className="flex flex-col gap-1">
                <span className="text-kwiq-text">{item.name}</span>
                {item.stages && item.stages.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.stages.map((s) => (
                      <span
                        key={s.id}
                        className="rounded-full border border-kwiq-border bg-kwiq-bg/40 px-2 py-0.5 text-[11px] text-kwiq-muted"
                      >
                        {s.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          />

          <Section
            label="Calendarios"
            kind="calendars"
            section={report.calendars}
            open={openSections.calendars ?? false}
            onToggle={() =>
              setOpenSections((s) => ({ ...s, calendars: !s.calendars }))
            }
            renderItem={(item) => (
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-kwiq-text">{item.name}</span>
                {item.key && (
                  <code className="rounded bg-kwiq-bg/60 px-1.5 py-0.5 font-mono text-xs text-kwiq-muted">
                    /{item.key}
                  </code>
                )}
              </div>
            )}
          />

          <Section
            label="Users (equipo dentro de la sub-cuenta)"
            kind="users"
            section={report.users}
            open={openSections.users ?? false}
            onToggle={() =>
              setOpenSections((s) => ({ ...s, users: !s.users }))
            }
            renderItem={(item) => (
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-kwiq-text">{item.name ?? "—"}</span>
                {item.email && (
                  <span className="text-kwiq-muted">· {item.email}</span>
                )}
                <code className="rounded bg-kwiq-bg/60 px-1.5 py-0.5 font-mono text-[11px] text-kwiq-muted">
                  {item.id}
                </code>
              </div>
            )}
          />
        </div>
      )}
    </section>
  );
}

function Section({
  label,
  kind,
  section,
  open,
  onToggle,
  renderItem,
}: {
  label: string;
  kind: string;
  section: InventorySection;
  open: boolean;
  onToggle: () => void;
  renderItem: (item: InventoryEntry) => React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-kwiq-border bg-kwiq-bg/30">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-kwiq-bg/40"
      >
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded transition",
              section.fetched ? "text-kwiq-muted" : "text-kwiq-err",
            )}
          >
            {open ? "▾" : "▸"}
          </span>
          <span className="font-medium text-kwiq-text">{label}</span>
        </span>
        <span className="flex items-center gap-2 text-xs">
          {section.fetched ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5",
                section.count === 0
                  ? "border border-kwiq-border bg-kwiq-bg/40 text-kwiq-muted"
                  : "border border-kwiq-accent/40 bg-kwiq-accent/10 text-kwiq-accent",
              )}
            >
              {section.count} {section.count === 1 ? "item" : "items"}
            </span>
          ) : (
            <span className="rounded-full border border-kwiq-err/40 bg-kwiq-err/10 px-2 py-0.5 text-kwiq-err">
              error
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="border-t border-kwiq-border px-4 py-3">
          {!section.fetched && (
            <p className="text-sm text-kwiq-err">
              {section.error ?? "No pudimos consultar este recurso."}
            </p>
          )}
          {section.fetched && section.items.length === 0 && (
            <p className="text-sm italic text-kwiq-muted">
              Vacío — no hay {kind} cargados en la sub-cuenta.
            </p>
          )}
          {section.fetched && section.items.length > 0 && (
            <ul className="flex flex-col gap-1.5 text-sm">
              {section.items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-md bg-kwiq-bg/40 px-2.5 py-1.5"
                >
                  {renderItem(item)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
