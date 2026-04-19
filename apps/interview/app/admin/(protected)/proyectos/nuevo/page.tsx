import Link from "next/link";
import { NewProjectForm } from "@/components/admin/new-project-form";

export const dynamic = "force-dynamic";

/**
 * /admin/proyectos/nuevo — alta de un cliente Kwiq.
 *
 * Renderiza solo el formulario (client component). El POST /api/admin/proyectos
 * cifra el PIT con lib/crypto.ts y crea el proyecto en kwiq_projects.
 */
export default function NewProjectPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-kwiq-muted">
          Admin · proyectos · nuevo
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold uppercase tracking-wide">
          Crear proyecto
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-kwiq-muted">
          Cargá los datos del cliente y las credenciales GHL. Después podés
          copiar el link de entrevista y mandárselo. Las credenciales se
          cifran antes de guardarse — ningún admin las vuelve a ver en claro.
        </p>
      </div>

      <div className="rounded-2xl border border-kwiq-border bg-kwiq-panel/40 p-6">
        <NewProjectForm />
      </div>

      <div className="flex items-center justify-between text-xs text-kwiq-muted">
        <Link href="/admin/proyectos" className="hover:text-kwiq-text">
          ← Volver al listado
        </Link>
        <span>
          Tip: el slug se usa en la URL de la entrevista (
          <code className="font-mono">/e/&lt;slug&gt;</code>).
        </span>
      </div>
    </div>
  );
}
