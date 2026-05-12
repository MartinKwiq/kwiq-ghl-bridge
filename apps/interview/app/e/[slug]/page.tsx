/**
 * Ruta pública de entrada al onboarding de un proyecto.
 *
 *   /e/{slug}
 *
 * Es el link que el admin le manda al cliente desde el panel del proyecto.
 * Esta ruta NO renderiza UI propia — actúa como un router de auth que
 * deriva al destino correcto según el rol del usuario:
 *
 *  - sin sesión               → /interview/login
 *  - admin (kwiq_admins)      → /admin/proyectos/{slug}
 *  - cliente (interview-user) → /interview (landing del cliente)
 *  - autenticado otra cosa    → /interview/login
 *
 * Si el slug no existe, redirige al landing del cliente para no exponer
 * info de tenants. El admin nunca debería ver este 404 porque el botón
 * solo se renderiza para slugs reales.
 */
import { redirect } from "next/navigation";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProjectInterviewEntry({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();

  // Sin sesión → al login del cliente. Adjuntamos `next` para que
  // después del login lo devolvamos al entry-point del proyecto.
  if (!auth?.user) {
    const next = encodeURIComponent(`/e/${slug}`);
    redirect(`/interview/login?next=${next}`);
  }

  const admin = supabaseAdmin();

  // Verificar que el proyecto existe (no exponer info si no existe).
  const { data: project } = await admin
    .from("kwiq_projects")
    .select("id, slug, client_name")
    .eq("slug", slug)
    .maybeSingle();

  if (!project) {
    redirect("/interview");
  }

  // Si es admin (Kwiq), al panel del proyecto.
  const { data: adminRow } = await admin
    .from("kwiq_admins")
    .select("user_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (adminRow) {
    redirect(`/admin/proyectos/${slug}`);
  }

  // Si es cliente (interview-user) asociado a este proyecto, al landing.
  const { data: client } = await admin
    .from("kwiq_interview_users")
    .select("user_id, project_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (client) {
    // Si el cliente está asociado a OTRO proyecto, igualmente lo mandamos
    // al landing — desde ahí solo ve sus propias entrevistas. No exponemos
    // el mismatch.
    redirect("/interview");
  }

  // Autenticado pero no es ni admin ni interview-user (caso raro):
  // forzar login limpio.
  redirect("/interview/login");
}
