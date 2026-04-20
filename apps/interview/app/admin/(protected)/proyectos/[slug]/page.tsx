import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  ProvisionPanel,
  type RunReport,
} from "@/components/admin/provision-panel";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

/**
 * /admin/proyectos/[slug] — detalle de un proyecto Kwiq.
 *
 * Muestra:
 *  - metadatos (cliente, contacto, estado, modo de auth)
 *  - credenciales (solo presencia; nunca devolvemos el PIT en claro)
 *  - link de entrevista para copiar/mandar al cliente
 *  - lista de sesiones de entrevista asociadas
 */
export default async function ProjectDetailPage({ params }: Props) {
  const { slug } = await params;
  const sb = supabaseAdmin();

  const { data: project } = await sb
    .from("kwiq_projects")
    .select(
      "id, slug, client_name, contact_email, status, auth_mode, ghl_location_id, ghl_company_id, ghl_token_enc, ghl_refresh_enc, ghl_token_expires_at, ghl_scopes, notes, created_at, updated_at",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!project) {
    notFound();
  }

  const { data: sessions } = await sb
    .from("interview_sessions")
    .select("id, status, section, updated_at, created_at")
    .eq("project_id", project.id)
    .order("updated_at", { ascending: false })
    .limit(20);

  const { data: assets } = await sb
    .from("branding_assets")
    .select("id, kind, original_name, mime_type, size_bytes, uploaded_at")
    .eq("project_id", project.id)
    .order("uploaded_at", { ascending: false });

  // Upsells detectados: tomamos el derived_output `ghl_autoconfig_json` más
  // reciente de cualquier sesión del proyecto y leemos `content.upsells`.
  const sessionIds = (sessions ?? []).map((s) => s.id);
  const upsells: string[] = [];
  if (sessionIds.length) {
    const { data: outs } = await sb
      .from("derived_outputs")
      .select("content, version, session_id, generated_at")
      .eq("kind", "ghl_autoconfig_json")
      .in("session_id", sessionIds)
      .order("version", { ascending: false })
      .limit(1);
    const latest = outs?.[0];
    const list = (latest?.content as { upsells?: unknown } | null)?.upsells;
    if (Array.isArray(list)) {
      for (const u of list) {
        if (typeof u === "string" && !upsells.includes(u)) upsells.push(u);
      }
    }
  }

  // Historial del provisioner — tomamos hasta las últimas 10 corridas para
  // mostrar el último RunReport en el panel y contar total.
  const { data: runs } = await sb
    .from("kwiq_provisioning_runs")
    .select(
      "id, status, step_results, error_message, started_at, finished_at, created_at",
    )
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const latestRun = runs?.[0];
  const lastRun: RunReport | null = latestRun
    ? {
        run_id: latestRun.id as string,
        status: latestRun.status as RunReport["status"],
        step_results:
          (latestRun.step_results as RunReport["step_results"] | null) ?? [],
        error_message: (latestRun.error_message as string | null) ?? undefined,
        started_at:
          (latestRun.started_at as string | null) ??
          (latestRun.created_at as string),
        finished_at:
          (latestRun.finished_at as string | null) ??
          (latestRun.created_at as string),
      }
    : null;

  const interviewUrl = `/e/${project.slug}`;
  const hasStoredToken = Boolean(project.ghl_token_enc);
  const hasRefresh = Boolean(project.ghl_refresh_enc);
  const usesAgency = project.auth_mode === "pit_agency";

  return (
    <div className="flex flex-col gap-8">
      <section className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-kwiq-muted">
            Admin · proyectos · {project.slug}
          </p>
          <h1 className="mt-1 truncate font-display text-3xl font-semibold uppercase tracking-wide">
            {project.client_name}
          </h1>
          <p className="mt-2 text-sm text-kwiq-muted">
            Creado el{" "}
            {new Date(project.created_at as string).toLocaleString("es-AR")}
            {project.contact_email && (
              <>
                {" · "}
                <a
                  href={`mailto:${project.contact_email}`}
                  className="text-kwiq-accent hover:underline"
                >
                  {project.contact_email}
                </a>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={project.status as string} />
          <AuthBadge mode={project.auth_mode as string} />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <InfoCard
          label="Location ID"
          value={
            project.ghl_location_id ? (
              <code className="font-mono text-xs break-all">
                {project.ghl_location_id}
              </code>
            ) : (
              <span className="text-kwiq-muted">— no configurado —</span>
            )
          }
        />
        <InfoCard
          label="Company ID"
          value={
            project.ghl_company_id ? (
              <code className="font-mono text-xs break-all">
                {project.ghl_company_id}
              </code>
            ) : (
              <span className="text-kwiq-muted">— no configurado —</span>
            )
          }
        />
        <InfoCard
          label="Credenciales almacenadas"
          value={
            usesAgency ? (
              <span className="text-xs text-kwiq-muted">
                Usa <code className="font-mono">GHL_AGENCY_PIT</code> del
                entorno.
              </span>
            ) : hasStoredToken ? (
              <span className="text-kwiq-ok text-sm">
                ✓ PIT cifrado
                {hasRefresh && " + refresh token"}
              </span>
            ) : (
              <span className="text-kwiq-warn text-sm">
                ⚠ falta cargar credencial
              </span>
            )
          }
        />
      </section>

      <section className="rounded-2xl border border-kwiq-border bg-kwiq-panel/40 p-6">
        <h2 className="font-display text-lg font-semibold uppercase tracking-wide">
          Link de entrevista
        </h2>
        <p className="mt-1 text-sm text-kwiq-muted">
          Mandale este link al cliente para que complete la onboarding.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <code className="rounded-lg border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 font-mono text-sm">
            {interviewUrl}
          </code>
          <Link
            href={interviewUrl}
            target="_blank"
            className="rounded-lg border border-kwiq-border px-3 py-2 text-sm text-kwiq-muted transition hover:border-kwiq-accent hover:text-kwiq-accent"
          >
            Abrir entrevista →
          </Link>
        </div>
      </section>

      <ProvisionPanel
        slug={project.slug as string}
        locationReady={Boolean(project.ghl_location_id)}
        lastRun={lastRun}
        totalRuns={runs?.length ?? 0}
      />

      {upsells.length > 0 && (
        <section className="rounded-2xl border border-kwiq-accent2/40 bg-kwiq-accent2/5 p-6">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-kwiq-accent2">
              Oportunidades Kwiq detectadas
            </h2>
            <span className="text-xs text-kwiq-muted">
              {upsells.length} oportunidad(es)
            </span>
          </div>
          <p className="mb-4 text-sm text-kwiq-muted">
            Durante la entrevista el cliente mencionó que le faltan estos
            activos. Considera proponerlos como servicios adicionales antes
            de arrancar con la configuración.
          </p>
          <div className="flex flex-wrap gap-2">
            {upsells.map((u) => (
              <UpsellBadge key={u} code={u} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold uppercase tracking-wide">
            Assets de marca
          </h2>
          <span className="text-xs text-kwiq-muted">
            {assets?.length ?? 0} archivo(s)
          </span>
        </div>

        {!assets || assets.length === 0 ? (
          <p className="rounded-xl border border-kwiq-border bg-kwiq-panel/40 p-6 text-sm text-kwiq-muted">
            Todavía no hay logo, paleta o tipografías subidas. El cliente los
            puede subir durante la sección de <strong>Identidad de marca</strong> de
            la entrevista.
          </p>
        ) : (
          <ul className="divide-y divide-kwiq-border rounded-xl border border-kwiq-border bg-kwiq-panel/40">
            {assets.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <AssetKindBadge kind={a.kind as string} />
                    <span className="truncate font-medium text-kwiq-text">
                      {a.original_name ?? "(sin nombre)"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-kwiq-muted">
                    {a.mime_type ?? "archivo"}
                    {a.size_bytes && <> · {formatBytesAdmin(a.size_bytes as number)}</>}
                    {" · "}
                    {new Date(a.uploaded_at as string).toLocaleString("es-AR")}
                  </div>
                </div>
                <a
                  href={`/api/admin/assets/${a.id}/download`}
                  className="rounded-lg border border-kwiq-border px-3 py-1.5 text-xs text-kwiq-muted transition hover:border-kwiq-accent hover:text-kwiq-accent"
                >
                  Descargar
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold uppercase tracking-wide">
            Sesiones de entrevista
          </h2>
          <span className="text-xs text-kwiq-muted">
            {sessions?.length ?? 0} sesión(es)
          </span>
        </div>

        {!sessions || sessions.length === 0 ? (
          <p className="rounded-xl border border-kwiq-border bg-kwiq-panel/40 p-6 text-sm text-kwiq-muted">
            Todavía no hay entrevistas para este proyecto. Se crean al abrir
            el link de arriba.
          </p>
        ) : (
          <ul className="divide-y divide-kwiq-border rounded-xl border border-kwiq-border bg-kwiq-panel/40">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs text-kwiq-muted">
                    {s.id}
                  </div>
                  <div className="text-xs text-kwiq-muted">
                    Sección: {s.section ?? "—"} · Actualizada{" "}
                    {new Date(s.updated_at as string).toLocaleString("es-AR")}
                  </div>
                </div>
                <SessionStatusBadge status={s.status as string} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {project.notes && (
        <section className="rounded-2xl border border-kwiq-border bg-kwiq-panel/40 p-6">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-kwiq-muted">
            Notas internas
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-kwiq-text">
            {project.notes}
          </p>
        </section>
      )}

      <div className="flex items-center justify-between text-xs text-kwiq-muted">
        <Link href="/admin/proyectos" className="hover:text-kwiq-text">
          ← Volver al listado
        </Link>
        <span>
          Última act.{" "}
          {new Date(project.updated_at as string).toLocaleString("es-AR")}
        </span>
      </div>
    </div>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-kwiq-border bg-kwiq-panel/40 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-kwiq-muted">
        {label}
      </p>
      <div className="mt-2 text-sm text-kwiq-text">{value}</div>
    </div>
  );
}

function AuthBadge({ mode }: { mode: string }) {
  const label =
    mode === "pit_agency"
      ? "PIT agencia"
      : mode === "pit_location"
        ? "PIT sub-account"
        : "OAuth";
  return (
    <span className="rounded-full border border-kwiq-border bg-kwiq-bg/40 px-2 py-0.5 text-[10px] uppercase tracking-widest">
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { label, cls } = statusStyle(status);
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

function SessionStatusBadge({ status }: { status: string }) {
  const cls =
    status === "completed"
      ? "border-kwiq-ok/40 bg-kwiq-ok/10 text-kwiq-ok"
      : status === "in_progress"
        ? "border-kwiq-warn/40 bg-kwiq-warn/10 text-kwiq-warn"
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

function statusStyle(status: string): { label: string; cls: string } {
  switch (status) {
    case "draft":
      return {
        label: "Borrador",
        cls: "border-kwiq-border bg-kwiq-bg/40 text-kwiq-muted",
      };
    case "ready_for_interview":
      return {
        label: "Listo p/ entrevista",
        cls: "border-kwiq-accent/40 bg-kwiq-accent/10 text-kwiq-accent",
      };
    case "interview_in_progress":
      return {
        label: "Entrevista en curso",
        cls: "border-kwiq-warn/40 bg-kwiq-warn/10 text-kwiq-warn",
      };
    case "ready_to_provision":
      return {
        label: "Listo p/ provision",
        cls: "border-kwiq-accent2/40 bg-kwiq-accent2/10 text-kwiq-accent2",
      };
    case "provisioned":
      return {
        label: "Provisionado",
        cls: "border-kwiq-ok/40 bg-kwiq-ok/10 text-kwiq-ok",
      };
    case "archived":
      return {
        label: "Archivado",
        cls: "border-kwiq-border bg-kwiq-bg/40 text-kwiq-muted",
      };
    default:
      return { label: status, cls: "border-kwiq-border text-kwiq-muted" };
  }
}

function AssetKindBadge({ kind }: { kind: string }) {
  const { label, cls } = assetKindStyle(kind);
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

function assetKindStyle(kind: string): { label: string; cls: string } {
  switch (kind) {
    case "logo":
      return {
        label: "Logo",
        cls: "border-kwiq-accent/40 bg-kwiq-accent/10 text-kwiq-accent",
      };
    case "palette":
      return {
        label: "Paleta",
        cls: "border-kwiq-accent2/40 bg-kwiq-accent2/10 text-kwiq-accent2",
      };
    case "font":
      return {
        label: "Tipografía",
        cls: "border-kwiq-warn/40 bg-kwiq-warn/10 text-kwiq-warn",
      };
    case "brandbook":
      return {
        label: "Brandbook",
        cls: "border-kwiq-ok/40 bg-kwiq-ok/10 text-kwiq-ok",
      };
    case "other":
      return {
        label: "Otro",
        cls: "border-kwiq-border bg-kwiq-bg/40 text-kwiq-muted",
      };
    default:
      return {
        label: kind,
        cls: "border-kwiq-border bg-kwiq-bg/40 text-kwiq-muted",
      };
  }
}

function formatBytesAdmin(n: number): string {
  if (!n || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Diccionario de códigos de upsell → etiqueta humana + descripción corta.
 * Los códigos los define `lib/interview-schema.ts` en la sección
 * `oportunidades_kwiq`. Si agregás un nuevo upsell al schema, agregalo también
 * acá para que renderice bonito (si no, caemos a un fallback genérico).
 */
const UPSELL_CATALOG: Record<
  string,
  { label: string; description: string; icon: string }
> = {
  website_build: {
    label: "Página web",
    description: "Kwiq puede construir landing o sitio completo.",
    icon: "🌐",
  },
  branding_build: {
    label: "Branding",
    description: "Logo + paleta + tipografía + brandbook básico.",
    icon: "🎨",
  },
  domain_purchase: {
    label: "Dominio",
    description: "Compra y administración del dominio propio.",
    icon: "🔗",
  },
  hosting_setup: {
    label: "Hosting",
    description: "Hosting administrado o integración con GHL Sites.",
    icon: "📦",
  },
  whatsapp_line: {
    label: "WhatsApp Business API",
    description: "Provisión de línea oficial para el agente IA.",
    icon: "💬",
  },
  crm_onboarding: {
    label: "Onboarding CRM",
    description: "Setup completo de GHL + migración si aplica.",
    icon: "🗂️",
  },
};

function UpsellBadge({ code }: { code: string }) {
  const entry = UPSELL_CATALOG[code] ?? {
    label: code,
    description: "Oportunidad detectada durante la entrevista.",
    icon: "✨",
  };
  return (
    <span
      title={entry.description}
      className="inline-flex items-center gap-2 rounded-full border border-kwiq-accent2/40 bg-kwiq-accent2/10 px-3 py-1 text-xs font-medium text-kwiq-accent2"
    >
      <span aria-hidden>{entry.icon}</span>
      {entry.label}
    </span>
  );
}
