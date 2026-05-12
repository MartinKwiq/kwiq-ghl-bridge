import { notFound, redirect } from "next/navigation";
import { Chat, type ChatSection } from "@/components/chat";
import { InterviewCompletedScreen } from "@/components/interview/completed-screen";
import { getSectionById, sectionOrder } from "@/lib/interview-schema";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * /entrevista/[token]
 *
 * Pantalla del chat. La usa el cliente logueado para conversar con el
 * asistente Kwiq. Reglas de acceso:
 *
 *  1) El usuario debe estar logueado. Si no, redirect a /interview/login
 *     conservando el destino para volver acá después del login.
 *
 *  2) La sesión debe estar vinculada a `user_id` y/o `project_id`. Las
 *     sesiones del flow legacy anónimo (sin user_id ni project_id) ya no
 *     se pueden abrir — están bloqueadas. Si querés rescatar una, usá un
 *     UPDATE en DB para asignarle project_id (como hicimos con la de
 *     Porfirio para Axioma).
 *
 *  3) El usuario logueado debe ser:
 *       - el dueño de la sesión (`session.user_id == auth.uid()`), o
 *       - un admin Kwiq (puede revisar cualquier sesión).
 *
 *     Si no cumple ninguno de los dos, mostramos 404 (mejor que 403 para
 *     no filtrar la existencia del token).
 */
export default async function InterviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // 1) Auth.
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) {
    const next = encodeURIComponent(`/entrevista/${token}`);
    redirect(`/interview/login?next=${next}`);
  }

  const admin = supabaseAdmin();

  const { data: session } = await admin
    .from("interview_sessions")
    .select(
      "id, session_token, current_section_id, status, completed_section_ids, completed_at, user_id, project_id",
    )
    .eq("session_token", token)
    .maybeSingle();

  if (!session) notFound();

  // 2) Sesiones huérfanas (legacy anónimo) → bloqueadas.
  if (!session.user_id && !session.project_id) {
    notFound();
  }

  // 3) Owner check (con bypass para admins Kwiq).
  const isOwner = session.user_id === auth.user.id;
  let isAdmin = false;
  if (!isOwner) {
    const { data: adminRow } = await admin
      .from("kwiq_admins")
      .select("user_id")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    isAdmin = !!adminRow;
  }

  if (!isOwner && !isAdmin) {
    notFound();
  }

  // Si la entrevista ya está completada → pantalla de cierre en lugar
  // del chat. Sirve para que el cliente sepa qué pasa después y no
  // quede flotando dentro del chat de una sesión terminada.
  if (session.status === "completed" || session.completed_at) {
    // Resolvemos el nombre del cliente (si existe en kwiq_interview_users).
    let clientName: string | null = null;
    if (session.user_id) {
      const { data: clientRow } = await admin
        .from("kwiq_interview_users")
        .select("display_name, company_name")
        .eq("user_id", session.user_id)
        .maybeSingle();
      clientName =
        clientRow?.display_name ?? clientRow?.company_name ?? null;
    }
    return (
      <InterviewCompletedScreen
        clientName={clientName}
        completedAt={session.completed_at}
      />
    );
  }

  // Auto-resume: si la sesión estaba pausada y el cliente llegó al chat,
  // la reactivamos antes de renderizar. No bloqueamos si falla — el engine
  // acepta turnos sobre sesiones paused de todas formas.
  if (session.status === "paused") {
    await admin
      .from("interview_sessions")
      .update({
        status: "in_progress",
        resumed_at: new Date().toISOString(),
      })
      .eq("id", session.id);
  }

  const sectionId = session.current_section_id ?? "contexto_general";
  const section = getSectionById(sectionId);

  // Schema completo para la barra de progreso del chat.
  const sections: ChatSection[] = sectionOrder().map((s) => ({
    id: s.id,
    title: s.title,
    order: s.order,
  }));

  const { data: turns } = await admin
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
      sections={sections}
      completedSectionIds={session.completed_section_ids ?? []}
    />
  );
}
