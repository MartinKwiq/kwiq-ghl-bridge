import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleUserTurn } from "@/lib/interview-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  token: z.string().min(8).max(64),
  message: z.string().min(1).max(4000),
  record_index: z.number().int().nonnegative().optional(),
});

/**
 * POST /api/chat
 * Recibe un turno del usuario y devuelve el próximo turno del assistant
 * junto con datos extraídos y status de la sección.
 *
 * Nota: por simplicidad de MVP usamos request/response (no streaming).
 * Se puede migrar a SSE/ReadableStream cuando queramos UX typewriter.
 */
export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    const raw = await req.json();
    body = BodySchema.parse(raw);
  } catch (err) {
    return NextResponse.json({ error: "invalid_body", details: String(err) }, { status: 400 });
  }

  try {
    const result = await handleUserTurn({
      sessionToken: body.token,
      userMessage: body.message,
      recordIndexOverride: body.record_index,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/chat] error:", msg);
    return NextResponse.json({ error: "chat_failed", details: msg }, { status: 500 });
  }
}
