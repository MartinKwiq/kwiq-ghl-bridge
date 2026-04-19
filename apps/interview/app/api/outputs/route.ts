import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generateAndPersistOutputs } from "@/lib/generators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ token: z.string().min(8).max(64) });

/**
 * POST /api/outputs
 * Genera (o regenera) los outputs de la entrevista:
 *   - ghl_autoconfig_json: JSON listo para alimentar al aprovisionador de GHL
 *   - conversation_ai_prompt: prompt del agente Conversation AI
 *
 * Se puede invocar en cualquier momento de la entrevista; cada llamada crea
 * una nueva versión en `derived_outputs`.
 */
export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: "invalid_body", details: String(err) }, { status: 400 });
  }

  try {
    const out = await generateAndPersistOutputs(body.token);
    return NextResponse.json(out, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/outputs] error:", msg);
    return NextResponse.json({ error: "outputs_failed", details: msg }, { status: 500 });
  }
}
