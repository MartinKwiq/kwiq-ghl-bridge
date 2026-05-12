/**
 * GET /api/admin/proyectos/[slug]/inventory
 *
 * Inventario READ-ONLY de lo que ya existe en la sub-cuenta GHL del
 * proyecto. NO toca nada — solo hace GETs paralelos al API de GHL para
 * listar tags, custom_values, custom_fields, pipelines, calendars y
 * users.
 *
 * Sirve para:
 *  - Diagnosticar por qué el provisioner falla con "already exists"
 *    (snapshots pre-pueblan recursos).
 *  - Entender el estado real de la sub-cuenta antes de aplicar cambios.
 *  - Documentar la decisión create-vs-update en cada step del provisioner.
 *
 * Requiere Sub-account PIT cargado en kwiq_projects.ghl_location_pit_enc.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdminRole, type KwiqAdminRole } from "@/lib/admin-auth";
import { getLocationContextByProject, locationFetch } from "@/lib/provisioner/location-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type RouteParams = { params: Promise<{ slug: string }> };

const ALLOWED_ROLES: KwiqAdminRole[] = ["owner", "admin", "operator"];

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
  /** Para custom_fields: id del folder al que pertenece (si está en uno). */
  parentId?: string;
  /** Para ai_agents: si el agente está activo. */
  isActive?: boolean;
  raw?: Record<string, unknown>;
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
  /** Folders/carpetas de custom_fields. El snapshot puede pre-crearlas, y
   *  el provisioner las matchea por nombre normalizado para resolver el
   *  `parentId` correcto al crear/actualizar custom fields. */
  custom_field_folders: InventorySection;
  pipelines: InventorySection;
  calendars: InventorySection;
  users: InventorySection;
  /** Conversation AI agents activos en la sub-cuenta. La API es limitada
   *  (puede devolver 404 según el plan); por eso lleva `fetched: false`
   *  con error en lugar de romper si no responde. */
  ai_agents: InventorySection;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const me = await requireAdminRole(ALLOWED_ROLES);
  if (!me.ok) {
    return NextResponse.json(
      { error: me.error, message: me.message },
      { status: me.status },
    );
  }

  const { slug } = await params;
  const admin = supabaseAdmin();

  const { data: project } = await admin
    .from("kwiq_projects")
    .select("id, ghl_location_id, last_inventory_jsonb, last_inventory_fetched_at")
    .eq("slug", slug)
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!project.ghl_location_id) {
    return NextResponse.json(
      {
        error: "no_location",
        message: "Este proyecto todavía no tiene sub-cuenta GHL creada.",
      },
      { status: 400 },
    );
  }

  const ctxResult = await getLocationContextByProject(project.id);
  if (!ctxResult.ok) {
    return NextResponse.json(
      {
        error: "no_pit",
        message: ctxResult.message,
        reason: ctxResult.reason,
      },
      { status: 400 },
    );
  }
  const ctx = ctxResult.ctx;

  const started = Date.now();

  // Llamadas en paralelo. Cada una resuelve a InventorySection — si falla,
  // queda fetched: false con el error_message, pero no aborta las demás.
  const [
    tags,
    customValues,
    customFields,
    customFieldFolders,
    pipelines,
    calendars,
    users,
    aiAgents,
  ] = await Promise.all([
    fetchTags(ctx),
    fetchCustomValues(ctx),
    fetchCustomFields(ctx),
    fetchCustomFieldFolders(ctx),
    fetchPipelines(ctx),
    fetchCalendars(ctx),
    fetchUsers(ctx),
    fetchAIAgents(ctx),
  ]);

  const report: InventoryReport = {
    location_id: project.ghl_location_id,
    fetched_at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    tags,
    custom_values: customValues,
    custom_fields: customFields,
    custom_field_folders: customFieldFolders,
    pipelines,
    calendars,
    users,
    ai_agents: aiAgents,
  };

  // Persistir el snapshot para que el provisioner pueda razonar sobre él
  // sin tener que re-sincronizar GHL en cada run, y para que la UI lo
  // muestre persistido entre page loads.
  await admin
    .from("kwiq_projects")
    .update({
      last_inventory_jsonb: report,
      last_inventory_fetched_at: report.fetched_at,
    })
    .eq("id", project.id);

  return NextResponse.json(report);
}

/**
 * GET handler que devuelve el último inventario CACHEADO en DB sin tocar
 * GHL. Útil para que la UI hidrate su estado inicial cuando se abre la
 * página, antes de que el admin apriete "Sincronizar".
 *
 * No exporto esta función — el GET principal sigue siendo el "live", y
 * el componente UI carga el cacheado desde el SSR via supabaseAdmin().
 */

// ─── Fetchers individuales ─────────────────────────────────────────

async function fetchTags(ctx: {
  pit: string;
  location_id: string;
  company_id: string;
}): Promise<InventorySection> {
  const res = await locationFetch<{
    tags?: Array<{ id: string; name: string }>;
  }>(ctx, `/locations/${ctx.location_id}/tags`);
  if (!res.ok) {
    return { count: 0, items: [], fetched: false, error: `${res.status}: ${res.message}` };
  }
  const items = (res.data?.tags ?? []).map((t) => ({
    id: t.id,
    name: t.name,
  }));
  return { count: items.length, items, fetched: true };
}

async function fetchCustomValues(ctx: {
  pit: string;
  location_id: string;
  company_id: string;
}): Promise<InventorySection> {
  const res = await locationFetch<{
    customValues?: Array<{
      id: string;
      name: string;
      key?: string;
      value?: string;
    }>;
  }>(ctx, `/locations/${ctx.location_id}/customValues`);
  if (!res.ok) {
    return { count: 0, items: [], fetched: false, error: `${res.status}: ${res.message}` };
  }
  const items = (res.data?.customValues ?? []).map((cv) => ({
    id: cv.id,
    name: cv.name,
    key: cv.key,
    value: cv.value ?? null,
  }));
  return { count: items.length, items, fetched: true };
}

async function fetchCustomFields(ctx: {
  pit: string;
  location_id: string;
  company_id: string;
}): Promise<InventorySection> {
  const res = await locationFetch<{
    customFields?: Array<{
      id: string;
      name: string;
      fieldKey?: string;
      dataType?: string;
      model?: string;
      parentId?: string;
    }>;
  }>(ctx, `/locations/${ctx.location_id}/customFields`);
  if (!res.ok) {
    return { count: 0, items: [], fetched: false, error: `${res.status}: ${res.message}` };
  }
  const items = (res.data?.customFields ?? []).map((cf) => ({
    id: cf.id,
    name: cf.name,
    fieldKey: cf.fieldKey,
    dataType: cf.dataType,
    model: cf.model,
    parentId: cf.parentId,
  }));
  return { count: items.length, items, fetched: true };
}

async function fetchPipelines(ctx: {
  pit: string;
  location_id: string;
  company_id: string;
}): Promise<InventorySection> {
  // GHL /opportunities/pipelines exige `locationId` como query param
  // (no es suficiente el header). Sin él devuelve
  //   422 "locationId can't be undefined".
  // Sigue siendo necesario también el header Location-Id (scope_location).
  const res = await locationFetch<{
    pipelines?: Array<{
      id: string;
      name: string;
      stages?: Array<{ id: string; name: string; position?: number }>;
    }>;
  }>(
    ctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(ctx.location_id)}`,
    { scope_location: true },
  );
  if (!res.ok) {
    return { count: 0, items: [], fetched: false, error: `${res.status}: ${res.message}` };
  }
  const items = (res.data?.pipelines ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    stages: p.stages,
  }));
  return { count: items.length, items, fetched: true };
}

async function fetchCalendars(ctx: {
  pit: string;
  location_id: string;
  company_id: string;
}): Promise<InventorySection> {
  const res = await locationFetch<{
    calendars?: Array<{
      id: string;
      name: string;
      slug?: string;
    }>;
  }>(
    ctx,
    `/calendars/?locationId=${encodeURIComponent(ctx.location_id)}`,
  );
  if (!res.ok) {
    return { count: 0, items: [], fetched: false, error: `${res.status}: ${res.message}` };
  }
  const items = (res.data?.calendars ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    key: c.slug,
  }));
  return { count: items.length, items, fetched: true };
}

async function fetchUsers(ctx: {
  pit: string;
  location_id: string;
  company_id: string;
}): Promise<InventorySection> {
  const res = await locationFetch<{
    users?: Array<{
      id: string;
      name?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
    }>;
  }>(
    ctx,
    `/users/?locationId=${encodeURIComponent(ctx.location_id)}`,
  );
  if (!res.ok) {
    return { count: 0, items: [], fetched: false, error: `${res.status}: ${res.message}` };
  }
  const items = (res.data?.users ?? []).map((u) => ({
    id: u.id,
    name:
      u.name ??
      [u.firstName, u.lastName].filter(Boolean).join(" ") ??
      undefined,
    email: u.email,
  }));
  return { count: items.length, items, fetched: true };
}

/**
 * Lista los folders (carpetas) de custom_fields. Estos los puede haber
 * creado el snapshot — el provisioner debe matchearlos por nombre para
 * resolver el `parentId` correcto al crear un custom_field nuevo en lugar
 * de mandar el nombre como string y dejar que GHL cree duplicados.
 *
 * Si la API no soporta este endpoint en alguna sub-cuenta, fallamos
 * graceful con `fetched: false`.
 */
async function fetchCustomFieldFolders(ctx: {
  pit: string;
  location_id: string;
  company_id: string;
}): Promise<InventorySection> {
  // El endpoint dedicado puede o no existir según el plan de la sub-cuenta.
  // Probamos el path documentado primero, y si vuelve 404 caemos a
  // inferirlo desde los customFields (los que tienen parentId apuntan a
  // un folder; juntamos los parentIds únicos pero sin nombres).
  const res = await locationFetch<{
    folders?: Array<{
      id: string;
      name: string;
      model?: string;
    }>;
    customFieldsFolder?: Array<{
      id: string;
      name: string;
      model?: string;
    }>;
  }>(ctx, `/locations/${ctx.location_id}/customFields/folder`);

  if (res.ok) {
    const arr = res.data?.folders ?? res.data?.customFieldsFolder ?? [];
    const items = arr.map((f) => ({
      id: f.id,
      name: f.name,
      model: f.model,
    }));
    return { count: items.length, items, fetched: true };
  }

  // Fallback: si el endpoint dedicado no existe en este plan, no rompemos
  // — el step custom-fields todavía puede crear folders pasando el nombre
  // como string (comportamiento histórico). Solo perdemos el match-and-adopt
  // de folders pre-existentes.
  return {
    count: 0,
    items: [],
    fetched: false,
    error: `${res.status}: ${res.message}`,
  };
}

/**
 * Lista los agentes de Conversation AI configurados en la sub-cuenta. El
 * snapshot Kwiq base puede traer un agente pre-creado — el provisioner
 * lo adopta vía UPDATE en vez de crear uno nuevo.
 *
 * La API es marcada como "beta" por GHL y puede devolver 404/405 según
 * el plan de la sub-cuenta. Fallamos graceful para no romper el sync de
 * inventario por una sola sección.
 */
async function fetchAIAgents(ctx: {
  pit: string;
  location_id: string;
  company_id: string;
}): Promise<InventorySection> {
  const res = await locationFetch<{
    bots?: Array<{ id: string; name?: string; isActive?: boolean }>;
    data?: Array<{ id: string; name?: string; isActive?: boolean }>;
  }>(
    ctx,
    `/conversation-ai/bots?locationId=${encodeURIComponent(ctx.location_id)}`,
    { scope_location: true },
  );

  if (!res.ok) {
    return {
      count: 0,
      items: [],
      fetched: false,
      error:
        res.status === 404 || res.status === 405
          ? "GHL no expone /conversation-ai/bots para esta sub-cuenta (plan o feature flag)."
          : `${res.status}: ${res.message}`,
    };
  }

  const arr = res.data?.bots ?? res.data?.data ?? [];
  const items = arr.map((b) => ({
    id: b.id,
    name: b.name,
    isActive: b.isActive,
  }));
  return { count: items.length, items, fetched: true };
}
