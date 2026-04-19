import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

/**
 * Shell del panel admin (/admin, /admin/proyectos, ...).
 *
 * El middleware ya verificó sesión + dominio @kwiq.io. Acá hacemos la última
 * check server-side contra `kwiq_admins` (usamos service_role para bypasear
 * RLS). Si el usuario no está en la allowlist, redirect a login.
 */
export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }
  if (!user.email?.toLowerCase().endsWith("@kwiq.io")) {
    redirect("/admin/login?error=domain");
  }

  const admin = supabaseAdmin();
  const { data: row } = await admin
    .from("kwiq_admins")
    .select("user_id, role, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!row) {
    redirect("/admin/login?error=not_admin");
  }

  return (
    <div className="min-h-screen bg-kwiq-bg text-kwiq-text">
      <header className="border-b border-kwiq-border bg-kwiq-panel/40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2"
            aria-label="Panel admin Kwiq"
          >
            <Logo variant="wordmark" size={28} />
            <span className="ml-2 rounded-md border border-kwiq-border bg-kwiq-bg/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-kwiq-muted">
              admin
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="text-kwiq-muted hover:text-kwiq-text">
              Dashboard
            </Link>
            <Link
              href="/admin/proyectos"
              className="text-kwiq-muted hover:text-kwiq-text"
            >
              Proyectos
            </Link>
            <Link
              href="/admin/ajustes"
              className="text-kwiq-muted hover:text-kwiq-text"
            >
              Ajustes
            </Link>
            <span className="hidden text-xs text-kwiq-muted sm:inline">
              {row.display_name ?? user.email}
            </span>
            <form action="/api/admin/logout" method="post">
              <button
                type="submit"
                className="rounded-lg border border-kwiq-border px-3 py-1 text-xs hover:bg-kwiq-bg/40"
              >
                Cerrar sesión
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
