"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type SettingRow = {
  key: string;
  is_secret: boolean;
  description: string | null;
  updated_at: string;
  present: boolean;
  preview: string | null;
};

/**
 * Editor de filas de kwiq_settings.
 *
 * Cada fila muestra:
 *   - descripción (label humanizado) + hint (key interna en mono).
 *   - valor actual (enmascarado si secret, en claro si no).
 *   - botón "Editar" que revela un input para tipear el nuevo valor.
 *   - botón "Limpiar" para dejar la clave sin valor.
 *
 * El valor nuevo nunca vuelve al cliente después de guardarse — el server
 * devuelve el resumen (present + preview).
 */
export function SettingsEditor({ rows }: { rows: SettingRow[] }) {
  return (
    <ul className="divide-y divide-kwiq-border rounded-xl border border-kwiq-border bg-kwiq-panel/40">
      {rows.map((row) => (
        <SettingItem key={row.key} initial={row} />
      ))}
    </ul>
  );
}

function SettingItem({ initial }: { initial: SettingRow }) {
  const [row, setRow] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const humanLabel = keyLabel(row.key);

  async function save(newValue: string | null) {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/ajustes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: row.key, value: newValue }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        row?: SettingRow;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !body.ok || !body.row) {
        setErr(body.detail || body.error || "No pudimos guardar.");
        return;
      }
      setRow(body.row);
      setEditing(false);
      setValue("");
    } catch {
      setErr("Error de red.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-kwiq-text">
            {humanLabel}
            {row.is_secret && (
              <span className="ml-2 rounded-full border border-kwiq-border bg-kwiq-bg/40 px-2 py-0.5 text-[10px] uppercase tracking-widest text-kwiq-muted">
                secreto
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-kwiq-muted">
            {row.key}
          </div>
          {row.description && (
            <p className="mt-1 text-xs text-kwiq-muted">{row.description}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          {row.present ? (
            <code className="rounded-md border border-kwiq-border bg-kwiq-bg/40 px-2 py-1 font-mono text-xs text-kwiq-text">
              {row.preview}
            </code>
          ) : (
            <span className="text-xs text-kwiq-warn">— sin valor —</span>
          )}
          <span className="text-[10px] text-kwiq-muted">
            {new Date(row.updated_at).toLocaleString("es-AR")}
          </span>
        </div>
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <input
            type={row.is_secret ? "password" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={row.is_secret ? "Pegá el nuevo secreto" : "Nuevo valor"}
            autoComplete="off"
            className="rounded-lg border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 font-mono text-sm outline-none focus:border-kwiq-accent"
          />
          {err && (
            <div className="rounded-md border border-kwiq-err/40 bg-kwiq-err/10 px-2 py-1 text-xs text-kwiq-err">
              {err}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => save(value)}
              disabled={loading || value.trim().length === 0}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                loading || value.trim().length === 0
                  ? "bg-kwiq-border text-kwiq-muted"
                  : "bg-kwiq-accent text-kwiq-bg hover:bg-kwiq-accentHover",
              )}
            >
              {loading ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setValue("");
                setErr(null);
              }}
              className="rounded-lg border border-kwiq-border px-3 py-1.5 text-xs text-kwiq-muted hover:text-kwiq-text"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-kwiq-border px-3 py-1 text-xs text-kwiq-muted hover:text-kwiq-text"
          >
            {row.present ? "Cambiar" : "Agregar"}
          </button>
          {row.present && (
            <button
              type="button"
              onClick={() => save(null)}
              disabled={loading}
              className="rounded-lg border border-kwiq-warn/40 px-3 py-1 text-xs text-kwiq-warn hover:bg-kwiq-warn/10"
            >
              Limpiar
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function keyLabel(key: string): string {
  const known: Record<string, string> = {
    "ghl.agency_pit": "PIT de agencia Kwiq",
    "ghl.agency_company_id": "Company ID de agencia",
    "ghl.marketplace.client_id": "Marketplace · Client ID",
    "ghl.marketplace.client_secret": "Marketplace · Client Secret",
    "ghl.marketplace.redirect_uri": "Marketplace · Redirect URI",
    "llm.provider": "Proveedor de LLM",
    "llm.model": "Modelo de LLM",
    "llm.gemini_api_key": "Gemini · API key",
    "app.public_url": "URL pública de la app",
  };
  return known[key] ?? key;
}
