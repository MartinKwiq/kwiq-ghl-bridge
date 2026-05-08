"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Card del Sub-account PIT (GHL Location PIT) para el detalle de proyecto.
 *
 * Estado posible:
 *  - "no cargado" (rojo): el provisioner está bloqueado para este proyecto.
 *    Botón principal: "Cargar PIT".
 *  - "cargado" (verde): muestra cuándo se cargó / rotó. Botón secundario
 *    "Rotar PIT" para reemplazarlo, y "Revocar" para borrarlo.
 *
 * El PIT JAMÁS se renderiza en el front. Lo único que el componente sabe
 * son los timestamps de carga/rotación.
 */
export interface LocationPitState {
  loaded_at: string | null;
  rotated_at: string | null;
}

export function LocationPitCard({
  slug,
  initialState,
  ghlLocationId,
}: {
  slug: string;
  initialState: LocationPitState;
  ghlLocationId: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<LocationPitState>(initialState);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmRevokeOpen, setConfirmRevokeOpen] = useState(false);

  const isLoaded = !!state.loaded_at;
  const lastChange = state.rotated_at ?? state.loaded_at;
  const provisioningBlocked = !isLoaded;

  // Días desde última carga / rotación (para alerta de >90 días sin rotar).
  const daysSinceChange = lastChange
    ? Math.floor((Date.now() - new Date(lastChange).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const needsRotation = daysSinceChange !== null && daysSinceChange >= 90;

  async function revoke() {
    const res = await fetch(`/api/admin/proyectos/${slug}/location-pit`, {
      method: "DELETE",
    });
    if (res.ok) {
      setState({ loaded_at: null, rotated_at: state.rotated_at });
      setConfirmRevokeOpen(false);
      router.refresh();
    }
  }

  return (
    <section className="rounded-2xl border border-kwiq-border bg-kwiq-panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-kwiq-muted">
            GHL · Sub-account PIT
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold uppercase tracking-wide">
            Token de configuración de la sub-cuenta
          </h2>
        </div>

        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            isLoaded
              ? "border border-kwiq-ok/40 bg-kwiq-ok/10 text-kwiq-ok"
              : "border border-kwiq-err/40 bg-kwiq-err/10 text-kwiq-err",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              isLoaded ? "bg-kwiq-ok" : "bg-kwiq-err",
            )}
          />
          {isLoaded ? "Cargado" : "No cargado"}
        </span>
      </div>

      {!isLoaded && (
        <p className="mt-4 text-sm text-kwiq-muted">
          Para que Kwiq pueda configurar tags, custom fields, pipelines y
          calendarios dentro de la sub-cuenta de GHL, necesita un{" "}
          <strong className="text-kwiq-text">Private Integration Token</strong>{" "}
          generado <em>desde la sub-cuenta</em> (no el de la agencia).{" "}
          <strong className="text-kwiq-warn">
            Sin esto, el provisioner no puede correr.
          </strong>
        </p>
      )}

      {isLoaded && (
        <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border border-kwiq-border bg-kwiq-bg/40 px-3 py-2">
            <p className="text-xs uppercase tracking-widest text-kwiq-muted">
              Cargado el
            </p>
            <p className="mt-0.5 text-kwiq-text">
              {state.loaded_at &&
                new Date(state.loaded_at).toLocaleString("es-AR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
            </p>
          </div>
          <div className="rounded-lg border border-kwiq-border bg-kwiq-bg/40 px-3 py-2">
            <p className="text-xs uppercase tracking-widest text-kwiq-muted">
              Última rotación
            </p>
            <p className="mt-0.5 text-kwiq-text">
              {state.rotated_at
                ? new Date(state.rotated_at).toLocaleString("es-AR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })
                : "—"}
            </p>
          </div>
        </div>
      )}

      {needsRotation && (
        <div className="mt-4 rounded-lg border border-kwiq-warn/40 bg-kwiq-warn/10 px-3 py-2 text-sm text-kwiq-text">
          <strong>El PIT tiene {daysSinceChange} días sin rotar.</strong> Best
          practice de GHL: rotar cada 90 días. Apretá &quot;Rotar PIT&quot; y
          generá uno nuevo.
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          disabled={!ghlLocationId}
          className={cn(
            "inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium transition",
            !ghlLocationId
              ? "border border-kwiq-border bg-kwiq-bg/30 text-kwiq-muted cursor-not-allowed"
              : isLoaded
                ? "border border-kwiq-border bg-kwiq-bg/40 text-kwiq-text hover:bg-kwiq-bg/70"
                : "bg-kwiq-accent text-kwiq-bg hover:bg-kwiq-accentHover",
          )}
          title={!ghlLocationId ? "Creá la sub-cuenta GHL primero" : undefined}
        >
          {isLoaded ? "Rotar PIT" : "Cargar PIT"}
        </button>
        {isLoaded && (
          <button
            type="button"
            onClick={() => setConfirmRevokeOpen(true)}
            className="inline-flex items-center rounded-lg border border-kwiq-err/40 bg-kwiq-err/10 px-4 py-2 text-sm font-medium text-kwiq-err transition hover:bg-kwiq-err/20"
          >
            Revocar
          </button>
        )}
      </div>

      {provisioningBlocked && (
        <p className="mt-4 text-xs text-kwiq-muted">
          Una vez cargado, vas a poder correr el provisionador desde la sección
          de abajo.
        </p>
      )}

      {modalOpen && (
        <PitLoadModal
          slug={slug}
          isFirstLoad={!isLoaded}
          onClose={() => setModalOpen(false)}
          onSuccess={(now) => {
            setState((s) =>
              isLoaded
                ? { loaded_at: s.loaded_at, rotated_at: now }
                : { loaded_at: now, rotated_at: null },
            );
            setModalOpen(false);
            router.refresh();
          }}
        />
      )}

      {confirmRevokeOpen && (
        <ConfirmRevokeModal
          onConfirm={revoke}
          onCancel={() => setConfirmRevokeOpen(false)}
        />
      )}
    </section>
  );
}

// ─── Modal de carga / rotación ─────────────────────────────────────
function PitLoadModal({
  slug,
  isFirstLoad,
  onClose,
  onSuccess,
}: {
  slug: string;
  isFirstLoad: boolean;
  onClose: () => void;
  onSuccess: (now: string) => void;
}) {
  const [pit, setPit] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validated, setValidated] = useState<{
    location_name?: string;
  } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pit.trim()) {
      setError("Pegá el token primero.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/proyectos/${slug}/location-pit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pit: pit.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        location_name?: string;
        validated_at?: string;
        ghl_status?: number;
      };
      if (!res.ok) {
        setError(
          body.message ?? `No pudimos validar el PIT (HTTP ${res.status}).`,
        );
        setSubmitting(false);
        return;
      }
      setValidated({ location_name: body.location_name });
      // Pequeña pausa para que el usuario vea el "OK" antes de cerrar.
      setTimeout(() => {
        onSuccess(body.validated_at ?? new Date().toISOString());
      }, 800);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No pudimos conectar con el servidor.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10">
      <div className="w-full max-w-2xl rounded-2xl border border-kwiq-border bg-kwiq-panel p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-kwiq-muted">
              {isFirstLoad ? "Cargar PIT" : "Rotar PIT"}
            </p>
            <h3 className="mt-1 font-display text-2xl font-semibold uppercase tracking-wide">
              Sub-account PIT de GHL
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-kwiq-border bg-kwiq-bg/40 px-2 py-1 text-xs text-kwiq-muted hover:text-kwiq-text disabled:opacity-50"
          >
            Cerrar
          </button>
        </div>

        <ol className="mt-5 space-y-3 text-sm text-kwiq-text">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-kwiq-accent/50 bg-kwiq-accent/10 text-xs font-bold text-kwiq-accent">
              1
            </span>
            <span>
              Entrá a{" "}
              <a
                href="https://app.gohighlevel.com"
                target="_blank"
                rel="noreferrer"
                className="text-kwiq-accent underline hover:text-kwiq-accentHover"
              >
                app.gohighlevel.com
              </a>{" "}
              con las credenciales del admin de la sub-cuenta. Asegurate de estar
              <strong className="text-kwiq-text"> dentro de la sub-cuenta</strong>{" "}
              (no en el panel de agencia).
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-kwiq-accent/50 bg-kwiq-accent/10 text-xs font-bold text-kwiq-accent">
              2
            </span>
            <span>
              Andá a <strong>Settings → Private Integrations</strong>. Si no
              aparece esa opción, activala primero en{" "}
              <strong>Labs</strong>.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-kwiq-accent/50 bg-kwiq-accent/10 text-xs font-bold text-kwiq-accent">
              3
            </span>
            <span>
              Apretá <strong>Create new Integration</strong>, ponele un nombre
              identificable (ej. &quot;Kwiq Provisioner&quot;) y marcá los
              scopes necesarios — lo más simple es marcar todos.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-kwiq-accent/50 bg-kwiq-accent/10 text-xs font-bold text-kwiq-accent">
              4
            </span>
            <span>
              Save → copiá el token que aparece (lo único que vas a ver una vez
              — copialo bien) y pegalo abajo.
            </span>
          </li>
        </ol>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-widest text-kwiq-muted">
              Token (PIT)
            </span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={pit}
              onChange={(e) => setPit(e.target.value)}
              disabled={submitting || !!validated}
              placeholder="pit-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="rounded-lg border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 font-mono text-sm outline-none focus:border-kwiq-accent disabled:opacity-60"
            />
            <span className="text-xs text-kwiq-muted">
              El token se cifra antes de guardarse y nunca se muestra de nuevo.
            </span>
          </label>

          {error && (
            <div className="rounded-md border border-kwiq-err/40 bg-kwiq-err/10 px-3 py-2 text-sm text-kwiq-err">
              {error}
            </div>
          )}

          {validated && (
            <div className="rounded-md border border-kwiq-ok/40 bg-kwiq-ok/10 px-3 py-2 text-sm text-kwiq-ok">
              ✓ PIT validado contra GHL{validated.location_name ? ` — sub-cuenta: ${validated.location_name}` : ""}.
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-kwiq-border bg-kwiq-bg/40 px-4 py-2 text-sm text-kwiq-text hover:bg-kwiq-bg/70 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !pit.trim() || !!validated}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium transition",
                submitting || !pit.trim() || !!validated
                  ? "bg-kwiq-border text-kwiq-muted"
                  : "bg-kwiq-accent text-kwiq-bg hover:bg-kwiq-accentHover",
              )}
            >
              {submitting
                ? "Validando con GHL…"
                : validated
                  ? "Listo"
                  : "Validar y guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal confirmación de revocación ──────────────────────────────
function ConfirmRevokeModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-kwiq-border bg-kwiq-panel p-6">
        <h3 className="font-display text-xl font-semibold uppercase tracking-wide">
          ¿Revocar el PIT?
        </h3>
        <p className="mt-3 text-sm text-kwiq-muted">
          Después de esto, Kwiq no va a poder configurar nada más en la
          sub-cuenta hasta que cargues un PIT nuevo. Recordá borrar también la
          integración desde el panel de GHL para que el token quede totalmente
          invalidado.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg border border-kwiq-border bg-kwiq-bg/40 px-4 py-2 text-sm text-kwiq-text hover:bg-kwiq-bg/70 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={async () => {
              setSubmitting(true);
              await onConfirm();
            }}
            disabled={submitting}
            className="rounded-lg border border-kwiq-err/40 bg-kwiq-err/10 px-4 py-2 text-sm font-medium text-kwiq-err hover:bg-kwiq-err/20 disabled:opacity-50"
          >
            {submitting ? "Revocando…" : "Sí, revocar"}
          </button>
        </div>
      </div>
    </div>
  );
}
