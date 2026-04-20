import Link from "next/link";
import { listSettings } from "@/lib/settings";
import { SettingsEditor } from "@/components/admin/settings-editor";
import { PasswordChangeCard } from "@/components/admin/password-change-card";
import { PitDiagnosticsCard } from "@/components/admin/pit-diagnostics-card";

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
          {section === "ghl" && (
            <>
              <GhlScopesHint />
              <PitDiagnosticsCard />
            </>
          )}
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

/**
 * Hint inline al pie del grupo "GoHighLevel" — lista los scopes que necesita
 * el PIT. Evita que el admin tenga que abrir los docs para saberlo.
 */
function GhlScopesHint() {
  const scopes: Array<{ name: string; uses: string }> = [
    { name: "snapshots.readonly", uses: "Panel Snapshots · aplicar snapshot" },
    { name: "locations.readonly", uses: "Panel Snapshots · listar sub-cuentas" },
    { name: "locations/customValues.readonly/.write", uses: "Conversation AI (capa 2)" },
    { name: "locations/customFields.readonly/.write", uses: "Campos desde la entrevista" },
    { name: "locations/tags.readonly/.write", uses: "Tags usados por workflows" },
  ];
  return (
    <div className="mb-3 rounded-xl border border-kwiq-border/60 bg-kwiq-panel/30 p-4 text-xs text-kwiq-muted">
      <p className="text-kwiq-text">
        Scopes mínimos a marcar al crear el Agency PIT
      </p>
      <ul className="mt-2 space-y-1">
        {scopes.map((s) => (
          <li key={s.name} className="flex flex-wrap items-baseline gap-x-2">
            <code className="font-mono text-[11px] text-kwiq-text">
              {s.name}
            </code>
            <span className="text-kwiq-muted">— {s.uses}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-kwiq-muted">
        Si un recurso devuelve 403 pero otros funcionan, casi siempre es un
        scope que no está grabado en el PIT. <strong>Importante:</strong>{" "}
        los scopes se graban dentro del token solo al emitirlo — tildar el
        checkbox en HighLevel y apretar "Save" no alcanza, hay que apretar{" "}
        <strong>"Regenerate Token"</strong> (o crear una llave nueva desde
        cero) y pegar el valor nuevo acá abajo. Usá la herramienta de
        diagnóstico que aparece más abajo para confirmar qué permisos tiene
        realmente la llave cargada.
      </p>
    </div>
  );
}
