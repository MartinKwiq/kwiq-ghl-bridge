import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { OutputsView } from "@/components/outputs-view";

export const dynamic = "force-dynamic";

export default async function OutputsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const sb = supabaseAdmin();

  const { data: session } = await sb
    .from("interview_sessions")
    .select("id, company_name")
    .eq("session_token", token)
    .single();
  if (!session) notFound();

  const { data: outputs } = await sb
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
