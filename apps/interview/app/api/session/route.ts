import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { newSessionToken } from "@/lib/utils";
import { INTERVIEW } from "@/lib/interview-schema";
import { buildWelcomeMessage } from "@/lib/prompts";

export const runtime = "nodejs";

const BodySchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  ownerEmail: z.string().email().optional(),
  locale: z.string().default("es"),
});

/**
 * POST /api/session
 * Crea una nueva sesión de entrevista y devuelve su `session_token`.
 * La UI redirige a /entrevista/[token] después de llamar a este endpoint.
 */
export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    const raw = await req.json().catch(() => ({}));
    body = BodySchema.parse(raw);
  } catch (err) {
    return NextResponse.json({ error: "invalid_body", details: String(err) }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const token = newSessionToken();
  const firstSection = [...INTERVIEW.sections].sort((a, b) => a.order - b.order)[0]!;

  const { data, error } = await sb
    .from("interview_sessions")
    .insert({
      session_token: token,
      schema_version: INTERVIEW.version,
      status: "in_progress",
      current_section_id: firstSection.id,
      company_name: body.companyName ?? null,
      owner_email: body.ownerEmail ?? null,
      locale: body.locale,
    })
    .select("id, session_token, schema_version, current_section_id, company_name")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "supabase_insert_failed", details: error?.message }, { status: 500 });
  }

  // Saludo inicial (no requiere LLM).
  const welcome = buildWelcomeMessage(body.companyName);
  await sb.from("interview_turns").insert({
    session_id: data.id,
    turn_index: 0,
    role: "assistant",
    content: welcome,
    section_id: firstSection.id,
    meta: { seeded: true },
  });

  return NextResponse.json(
    {
      token: data.session_token,
      section_id: data.current_section_id,
      schema_version: data.schema_version,
      welcome,
    },
    { status: 201 },
  );
}
