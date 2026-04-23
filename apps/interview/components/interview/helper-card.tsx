"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { HelperDef } from "@/lib/interview-helpers";

/**
 * Popover de ayuda contextual para una pregunta de la entrevista.
 *
 * Se muestra cuando:
 *   a) El usuario toca el botón "❓ Cómo obtengo esto" al lado del input.
 *   b) El usuario escribe algo como "no sé" o "cómo hago" y la detección
 *      client-side dispara el helper automáticamente.
 *
 * UX:
 *   - Aparece arriba del textarea, pegado al borde superior del input bar.
 *   - Se cierra con Esc, tocando afuera, o con el botón X.
 *   - Tiene foco automático para que Esc funcione sin clickear primero.
 */
export function HelperCard({
  helper,
  onClose,
}: {
  helper: HelperDef;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Esc para cerrar + click afuera.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    // Un tick de delay para que el click que abrió el card no lo cierre de inmediato.
    const t = setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
      document.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  // Focus para accesibilidad.
  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-label={helper.title}
      className={cn(
        "mx-auto max-w-3xl rounded-xl border border-kwiq-accent/40 bg-kwiq-panel/95 p-4",
        "shadow-lg shadow-black/30 outline-none animate-fade-in",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="flex h-6 w-6 items-center justify-center rounded-full bg-kwiq-accent/15 text-kwiq-accent text-sm"
          >
            ?
          </span>
          <h3 className="font-display text-sm font-medium uppercase tracking-wide text-kwiq-text">
            {helper.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar ayuda"
          className="shrink-0 rounded-md border border-kwiq-border px-2 py-0.5 text-xs text-kwiq-muted hover:text-kwiq-text"
        >
          Cerrar
        </button>
      </div>

      <ol className="mt-3 flex flex-col gap-1.5 pl-0.5 text-sm leading-relaxed text-kwiq-text">
        {helper.steps.map((step, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-kwiq-border bg-kwiq-bg/60 text-[11px] text-kwiq-muted">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      {helper.example && (
        <div className="mt-3 rounded-md border border-kwiq-border bg-kwiq-bg/40 px-3 py-2 text-xs text-kwiq-muted">
          <span className="text-kwiq-muted/80">Ejemplo: </span>
          <code className="break-all text-kwiq-text/90">{helper.example}</code>
        </div>
      )}

      {helper.screenshot && (
        <img
          src={helper.screenshot}
          alt={helper.title}
          className="mt-3 w-full rounded-md border border-kwiq-border"
          loading="lazy"
        />
      )}

      {helper.fallback && (
        <p className="mt-3 text-xs italic text-kwiq-muted">{helper.fallback}</p>
      )}
    </div>
  );
}

/**
 * Botón que abre/cierra el helper. Se renderiza al lado del input cuando
 * la pregunta actual tiene un helper configurado.
 */
export function HelperToggleButton({
  open,
  onClick,
  disabled,
}: {
  open: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={open}
      aria-label="Cómo obtengo esto"
      title="Cómo obtengo esto"
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition",
        disabled && "cursor-not-allowed opacity-40",
        !disabled && (open
          ? "border-kwiq-accent bg-kwiq-accent/10 text-kwiq-accent"
          : "border-kwiq-border bg-kwiq-bg/40 text-kwiq-muted hover:border-kwiq-accent hover:text-kwiq-accent"),
      )}
    >
      <span aria-hidden>?</span>
      <span className="hidden sm:inline">Cómo obtengo esto</span>
    </button>
  );
}
