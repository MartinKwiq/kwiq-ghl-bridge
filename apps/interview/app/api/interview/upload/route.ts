import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB — debe coincidir con storage.buckets.file_size_limit

const KIND_VALUES = ["logo", "palette", "font", "brandbook", "other"] as const;
type AssetKind = (typeof KIND_VALUES)[number];

function isAssetKind(v: unknown): v is AssetKind {
  return typeof v === "string" && (KIND_VALUES as readonly string[]).includes(v);
}

/**
 * Quita caracteres raros para que el path sea seguro en el bucket.
 * Mantiene la extensión y el stem del nombre.
 */
function sanitizeFileName(name: string): string {
  const clean = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita diacríticos
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean.slice(0, 120) || "file";
}

/**
 * POST /api/interview/upload
 *
 * Body: multipart/form-data con:
 *   - token:    string  (session_token de la entrevista)
 *   - kind:     logo | palette | font | brandbook | other
 *   - file:     Blob
 *
 * Devuelve: { id, file_path, kind, original_name, size_bytes, mime_type }
 *
 * Uso: el componente BrandingUploader del chat sube directo acá — todo pasa por
 * service_role, así que el cliente nunca toca Storage ni la DB a mano.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_body", details: String(err) },
      { status: 400 },
    );
  }

  const token = form.get("token");
  const kind = form.get("kind");
  const file = form.get("file");

  if (typeof token !== "string" || token.length < 8 || token.length > 64) {
    return NextResponse.json(
      { error: "invalid_token" },
      { status: 400 },
    );
  }

  if (!isAssetKind(kind)) {
    return NextResponse.json(
      { error: "invalid_kind", details: `kind debe ser uno de: ${KIND_VALUES.join(", ")}` },
      { status: 400 },
    );
  }

  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { error: "missing_file", details: "Falta el campo `file` en el form-data." },
      { status: 400 },
    );
  }

  const size = file.size;
  if (!size) {
    return NextResponse.json(
      { error: "empty_file" },
      { status: 400 },
    );
  }
  if (size > MAX_BYTES) {
    return NextResponse.json(
      { error: "file_too_large", details: `Máximo ${Math.floor(MAX_BYTES / (1024 * 1024))} MB.` },
      { status: 413 },
    );
  }

  // FormData devuelve File (que extiende Blob) cuando el field viene de un <input type="file">.
  // No hacemos `instanceof File` porque ese global no siempre está en el lib de TS.
  const maybeName = (file as Blob & { name?: unknown }).name;
  const originalName =
    typeof maybeName === "string" && maybeName.length > 0 ? maybeName : "upload";
  const mimeType = file.type || "application/octet-stream";

  const sb = supabaseAdmin();

  // 1) Validar sesión y recuperar project_id.
  const { data: session, error: sessionErr } = await sb
    .from("interview_sessions")
    .select("id, project_id, status, owner_email")
    .eq("session_token", token)
    .maybeSingle();

  if (sessionErr || !session) {
    return NextResponse.json(
      { error: "session_not_found" },
      { status: 404 },
    );
  }

  // No bloqueamos estrictamente — permitir subir aunque la sesión esté completed,
  // por si el cliente tardó en mandar el logo. Solo rechazamos si fue archivada.
  if (session.status === "archived") {
    return NextResponse.json(
      { error: "session_archived" },
      { status: 409 },
    );
  }

  if (!session.project_id) {
    return NextResponse.json(
      { error: "session_without_project", details: "La sesión no está asociada a ningún proyecto." },
      { status: 409 },
    );
  }

  // 2) Subir el binario al bucket `branding`.
  const assetId = randomUUID();
  const safeName = sanitizeFileName(originalName);
  const filePath = `${session.project_id}/${kind}/${assetId}-${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await sb.storage
    .from("branding")
    .upload(filePath, buffer, {
      contentType: mimeType,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json(
      { error: "upload_failed", details: uploadErr.message },
      { status: 500 },
    );
  }

  // 3) Insertar metadata en branding_assets.
  const { data: asset, error: insertErr } = await sb
    .from("branding_assets")
    .insert({
      id: assetId,
      project_id: session.project_id,
      session_id: session.id,
      kind,
      file_path: filePath,
      mime_type: mimeType,
      original_name: originalName,
      size_bytes: size,
      uploaded_by_email: session.owner_email ?? null,
    })
    .select("id, kind, file_path, mime_type, original_name, size_bytes, uploaded_at")
    .single();

  if (insertErr) {
    // Rollback manual: borrar el objeto subido.
    await sb.storage.from("branding").remove([filePath]).catch(() => {});
    return NextResponse.json(
      { error: "insert_failed", details: insertErr.message },
      { status: 500 },
    );
  }

  // 4) Persistir un turn assistant que confirme la recepción del archivo.
  //
  //    Antes el UI generaba un mensaje "Recibí tu archivo de X" como bubble
  //    pero NO se persistía en interview_turns. Resultado: cuando el cliente
  //    luego escribía algo, /api/chat reconstruía el history desde DB sin
  //    esos mensajes y procesaba con contexto inconsistente. Además, si el
  //    cliente recargaba la página, los mensajes de upload desaparecían.
  //
  //    Ahora cada upload exitoso queda como un turn real (role: assistant,
  //    section_id: branding) con el mismo copy que el UI venía mostrando.
  //    Esto mantiene el history coherente con lo que ve el cliente y
  //    permite que el chat siga procesando bien aunque haya múltiples
  //    archivos en juego.
  //
  //    Cálculo del turn_index: MAX + 1 igual que en interview-engine.ts.
  //    No bloqueamos el response del upload si falla esta persistencia —
  //    el archivo ya quedó guardado.
  try {
    const kindLabel =
      kind === "logo"
        ? "logo"
        : kind === "palette"
          ? "paleta"
          : kind === "font"
            ? "tipografía"
            : kind === "brandbook"
              ? "brandbook"
              : "archivo";
    const { data: maxTurnRow } = await sb
      .from("interview_turns")
      .select("turn_index")
      .eq("session_id", session.id)
      .order("turn_index", { ascending: false })
      .limit(1);
    const nextTurnIndex = ((maxTurnRow?.[0]?.turn_index as number | undefined) ?? -1) + 1;
    await sb.from("interview_turns").insert({
      session_id: session.id,
      turn_index: nextTurnIndex,
      role: "assistant",
      content: `Recibí tu archivo de ${kindLabel}: ${originalName}. Lo guardé en el proyecto — seguimos.`,
      section_id: "branding",
      meta: {
        status: "in_progress",
        asset_id: assetId,
        asset_kind: kind,
        from_upload: true,
      },
    });
  } catch (err) {
    // No abortamos el upload por esto — solo dejamos rastro.
    // eslint-disable-next-line no-console
    console.error("[/api/interview/upload] failed to persist confirmation turn:", err);
  }

  return NextResponse.json({ asset }, { status: 200 });
}
