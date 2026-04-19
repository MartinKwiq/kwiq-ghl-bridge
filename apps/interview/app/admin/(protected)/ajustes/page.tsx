import Link from "next/link";
import { listSettings } from "@/lib/settings";
import { SettingsEditor } from "@/components/admin/settings-editor";
import { PasswordChangeCard } from "@/components/admin/password-change-card";

export const dynamic = "force-dynamic";

/**
 * /admin/ajustes — configuración no-code.
 *
 * Todo lo que antes estaba en .env (menos las 4 llaves fundacionales) se
 * edita desde acá:
 *   - Contraseña del admin (Supabase Auth).
 *   - GHL agency PIT + company id.
 *   - GHL Marketplace (client id / secret / redirect).
 *   - LLM (provider, modelo, API key).
 *   - URL pública de la app.
 *
 * Los secretos se muestran enmascarados (últimos 4 chars) y se cifran antes
 * de guardarse con AES-256-GCM.
 */
export default async function SettingsPage() {
  const settings = await listSettings();

  // Agrupamos por "sección" derivando del prefijo de la key.
  const groups: Record<string, typeof settings> = {};
  for (const s of settings) {
    const section = s.key.split(".")[0] || "otros";
    (groups[section] ||= []).push(s);
  }

  const sectionTitles: Record<string, string> = {
    ghl: "GoHighLevel",
    llm: "Modelo de lenguaje",
    app: "App",
    otros: "Otros",
  };

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="text-xs uppercase tracking-[0.18em] text-kwiq-muted">
          Admin · ajustes
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold uppercase tracking-wide">
          Ajustes
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-kwiq-muted">
          Todo se guarda cifrado en tu base de datos. No hace falta tocar
          código ni variables de entorno.
        </p>
      </section>

      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-kwiq-muted">
          Mi cuenta
        </h2>
        <PasswordChangeCard />
      </section>

      {Object.entries(groups).map(([section, rows]) => (
        <section key={section}>
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-kwiq-muted">
            {sectionTitles[section] ?? section}
          </h2>
          <SettingsEditor rows={rows} />
        </section>
      ))}

      <div className="text-xs text-kwiq-muted">
        <Link href="/admin" className="hover:text-kwiq-text">
          ← Volver al dashboard
        </Link>
      </div>
    </div>
  );
}
