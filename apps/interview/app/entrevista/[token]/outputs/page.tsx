import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { OutputsView } from "@/components/outputs-view";

export const dynamic = "force-dynamic";

/**
 * Página de outputs (JSON de configuración GHL + prompt Conversation AI).
 *
 * Es una vista interna — la usa el equipo Kwiq para revisar y aprovisionar
 * la sub-cuenta. NO debería ver el cliente final. Por eso restringimos a
 * admins Kwiq logueados; cualquier otro usuario recibe 404.
 *
 * Si querés mostrarle al cliente un "resumen de su entrevista" en algún
 * momento, lo armamos en otra ruta del flow `/interview` con un layout
 * más human-friendly que este JSON crudo.
 */
export default async function OutputsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) {
    const next = encodeURIComponent(`/entrevista/${token}/outputs`);
    redirect(`/admin/login?next=${next}`);
  }

  const admin = supabaseAdmin();

  // Solo admins Kwiq.
  const { data: adminRow } = await admin
    .from("kwiq_admins")
    .select("user_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!adminRow) {
    notFound();
  }

  const { data: session } = await admin
    .from("interview_sessions")
    .select("id, company_name")
    .eq("session_token", token)
    .maybeSingle();
  if (!session) notFound();

  const { data: outputs } = await admin
    .from("derived_outputs")
    .select("kind, version, content, created_at")
    .eq("session_id", session.id)
    .order("created_at", { ascending: false });

  const latestConfig = outputs?.find((o) => o.kind === "ghl_autoconfig_json");
  const latestPrompt = outputs?.find((o) => o.kind === "conversation_ai_prompt");

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-kwiq-muted">Kwiq · configuración</p>
          <h1 className="font-display text-3xl font-semibold uppercase tracking-wide">
            {session.company_name ?? "Tu Kwiq"} · lista para aplicar
          </h1>
        </div>
        <Link
          href={`/entrevista/${token}`}
          className="rounded-lg border border-kwiq-border px-3 py-2 text-sm hover:bg-kwiq-bg/40"
        >
          Volver al chat
        </Link>
      </div>

      <OutputsView
        token={token}
        initialConfig={latestConfig?.content as Record<string, unknown> | undefined}
        initialPrompt={(latestPrompt?.content as { prompt?: string } | undefined)?.prompt}
      />
    </main>
  );
}
