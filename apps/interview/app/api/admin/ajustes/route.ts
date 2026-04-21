import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { setSetting } from "@/lib/settings";
import { decryptSecret, maskSecretTail } from "@/lib/crypto";
import { requireAdminRole } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  key: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9][a-z0-9._]*$/, "key_invalid"),
  value: z.union([z.string().max(4000), z.null()]).optional(),
});

/**
 * POST /api/admin/ajustes
 *
 * Actualiza una fila de kwiq_settings. Requiere admin logueado.
 * Devuelve el resumen (nunca el valor en claro si es secreto).
 */
export async function POST(req: Request) {
  // Ajustes globales (PIT, API keys, encryption key) son secretos del sistema:
  // solo el rol `owner` puede tocarlos.
  const me = await requireAdminRole(["owner"]);
  if (!me.ok) {
    return NextResponse.json(
      { error: me.error, message: me.message },
      { status: me.status },
    );
  }
  const admin = supabaseAdmin();

  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_body",
        detail: err instanceof z.ZodError ? err.issues[0]?.message : undefined,
      },
      { status: 400 },
    );
  }

  const valueOrNull = parsed.value == null ? null : parsed.value;

  try {
    await setSetting(parsed.key, valueOrNull, { userId: me.userId });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[admin/ajustes] set error", err);
    return NextResponse.json(
      {
        error: "set_failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  // Releer para devolver summary.
  const { data: row } = await admin
    .from("kwiq_settings")
    .select("key, value, value_enc, is_secret, description, updated_at")
    .eq("key", parsed.key)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ ok: true, row: null });
  }

  const present = row.is_secret ? Boolean(row.value_enc) : Boolean(row.value);
  let preview: string | null = null;
  if (present) {
    if (row.is_secret && row.value_enc) {
      try {
        preview = maskSecretTail(decryptSecret(row.value_enc));
      } catch {
        preview = "— error desencriptando —";
      }
    } else {
      preview = row.value;
    }
  }

  return NextResponse.json({
    ok: true,
    row: {
      key: row.key,
      is_secret: row.is_secret,
      description: row.description,
      updated_at: row.updated_at,
      present,
      preview,
    },
  });
}
