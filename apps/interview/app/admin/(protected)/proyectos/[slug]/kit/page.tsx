import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildKit } from "@/lib/generators/kit";
import { KitView } from "@/components/admin/kit-view";
import type { GhlAutoConfig } from "@/lib/generators/ghl-autoconfig";
import type { InventoryReport } from "@/lib/provisioner/inventory";

export const dynamic = "force-dynamic";

/**
 * /admin/proyectos/[slug]/kit
 *
 * Página del Kit de Configuración Manual: muestra todo lo que el admin
 * Kwiq tiene que hacer copy-paste en GHL para terminar la configuración
 * (lo que NO se puede crear vía API).
 *
 * Tabs:
 *   1. Plantillas de email (con diff vs inventory)
 *   2. Snippets de WhatsApp/SMS
 *   3. Knowledge Base / FAQs
 *   4. Workflows (instrucciones de edición)
 *
 * Datos:
 *   - Autoconfig más reciente desde derived_outputs.
 *   - Inventory más reciente desde kwiq_projects.last_inventory_jsonb.
 *   - buildKit() combina ambos y devuelve el bundle listo.
 */
export default async function KitPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sb = supabaseAdmin();

  const { data: project } = await sb
    .from("kwiq_projects")
    .select(
      "id, slug, client_name, ghl_location_id, last_inventory_jsonb, last_inventory_fetched_at",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!project) notFound();

  // Cargamos el autoconfig más reciente del proyecto.
  const { data: sessions } = await sb
    .from("interview_sessions")
    .select("id, session_token")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false });

  const sessionIds = (sessions ?? []).map((s) => s.id);
  let autoconfig: GhlAutoConfig | null = null;
  if (sessionIds.length) {
    const { data: outs } = await sb
      .from("derived_outputs")
      .select("content, version, generated_at")
      .eq("kind", "ghl_autoconfig_json")
      .in("session_id", sessionIds)
      .order("version", { ascending: false })
      .order("generated_at", { ascending: false })
      .limit(1);
    autoconfig = (outs?.[0]?.content ?? null) as GhlAutoConfig | null;
  }

  const inventory =
    (project.last_inventory_jsonb as InventoryReport | null) ?? null;

  // Generamos el kit con o sin inventory (el diff solo aparece si hay).
  const kit = autoconfig
    ? buildKit(autoconfig, inventory)
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-kwiq-muted">
            Admin · proyectos · {project.slug} · kit
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold uppercase tracking-wide">
            Kit de configuración manual
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-kwiq-muted">
            Plantillas, snippets, FAQs e instrucciones de workflows generados
            a partir de la entrevista. Lo que <em>no</em> podemos crear vía API
            de GHL queda acá para que copies y pegues. El diff inteligente te
            indica qué ya existe en GHL (vino del snapshot) y qué falta.
          </p>
        </div>
        <Link
          href={`/admin/proyectos/${project.slug}`}
          className="rounded-lg border border-kwiq-border px-3 py-1.5 text-xs text-kwiq-muted hover:border-kwiq-accent hover:text-kwiq-accent"
        >
          ← Volver al proyecto
        </Link>
      </div>

      {!autoconfig && (
        <div className="rounded-2xl border border-kwiq-warn/40 bg-kwiq-warn/5 p-6 text-sm text-kwiq-muted">
          <p className="font-medium text-kwiq-text">
            Todavía no hay autoconfig generado.
          </p>
          <p className="mt-2">
            El kit se construye a partir de la entrevista del cliente. Cuando
            el cliente avance en la sección Contexto General, se generan
            outputs automáticamente. También podés disparar la regeneración
            desde el detalle del proyecto.
          </p>
        </div>
      )}

      {kit && (
        <>
          {!inventory && (
            <div className="rounded-xl border border-kwiq-warn/40 bg-kwiq-warn/5 p-4 text-sm text-kwiq-muted">
              <strong className="text-kwiq-text">Inventario no sincronizado.</strong>{" "}
              El kit se muestra completo pero sin el "diff inteligente" que
              te indica qué ya existe en GHL. Sincronizá el inventario desde
              el detalle del proyecto para verlo.
            </div>
          )}
          <KitView kit={kit} />
        </>
      )}
    </div>
  );
}
