/**
 * Step: calendars.
 *
 * Crea calendarios en la sub-cuenta usando los datos que el cliente cargó
 * en la sección "Calendarios" de la entrevista.
 *
 * Endpoint:
 *   POST /calendars/   (con header Location-Id, body con availability)
 *
 * Scope requerido: `calendars.write`.
 *
 * Idempotencia: `local_key = nombre normalizado del calendar`. El
 * fingerprint cubre name + duración + availability + meetingLocation.
 *
 * Limitaciones intencionales (V1):
 *  - NO creamos calendar groups todavía. El cliente los puede agrupar
 *    después desde la UI de GHL si quiere.
 *  - Tipo de calendar fijo en "round_robin_class_booking" (que es el más
 *    común para servicios profesionales). Si el cliente necesita otro
 *    tipo lo cambia desde GHL.
 *  - assignedUserIds queda vacío en el create — los users se asignan
 *    después manualmente porque dependen de los IDs que GHL devuelva al
 *    crear los users del step anterior. Una mejora futura sería resolver
 *    el cruce automáticamente leyendo kwiq_provisioning_resources del
 *    step `user`.
 */
import type { LocationContext, ProvisionInput, StepResult } from "../types";
import { locationFetch } from "../location-client";
import {
  decideActionWithRemote,
  fingerprint,
  upsertResourceRecord,
} from "../idempotency";
import { findByNormalizedName } from "../normalize";

const RESOURCE_KIND = "calendar";

interface GhlCalendar {
  id: string;
  name: string;
}

interface GhlCalendarResponse {
  calendar?: GhlCalendar;
  id?: string;
}

/** Mapeo día string → openHours.daysOfTheWeek (formato GHL: 0=domingo, 1=lunes...). */
/**
 * Mapa amplio de identificadores de día → 0..6 (0 = domingo, GHL).
 *
 * El autoconfig viene de un LLM, así que las keys de availability
 * pueden estar en formatos variados: "Mon", "lunes", "LUNES", "L",
 * "monday", etc. Mejor que sea generoso y normalizar adentro.
 */
const DAY_INDEX: Record<string, number> = {
  // Inglés corto
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  // Inglés largo
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
  friday: 5, saturday: 6,
  // Español corto
  dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6,
  // Español largo
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, miércoles: 3,
  jueves: 4, viernes: 5, sabado: 6, sábado: 6,
};

function dayIndexFor(raw: string): number | undefined {
  const norm = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  return DAY_INDEX[norm];
}

export async function stepCalendars(
  ctx: LocationContext,
  input: ProvisionInput,
  run_id: string | null,
): Promise<StepResult> {
  const started = Date.now();
  const items: NonNullable<StepResult["items"]> = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let hadError = false;

  const calendars = input.autoconfig.calendars ?? [];
  if (calendars.length === 0) {
    return {
      step: "calendars",
      status: "skipped",
      created: 0,
      updated: 0,
      skipped: 0,
      duration_ms: Date.now() - started,
    };
  }

  for (const c of calendars) {
    if (!c.name?.trim()) continue;
    const local_key = c.name.trim().toLowerCase();

    const slotDuration =
      typeof c.duration_min === "number" && c.duration_min > 0
        ? c.duration_min
        : 30;
    const slotBuffer =
      typeof c.buffer_after_min === "number" && c.buffer_after_min > 0
        ? c.buffer_after_min
        : 0;
    const slotBufferUnit = "mins";

    const openHours = buildOpenHours(c.availability ?? {});

    // teamMembers — GHL exige al menos 1 user. Tomamos el primer user
    // de la sub-cuenta (típicamente el owner creado al hacer
    // POST /locations/, o Lucía adminada después). Si no hay ninguno,
    // GHL va a rechazar el calendar — el step va a fallar con un error
    // claro.
    const remoteUsers = input.inventory.users.items;
    const teamMembers = remoteUsers.slice(0, 1).map((u) => ({
      userId: u.id,
      priority: 0.5,
      meetingLocationType: "default",
      isPrimary: true,
    }));

    const payload: Record<string, unknown> = {
      locationId: ctx.location_id,
      name: c.name.trim(),
      description: typeof c.raw?.description === "string" ? c.raw.description : "",
      calendarType: "round_robin",
      eventType: "RoundRobin_OptimizeForAvailability",
      widgetSlug: c.slug ?? slugify(c.name.trim()),
      slotDuration,
      slotDurationUnit: "mins",
      slotInterval: slotDuration,
      slotIntervalUnit: "mins",
      slotBuffer,
      slotBufferUnit,
      preBuffer:
        typeof c.buffer_before_min === "number" ? c.buffer_before_min : 0,
      preBufferUnit: "mins",
      openHours,
      meetingLocation: typeof c.raw?.meeting_location === "string"
        ? c.raw.meeting_location
        : "Custom",
      isActive: true,
      autoConfirm: true,
      // shouldConfirmEmailToHost / shouldNotifyHostByEmail eran props
      // de la API v1, GHL v2 las rechaza con 422 "should not exist".
      teamMembers,
    };

    const fp = fingerprint(payload);

    // Match contra inventario por nombre del calendario.
    const remote = findByNormalizedName(
      input.inventory.calendars.items,
      c.name,
    );

    const decision = await decideActionWithRemote(
      input.project_id,
      RESOURCE_KIND,
      local_key,
      fp,
      remote ? { id: remote.id } : null,
    );

    if (decision.action === "skip") {
      skipped++;
      items.push({
        local_key,
        action: "skip",
        external_id: decision.external_id,
      });
      continue;
    }

    if (input.mode === "dry_run") {
      if (decision.action === "create") created++;
      else updated++;
      items.push({
        local_key,
        action: decision.action,
        external_id:
          decision.action === "update" ? decision.external_id : undefined,
      });
      continue;
    }

    if (decision.action === "create") {
      const res = await locationFetch<GhlCalendarResponse>(ctx, `/calendars/`, {
        method: "POST",
        body: JSON.stringify(payload),
        scope_location: true,
      });
      if (!res.ok) {
        hadError = true;
        items.push({
          local_key,
          action: "error",
          error: `POST ${res.status}: ${res.message}`,
        });
        continue;
      }
      const ext = extractId(res.data);
      if (!ext) {
        hadError = true;
        items.push({
          local_key,
          action: "error",
          error: "GHL no devolvió id en POST calendar",
        });
        continue;
      }
      await upsertResourceRecord(
        input.project_id,
        RESOURCE_KIND,
        local_key,
        ext,
        fp,
        run_id,
      );
      created++;
      items.push({ local_key, action: "create", external_id: ext });
    } else {
      const res = await locationFetch<GhlCalendarResponse>(
        ctx,
        `/calendars/${decision.external_id}`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
          scope_location: true,
        },
      );
      if (!res.ok) {
        hadError = true;
        items.push({
          local_key,
          action: "error",
          external_id: decision.external_id,
          error: `PUT ${res.status}: ${res.message}`,
        });
        continue;
      }
      await upsertResourceRecord(
        input.project_id,
        RESOURCE_KIND,
        local_key,
        decision.external_id,
        fp,
        run_id,
      );
      updated++;
      items.push({
        local_key,
        action: "update",
        external_id: decision.external_id,
      });
    }
  }

  return {
    step: "calendars",
    status: hadError ? "error" : "ok",
    created,
    updated,
    skipped,
    duration_ms: Date.now() - started,
    items,
  };
}

/**
 * Convierte el availability del schema (Mon: [{start, end}], ...) al formato
 * `openHours` que GHL espera: `[{ daysOfTheWeek: [1], hours: [{ openHour, openMinute, closeHour, closeMinute }] }, ...]`.
 *
 * Si no hay availability, devuelve un default razonable (lun-vie 09:00-18:00).
 */
function buildOpenHours(
  availability: Record<string, { start: string; end: string }[]>,
): Array<{
  daysOfTheWeek: number[];
  hours: Array<{
    openHour: number;
    openMinute: number;
    closeHour: number;
    closeMinute: number;
  }>;
}> {
  const entries: Array<{
    daysOfTheWeek: number[];
    hours: Array<{ openHour: number; openMinute: number; closeHour: number; closeMinute: number }>;
  }> = [];

  for (const [day, slots] of Object.entries(availability)) {
    const dayIdx = dayIndexFor(day);
    if (dayIdx === undefined) continue;
    if (!Array.isArray(slots) || slots.length === 0) continue;

    const hours = slots
      .map((s) => parseSlot(s.start, s.end))
      .filter((h): h is { openHour: number; openMinute: number; closeHour: number; closeMinute: number } => h !== null);

    if (hours.length > 0) {
      entries.push({ daysOfTheWeek: [dayIdx], hours });
    }
  }

  if (entries.length === 0) {
    // Default razonable: lun a vie 09:00 - 18:00.
    entries.push({
      daysOfTheWeek: [1, 2, 3, 4, 5],
      hours: [{ openHour: 9, openMinute: 0, closeHour: 18, closeMinute: 0 }],
    });
  }

  return entries;
}

function parseSlot(
  start: string,
  end: string,
): {
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
} | null {
  const [oh, om] = parseTime(start);
  const [ch, cm] = parseTime(end);
  if (oh === null || ch === null) return null;
  return {
    openHour: oh,
    openMinute: om ?? 0,
    closeHour: ch,
    closeMinute: cm ?? 0,
  };
}

function parseTime(s: string): [number | null, number | null] {
  const m = String(s).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return [null, null];
  return [parseInt(m[1]!, 10), parseInt(m[2]!, 10)];
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 48);
}

function extractId(data: GhlCalendarResponse | undefined): string | null {
  if (!data) return null;
  if (typeof data.id === "string") return data.id;
  if (data.calendar?.id) return data.calendar.id;
  return null;
}
