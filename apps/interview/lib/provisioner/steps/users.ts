/**
 * Step: users (team members del cliente).
 *
 * Crea los usuarios que el cliente cargó en la sección "Personal" de la
 * entrevista. GHL les manda un email de invitación para que cada uno
 * setee su contraseña. El admin de la sub-cuenta los puede gestionar
 * después desde Settings → My Staff.
 *
 * Endpoint:
 *   POST /users/  (con header Location-Id, body con permissions y roles)
 *
 * Scope requerido: `users.write`.
 *
 * Idempotencia: `local_key = email normalizado`. Si el email ya existe en
 * la sub-cuenta, GHL devuelve 409 — lo tratamos como "skip" (ya estaba).
 *
 * Mapeo de role Kwiq → GHL:
 *   "Admin" → "admin"
 *   "User"  → "user"
 *   (default) → "user"
 */
import type { LocationContext, ProvisionInput, StepResult } from "../types";
import { locationFetch } from "../location-client";
import {
  decideAction,
  fingerprint,
  upsertResourceRecord,
} from "../idempotency";

const RESOURCE_KIND = "user";

interface GhlUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}

interface GhlUserResponse {
  user?: GhlUser;
  id?: string;
  email?: string;
}

export async function stepUsers(
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

  const users = input.autoconfig.users ?? [];
  if (users.length === 0) {
    return {
      step: "users",
      status: "skipped",
      created: 0,
      updated: 0,
      skipped: 0,
      duration_ms: Date.now() - started,
    };
  }

  for (const u of users) {
    if (!u.email?.trim()) continue;
    const email = u.email.trim().toLowerCase();
    const local_key = email;

    // Parseamos el nombre completo en first + last (best-effort).
    const fullName = (u.name ?? "").trim();
    const parts = fullName.split(/\s+/);
    const firstName = parts[0] ?? "";
    const lastName = parts.slice(1).join(" ") || "";

    const role = mapRole(u.role);

    const payload: Record<string, unknown> = {
      firstName,
      lastName,
      email,
      // GHL pide phone como string aunque sea opcional. Si no lo capturamos
      // lo dejamos vacío — el cliente lo completa después.
      phone: typeof u.raw?.phone === "string" ? u.raw.phone : "",
      type: "account",
      role,
      locationIds: [ctx.location_id],
      // Permissions razonables por defecto. El admin de la sub-cuenta
      // puede ajustarlos desde Settings → My Staff. Mantengo el set
      // minimalista para no abrir más superficie de la necesaria.
      permissions: {
        campaignsEnabled: true,
        contactsEnabled: true,
        workflowsEnabled: true,
        triggersEnabled: true,
        funnelsEnabled: true,
        websitesEnabled: true,
        opportunitiesEnabled: true,
        dashboardStatsEnabled: true,
        bulkRequestsEnabled: false,
        appointmentsEnabled: true,
        reviewsEnabled: true,
        onlineListingsEnabled: true,
        phoneCallEnabled: true,
        conversationsEnabled: true,
        assignedDataOnly: false,
        adwordsReportingEnabled: false,
        membershipEnabled: false,
        facebookAdsReportingEnabled: false,
        attributionsReportingEnabled: false,
        settingsEnabled: role === "admin",
        tagsEnabled: true,
        leadValueEnabled: true,
        marketingEnabled: true,
      },
    };

    const fp = fingerprint(payload);

    const decision = await decideAction(
      input.project_id,
      RESOURCE_KIND,
      local_key,
      fp,
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
      const res = await locationFetch<GhlUserResponse>(ctx, `/users/`, {
        method: "POST",
        body: JSON.stringify(payload),
        scope_location: true,
      });
      if (!res.ok) {
        // Email ya registrado en la cuenta → tratamos como skip suave.
        if (
          res.status === 409 ||
          /already exists|already registered/i.test(res.message)
        ) {
          skipped++;
          items.push({
            local_key,
            action: "skip",
            error: "Email ya tenía un user en GHL — saltado.",
          });
          continue;
        }
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
          error: "GHL no devolvió id en POST users",
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
      // GHL no expone PUT /users/ por location — actualizar permisos
      // requiere ir a la UI. Por ahora solo registramos el cambio de
      // fingerprint pero no lo aplicamos.
      await upsertResourceRecord(
        input.project_id,
        RESOURCE_KIND,
        local_key,
        decision.external_id,
        fp,
        run_id,
      );
      skipped++;
      items.push({
        local_key,
        action: "skip",
        external_id: decision.external_id,
        error:
          "Update de users no soportado por API — el admin del cliente puede ajustar permisos en GHL → Settings → My Staff.",
      });
    }
  }

  return {
    step: "users",
    status: hadError ? "error" : "ok",
    created,
    updated,
    skipped,
    duration_ms: Date.now() - started,
    items,
  };
}

function mapRole(role: string | undefined): "admin" | "user" {
  const norm = (role ?? "").trim().toLowerCase();
  if (norm === "admin" || norm === "administrador") return "admin";
  return "user";
}

function extractId(data: GhlUserResponse | undefined): string | null {
  if (!data) return null;
  if (typeof data.id === "string") return data.id;
  if (data.user?.id) return data.user.id;
  return null;
}
