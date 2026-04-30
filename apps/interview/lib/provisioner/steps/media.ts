/**
 * Step: media uploads (logos + paleta + brandbook).
 *
 * Toma los `branding_assets` que el cliente subió durante la entrevista,
 * los descarga del bucket de Supabase Storage, y los re-sube a la media
 * library de la sub-cuenta GHL para que el cliente pueda referenciarlos
 * desde funnels, emails, sites, etc.
 *
 * Endpoint:
 *   POST /medias/upload   (multipart/form-data, header Location-Id)
 *
 * Body shape (multipart):
 *   - file: archivo binario
 *   - hosted: false (lo subimos nosotros)
 *   - parentId: null (raíz de la media library)
 *
 * Scope requerido: `medias.write`.
 *
 * Idempotencia: `local_key = branding_asset.id`. El fingerprint cubre
 * file_path + size_bytes — si el cliente sube el mismo archivo de nuevo,
 * lo re-subimos solo si tamaño cambió.
 */
import type { LocationContext, ProvisionInput, StepResult } from "../types";
import {
  decideAction,
  fingerprint,
  upsertResourceRecord,
} from "../idempotency";
import { supabaseAdmin } from "@/lib/supabase/server";

const RESOURCE_KIND = "media";
const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";
const STORAGE_BUCKET = "branding-assets";

interface BrandingAssetRow {
  id: string;
  kind: string;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  file_path: string;
}

interface GhlMediaUploadResponse {
  fileId?: string;
  url?: string;
  uploadedBy?: string;
}

export async function stepMedia(
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

  const sb = supabaseAdmin();

  // Listamos los branding_assets del proyecto.
  const { data: assets, error: assetsErr } = await sb
    .from("branding_assets")
    .select("id, kind, original_name, mime_type, size_bytes, file_path")
    .eq("project_id", input.project_id);

  if (assetsErr) {
    return {
      step: "media",
      status: "error",
      created: 0,
      updated: 0,
      skipped: 0,
      duration_ms: Date.now() - started,
      error_message: `db_error: ${assetsErr.message}`,
    };
  }

  if (!assets || assets.length === 0) {
    return {
      step: "media",
      status: "skipped",
      created: 0,
      updated: 0,
      skipped: 0,
      duration_ms: Date.now() - started,
    };
  }

  for (const asset of assets as BrandingAssetRow[]) {
    const local_key = asset.id;
    const payload = {
      file_path: asset.file_path,
      size_bytes: asset.size_bytes ?? 0,
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

    // Bajamos el archivo de Supabase Storage.
    const { data: blob, error: dlErr } = await sb.storage
      .from(STORAGE_BUCKET)
      .download(asset.file_path);

    if (dlErr || !blob) {
      hadError = true;
      items.push({
        local_key,
        action: "error",
        error: `Supabase download falló: ${dlErr?.message ?? "no body"}`,
      });
      continue;
    }

    // Subimos a GHL via multipart/form-data.
    try {
      const form = new FormData();
      form.append("file", blob, asset.original_name ?? `asset-${asset.id}`);
      form.append("hosted", "false");
      form.append("name", asset.original_name ?? `Kwiq · ${asset.kind}`);
      form.append("locationId", ctx.location_id);

      const res = await fetch(`${GHL_BASE_URL}/medias/upload-file`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.pit}`,
          Version: GHL_API_VERSION,
          // NO seteamos Content-Type — fetch lo arma con el boundary.
        },
        body: form,
      });

      if (!res.ok) {
        let msg = res.statusText;
        try {
          const body = (await res.json()) as { message?: string };
          msg = body.message ?? msg;
        } catch {
          // ignore
        }
        hadError = true;
        items.push({
          local_key,
          action: "error",
          error: `POST ${res.status}: ${msg}`,
        });
        continue;
      }

      const data = (await res.json().catch(() => ({}))) as GhlMediaUploadResponse;
      const ext = data.fileId ?? "";
      if (!ext) {
        // Algunos endpoints de GHL no devuelven fileId — usamos la URL como ext.
        const fallback = data.url ?? "";
        if (!fallback) {
          hadError = true;
          items.push({
            local_key,
            action: "error",
            error: "GHL no devolvió fileId ni url en POST media",
          });
          continue;
        }
        await upsertResourceRecord(
          input.project_id,
          RESOURCE_KIND,
          local_key,
          fallback,
          fp,
          run_id,
        );
      } else {
        await upsertResourceRecord(
          input.project_id,
          RESOURCE_KIND,
          local_key,
          ext,
          fp,
          run_id,
        );
      }

      if (decision.action === "create") created++;
      else updated++;
      items.push({
        local_key,
        action: decision.action,
        external_id: ext || data.url,
      });
    } catch (err) {
      hadError = true;
      items.push({
        local_key,
        action: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    step: "media",
    status: hadError ? "error" : "ok",
    created,
    updated,
    skipped,
    duration_ms: Date.now() - started,
    items,
  };
}
