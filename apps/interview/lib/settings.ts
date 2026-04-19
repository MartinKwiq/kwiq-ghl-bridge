/**
 * kwiq_settings — config no-code en DB.
 *
 * Toda la configuración que el admin puede cambiar desde la UI (PIT de
 * agencia, keys de Marketplace, API keys de LLM, etc.) vive en esta tabla.
 * Los secretos se cifran con AES-256-GCM (lib/crypto.ts) antes de guardarse.
 *
 * Claves bien-conocidas (ver migración `kwiq_settings`):
 *   ghl.agency_pit                (secret)
 *   ghl.agency_company_id         (plain)
 *   ghl.marketplace.client_id     (plain)
 *   ghl.marketplace.client_secret (secret)
 *   ghl.marketplace.redirect_uri  (plain)
 *   llm.provider                  (plain)
 *   llm.model                     (plain)
 *   llm.gemini_api_key            (secret)
 *   app.public_url                (plain)
 *
 * USO:
 *   const pit = await getSetting("ghl.agency_pit");  // string | null (descifrado)
 *   await setSetting("ghl.agency_pit", "pit-xxxx", { userId });
 *
 * SERVER-SIDE ONLY.
 */
import { supabaseAdmin } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret, maskSecretTail } from "@/lib/crypto";

/**
 * Lee un setting y lo descifra si corresponde. Devuelve `null` si no existe
 * o si está vacío.
 */
export async function getSetting(key: string): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("kwiq_settings")
    .select("value, value_enc, is_secret")
    .eq("key", key)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.error(`[settings.get] ${key}`, error);
    return null;
  }
  if (!data) return null;
  if (data.is_secret) {
    if (!data.value_enc) return null;
    try {
      return decryptSecret(data.value_enc);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[settings.get] decrypt ${key} falló:`, err);
      return null;
    }
  }
  return data.value ?? null;
}

/**
 * Guarda un setting. Si la fila está marcada como `is_secret`, el valor se
 * cifra antes de escribir. Pasar `null` borra el valor (vuelve a estado "no
 * configurado" pero sin eliminar la fila — así conservamos la descripción).
 */
export async function setSetting(
  key: string,
  plaintext: string | null,
  opts?: { userId?: string | null },
): Promise<void> {
  const sb = supabaseAdmin();

  // Necesitamos saber si es secreto. Leer la fila actual; si no existe,
  // insertamos asumiendo plaintext (el admin puede declarar secretos solo
  // vía seed).
  const { data: row } = await sb
    .from("kwiq_settings")
    .select("is_secret")
    .eq("key", key)
    .maybeSingle();

  const isSecret = Boolean(row?.is_secret);

  const payload: Record<string, unknown> = {
    key,
    is_secret: isSecret,
    updated_by: opts?.userId ?? null,
    updated_at: new Date().toISOString(),
  };

  if (plaintext == null || plaintext.trim().length === 0) {
    payload.value = null;
    payload.value_enc = null;
  } else if (isSecret) {
    payload.value = null;
    payload.value_enc = encryptSecret(plaintext.trim());
  } else {
    payload.value = plaintext.trim();
    payload.value_enc = null;
  }

  const { error } = await sb
    .from("kwiq_settings")
    .upsert(payload, { onConflict: "key" });
  if (error) {
    // eslint-disable-next-line no-console
    console.error(`[settings.set] ${key}`, error);
    throw new Error(`No se pudo guardar el setting "${key}".`);
  }
}

/**
 * Metadata de una fila de settings — sin el secreto en claro. Pensado para
 * renderizar la UI de /admin/ajustes.
 */
export type SettingSummary = {
  key: string;
  is_secret: boolean;
  description: string | null;
  updated_at: string;
  present: boolean;        // tiene valor?
  preview: string | null;  // últimos 4 chars si es secreto, valor completo si no
};

export async function listSettings(): Promise<SettingSummary[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("kwiq_settings")
    .select("key, value, value_enc, is_secret, description, updated_at")
    .order("key", { ascending: true });
  if (error || !data) {
    if (error) console.error("[settings.list]", error);
    return [];
  }
  return data.map((r) => {
    const present = r.is_secret ? Boolean(r.value_enc) : Boolean(r.value);
    let preview: string | null = null;
    if (present) {
      if (r.is_secret && r.value_enc) {
        try {
          preview = maskSecretTail(decryptSecret(r.value_enc));
        } catch {
          preview = "— error desencriptando —";
        }
      } else {
        preview = r.value;
      }
    }
    return {
      key: r.key,
      is_secret: r.is_secret,
      description: r.description,
      updated_at: r.updated_at,
      present,
      preview,
    };
  });
}

/**
 * Resuelve un setting con fallback a env var (útil durante migración gradual
 * y para claves que siguen viviendo en el entorno — ej. SUPABASE_SERVICE_ROLE_KEY).
 *
 * Prioridad: DB → env var. Devuelve `null` si ninguno tiene valor.
 */
export async function getSettingWithEnvFallback(
  key: string,
  envVar: string,
): Promise<string | null> {
  const dbVal = await getSetting(key);
  if (dbVal) return dbVal;
  const envVal = process.env[envVar];
  return envVal && envVal.trim().length > 0 ? envVal.trim() : null;
}
