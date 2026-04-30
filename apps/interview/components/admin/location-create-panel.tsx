"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Panel de estado de la sub-cuenta GHL para un proyecto Kwiq.
 *
 * Tres estados posibles:
 *   1. **Creada**: muestra el location_id, fecha de creación, y un link
 *      directo al dashboard de la sub-cuenta en HighLevel.
 *   2. **Pendiente con datos completos**: muestra un banner + botón
 *      "Crear sub-cuenta ahora" que dispara POST /api/admin/proyectos/
 *      [slug]/create-location y refresca la página al éxito.
 *   3. **Pendiente con datos incompletos**: muestra qué falta y un link
 *      al form de edición (cuando lo agreguemos).
 *
 * Si la creación falla con `ghl_error` (típicamente 401/403 por scopes),
 * mostramos un mensaje accionable con link a /admin/ajustes para regenerar
 * el PIT.
 */
export interface LocationCreatePanelProps {
  slug: string;
  locationId: string | null;
  locationCreatedAt: string | null;
  businessName: string | null;
  businessCountry: string | null;
  businessTimezone: string | null;
  businessPhone: string | null;
  adminFirstName: string | null;
  adminLastName: string | null;
  contactEmail: string | null;
  snapshotId: string | null;
}

export function LocationCreatePanel(props: LocationCreatePanelProps) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | null
    | {
        kind: "ok";
        message: string;
      }
    | {
        kind: "err";
        title: string;
        message: string;
        helpLink?: { href: string; label: string };
      }
  >(null);

  // Caso 1: ya está creada.
  if (props.locationId) {
    const ghlLink = `https://app.gohighlevel.com/v2/location/${props.locationId}/dashboard`;
    return (
      <section className="rounded-2xl border border-kwiq-ok/40 bg-kwiq-ok/5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold uppercase tracking-wide">
              Sub-cuenta GHL creada ✓
            </h2>
            <p className="mt-1 text-sm text-kwiq-muted">
              {props.locationCreatedAt
                ? `Creada el ${new Date(props.locationCreatedAt).toLocaleString("es-AR")}.`
                : "Vinculada manualmente (sin timestamp de creación)."}
            </p>
            <code className="mt-3 inline-block break-all rounded-lg border border-kwiq-border bg-kwiq-bg/60 px-3 py-1.5 font-mono text-xs">
              {props.locationId}
            </code>
          </div>
          <a
            href={ghlLink}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-kwiq-border px-3 py-2 text-sm text-kwiq-text transition hover:border-kwiq-accent hover:text-kwiq-accent"
          >
            Abrir en HighLevel →
          </a>
        </div>
      </section>
    );
  }

  // Caso 2 / 3: NO está creada — chequeamos si los datos del form alcanzan.
  const missing = collectMissingFields(props);
  const canCreateNow = missing.length === 0;

  async function createNow() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(
        `/api/admin/proyectos/${encodeURIComponent(props.slug)}/create-location`,
        { method: "POST" },
      );
      const body = (await res.json().catch(() => ({}))) as {
        status?: string;
        location_id?: string;
        message?: string;
        missing?: string[];
        ghl_status?: number;
      };

      if (
        res.ok &&
        (body.status === "created" || body.status === "already_exists")
      ) {
        setResult({
          kind: "ok",
          message:
            body.status === "already_exists"
              ? "La sub-cuenta ya existía — recargá para ver los detalles."
              : `Sub-cuenta creada. ID: ${body.location_id}. Recargando…`,
        });
        // Refresh para que la página vuelva a leer kwiq_projects con el
        // location_id recién persistido.
        setTimeout(() => window.location.reload(), 1200);
        return;
      }

      // Error → mostramos mensaje accionable.
      if (body.status === "missing_data") {
        setResult({
          kind: "err",
          title: "Faltan datos en el proyecto",
          message: `Para crear la sub-cuenta faltan: ${(body.missing ?? []).join(", ")}. Editá el proyecto para completarlos.`,
        });
      } else if (body.status === "ghl_error") {
        const isAuth =
          body.ghl_status === 401 ||
          body.ghl_status === 403 ||
          /scope|permission|unauthorized|forbidden/i.test(body.message ?? "");
        const isValidation = body.ghl_status === 422;
        setResult({
          kind: "err",
          title: isAuth
            ? "GHL rechazó la operación (auth)"
            : isValidation
              ? "GHL rechazó los datos (validación)"
              : "Error al hablar con GHL",
          message:
            (body.message ?? "Error desconocido") +
            (isAuth
              ? "\n\nPosible causa: el Agency PIT no tiene scope locations.write. Regeneralo con los scopes correctos en /admin/ajustes."
              : isValidation
                ? "\n\nGHL no aceptó algún campo del body. Si el mensaje no es claro, mandámelo y lo arreglamos."
                : ""),
          helpLink: isAuth
            ? { href: "/admin/ajustes", label: "Ir a Ajustes" }
            : undefined,
        });
      } else if (body.status === "config_error") {
        setResult({
          kind: "err",
          title: "Faltan ajustes globales",
          message: body.message ?? "Cargá el PIT y companyId en /admin/ajustes.",
          helpLink: { href: "/admin/ajustes", label: "Ir a Ajustes" },
        });
      } else {
        setResult({
          kind: "err",
          title: "No pudimos crear la sub-cuenta",
          message:
            body.message ?? `HTTP ${res.status}. Probá otra vez en unos segundos.`,
        });
      }
    } catch (err) {
      setResult({
        kind: "err",
        title: "Red caída",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-kwiq-warn/40 bg-kwiq-warn/5 p-6">
      <h2 className="font-display text-lg font-semibold uppercase tracking-wide">
        Sub-cuenta GHL pendiente
      </h2>
      <p className="mt-1 text-sm text-kwiq-muted">
        Este proyecto todavía no tiene una sub-cuenta creada en HighLevel. Sin
        ella, el provisioner no puede aplicar custom values, calendarios ni el
        agente de IA.
      </p>

      {!canCreateNow ? (
        <div className="mt-4 rounded-lg border border-kwiq-border bg-kwiq-bg/40 p-4 text-sm">
          <p className="text-kwiq-text">
            Faltan campos en el proyecto para crear la sub-cuenta:
          </p>
          <ul className="mt-2 list-inside list-disc text-kwiq-muted">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-kwiq-muted/80">
            Por ahora estos datos solo se cargan al crear el proyecto (
            <code className="text-kwiq-text">/admin/proyectos/nuevo</code>). Si
            ya creaste el proyecto pero faltan datos, se pueden completar
            manualmente en la base de datos o reenviando el form.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={createNow}
            disabled={busy}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition",
              busy
                ? "bg-kwiq-border text-kwiq-muted"
                : "bg-kwiq-accent text-kwiq-bg hover:bg-kwiq-accentHover",
            )}
          >
            {busy ? "Creando…" : "Crear sub-cuenta ahora"}
          </button>
          {props.snapshotId && (
            <span className="text-xs text-kwiq-muted">
              Se aplicará el snapshot{" "}
              <code className="text-kwiq-text">{props.snapshotId}</code>.
            </span>
          )}
        </div>
      )}

      {result && (
        <div
          className={cn(
            "mt-4 rounded-lg border px-3 py-3 text-sm",
            result.kind === "ok"
              ? "border-kwiq-ok/40 bg-kwiq-ok/10 text-kwiq-text"
              : "border-kwiq-err/40 bg-kwiq-err/10 text-kwiq-text",
          )}
        >
          {result.kind === "ok" ? (
            <p>{result.message}</p>
          ) : (
            <>
              <p className="font-medium">{result.title}</p>
              <p className="mt-1 whitespace-pre-line text-kwiq-muted">
                {result.message}
              </p>
              {result.helpLink && (
                <a
                  href={result.helpLink.href}
                  className="mt-2 inline-block text-kwiq-accent hover:underline"
                >
                  {result.helpLink.label} →
                </a>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Lista de campos del proyecto que faltan para que `createLocationForProject`
 * pueda llamar a GHL. Mismo set de chequeos que el del lib server-side, pero
 * para mostrarle al admin qué tiene que completar antes de poder usar el botón.
 */
function collectMissingFields(p: LocationCreatePanelProps): string[] {
  const missing: string[] = [];
  if (!p.businessName?.trim()) missing.push("nombre del negocio");
  if (!p.businessCountry?.trim()) missing.push("país");
  if (!p.businessTimezone?.trim()) missing.push("timezone");
  if (!p.businessPhone?.trim()) missing.push("teléfono del negocio");
  if (!p.contactEmail?.trim()) missing.push("email del admin");
  if (!p.adminFirstName?.trim()) missing.push("nombre del admin");
  if (!p.adminLastName?.trim()) missing.push("apellido del admin");
  return missing;
}
