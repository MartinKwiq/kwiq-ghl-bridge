import Link from "next/link";
import { revalidatePath } from "next/cache";
import {
  getAgencyContext,
  fetchAgencySnapshots,
  fetchAgencyLocations,
  describeAgencyError,
  agencyErrorHint,
  type AgencySnapshot,
  type AgencyLocation,
  type AgencyResource,
  type AgencyResult,
} from "@/lib/ghl/agency-client";

export const dynamic = "force-dynamic";

/**
 * /admin/snapshots — auto-discovery de la agencia Kwiq en HighLevel.
 *
 * La página muestra dos bloques:
 *   1. Snapshots disponibles — plantillas que el provisioner puede aplicar
 *      a nuevas sub-cuentas.
 *   2. Locations (sub-cuentas) — todas las cuentas bajo la agencia Kwiq,
 *      con su id (que se pega en `kwiq_projects.ghl_location_id`).
 *
 * Si el admin todavía no cargó el Agency PIT o el company id, mostramos un
 * empty state con link a /admin/ajustes. Nunca se exponen los secretos.
 */
export default async function SnapshotsPage() {
  const ctxRes = await getAgencyContext();

  if (!ctxRes.ok) {
    return (
      <div className="flex flex-col gap-6">
        <Header />
        <NotConfigured missing={ctxRes.missing} />
      </div>
    );
  }

  const [snapsRes, locsRes] = await Promise.all([
    fetchAgencySnapshots(ctxRes.ctx),
    fetchAgencyLocations(ctxRes.ctx, { limit: 100 }),
  ]);

  async function refresh() {
    "use server";
    revalidatePath("/admin/snapshots");
  }

  return (
    <div className="flex flex-col gap-8">
      <Header refresh={refresh} />

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-kwiq-muted">
            Snapshots
          </h2>
          {snapsRes.ok && (
            <span className="text-xs text-kwiq-muted">
              {snapsRes.data.length} encontrados
            </span>
          )}
        </div>
        {snapsRes.ok ? (
          <SnapshotsList items={snapsRes.data} />
        ) : (
          <ErrorBox result={snapsRes} resource="snapshots" />
        )}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-kwiq-muted">
            Locations (sub-cuentas)
          </h2>
          {locsRes.ok && (
            <span className="text-xs text-kwiq-muted">
              {locsRes.data.length} encontradas
            </span>
          )}
        </div>
        {locsRes.ok ? (
          <LocationsList items={locsRes.data} />
        ) : (
          <ErrorBox result={locsRes} resource="locations" />
        )}
      </section>

      <div className="text-xs text-kwiq-muted">
        <Link href="/admin" className="hover:text-kwiq-text">
          ← Volver al dashboard
        </Link>
      </div>
    </div>
  );
}

function Header({ refresh }: { refresh?: () => Promise<void> }) {
  return (
    <section className="flex items-end justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-kwiq-muted">
          Admin · agencia
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold uppercase tracking-wide">
          Snapshots y locations
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-kwiq-muted">
          Lo que vive hoy en tu cuenta de agencia. Esta pantalla se consulta en
          vivo con el PIT de agencia — no guardamos nada.
        </p>
      </div>
      {refresh && (
        <form action={refresh}>
          <button
            type="submit"
            className="rounded-lg border border-kwiq-border px-3 py-1.5 text-xs hover:bg-kwiq-bg/40"
          >
            Refrescar
          </button>
        </form>
      )}
    </section>
  );
}

function NotConfigured({ missing }: { missing: string[] }) {
  return (
    <div className="rounded-xl border border-kwiq-warn/40 bg-kwiq-warn/10 p-6 text-sm">
      <p className="font-medium text-kwiq-text">
        Faltan ajustes para consultar la agencia.
      </p>
      <p className="mt-2 text-kwiq-muted">
        Para ver snapshots y locations necesitás cargar{" "}
        <code className="font-mono text-kwiq-text">{missing.join(", ")}</code>{" "}
        en{" "}
        <Link
          href="/admin/ajustes"
          className="text-kwiq-accent hover:underline"
        >
          /admin/ajustes
        </Link>
        . El PIT de agencia se saca del panel de HighLevel &gt; Settings &gt;
        Private Integrations.
      </p>
    </div>
  );
}

function SnapshotsList({ items }: { items: AgencySnapshot[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-kwiq-border bg-kwiq-panel/40 p-6 text-sm text-kwiq-muted">
        No se encontraron snapshots en esta agencia. Creá uno desde HighLevel o
        compartí uno del Marketplace.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-kwiq-border rounded-xl border border-kwiq-border bg-kwiq-panel/40">
      {items.map((s) => (
        <li key={s.id} className="flex items-center justify-between px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-kwiq-text">
              {s.name || "— sin nombre —"}
            </p>
            <p className="mt-0.5 text-xs text-kwiq-muted">
              <code className="font-mono">{s.id}</code>
              {s.type ? ` · ${s.type}` : ""}
            </p>
          </div>
          <CopyHint value={s.id} />
        </li>
      ))}
    </ul>
  );
}

function LocationsList({ items }: { items: AgencyLocation[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-kwiq-border bg-kwiq-panel/40 p-6 text-sm text-kwiq-muted">
        Todavía no hay sub-cuentas. Cuando el provisioner cree una, va a
        aparecer acá.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-kwiq-border rounded-xl border border-kwiq-border bg-kwiq-panel/40">
      {items.map((l) => (
        <li
          key={l.id}
          className="flex items-start justify-between gap-4 px-4 py-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-kwiq-text">
              {l.name || "— sin nombre —"}
            </p>
            <p className="mt-0.5 text-xs text-kwiq-muted">
              <code className="font-mono">{l.id}</code>
              {l.email ? ` · ${l.email}` : ""}
              {l.phone ? ` · ${l.phone}` : ""}
            </p>
            {(l.city || l.country || l.timezone) && (
              <p className="mt-0.5 text-xs text-kwiq-muted">
                {[l.city, l.country, l.timezone].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <CopyHint value={l.id} />
        </li>
      ))}
    </ul>
  );
}

function CopyHint({ value }: { value: string }) {
  return (
    <span
      title={value}
      className="shrink-0 rounded-md border border-kwiq-border bg-kwiq-bg/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-kwiq-muted"
    >
      id
    </span>
  );
}

function ErrorBox({
  result,
  resource,
}: {
  result: Exclude<AgencyResult<unknown>, { ok: true }>;
  resource: AgencyResource;
}) {
  const message = describeAgencyError(result);
  const hint = agencyErrorHint(result, resource);
  return (
    <div className="rounded-xl border border-kwiq-err/40 bg-kwiq-err/10 p-4 text-sm text-kwiq-text">
      <p className="font-medium">No pude traer los datos.</p>
      <p className="mt-1 text-xs text-kwiq-muted">{message}</p>
      {hint && (
        <div className="mt-3 rounded-lg border border-kwiq-border/60 bg-kwiq-bg/40 p-3 text-xs text-kwiq-muted">
          <span className="mr-1 font-medium uppercase tracking-wider text-kwiq-text">
            Cómo resolverlo ·
          </span>
          {hint.hint}
          {hint.href && (
            <>
              {" "}
              <Link
                href={hint.href}
                className="text-kwiq-accent hover:underline"
              >
                Ir a ajustes →
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
