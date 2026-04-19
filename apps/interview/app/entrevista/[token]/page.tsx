import { notFound } from "next/navigation";
import { Chat } from "@/components/chat";
import { getSectionById } from "@/lib/interview-schema";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function InterviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const sb = supabaseAdmin();

  const { data: session } = await sb
    .from("interview_sessions")
    .select("id, session_token, current_section_id, status")
    .eq("session_token", token)
    .single();

  if (!session) notFound();

  const sectionId = session.current_section_id ?? "contexto_general";
  const section = getSectionById(sectionId);

  const { data: turns } = await sb
    .from("interview_turns")
    .select("turn_index, role, content, section_id, meta")
    .eq("session_id", session.id)
    .in("role", ["user", "assistant"])
    .order("turn_index", { ascending: true });

  const initialMessages = (turns ?? []).map((t) => ({
    role: t.role as "user" | "assistant",
    content: t.content,
    sectionId: t.section_id ?? undefined,
    status: (t.meta as { status?: "in_progress" | "section_complete" | "need_clarification" } | null)?.status,
  }));

  return (
    <Chat
      token={token}
      sectionId={sectionId}
      initialMessages={initialMessages}
      initialSectionTitle={section?.title ?? sectionId}
    />
  );
}
