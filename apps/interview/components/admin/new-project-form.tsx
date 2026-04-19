"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type AuthMode = "pit_agency" | "pit_location" | "oauth_marketplace";

/**
 * Formulario para crear un nuevo proyecto Kwiq.
 *
 * Flujo:
 *  1. El admin elige el modo de auth (agencia / sub-cuenta / OAuth).
 *  2. Según el modo, pedimos las credenciales necesarias.
 *  3. POST a /api/admin/proyectos — el server cifra el PIT con lib/crypto.ts.
 *  4. Redirigimos al detalle del proyecto para arrancar la entrevista.
 */
export function NewProjectForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clientName, setClientName] = useState("");
  const [slug, setSlug] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("pit_agency");
  const [locationId, setLocationId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [pit, setPit] = useState("");
  const [notes, setNotes] = useState("");

  function autoSlug(name: string) {
    const next = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 48);
    setSlug(next);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        client_name: clientName.trim(),
        slug: slug.trim(),
        contact_email: contactEmail.trim() || null,
        auth_mode: authMode,
        ghl_location_id: locationId.trim() || null,
        ghl_company_id: companyId.trim() || null,
        notes: notes.trim() || null,
      };
      // Solo enviamos el PIT si corresponde al modo (evita mandar strings vacíos).
      if (authMode === "pit_location") {
        payload.ghl_pit = pit.trim();
      }

      const res = await fetch("/api/admin/proyectos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await res.json().catch(() => ({}))) as {
        slug?: string;
        error?: string;
        detail?: string;
      };

      if (!res.ok) {
        setError(
          body.detail ||
            errorLabel(body.error) ||
            "No pudimos crear el proyecto. Probá de nuevo.",
        );
        return;
      }

      router.replace(`/admin/proyectos/${body.slug ?? slug}`);
      router.refresh();
    } catch {
      setError("No pudimos conectar con el servidor. Revisá la red.");
    } finally {
      setLoading(false);
    }
  }

  const needsPit = authMode === "pit_location";
  const needsLocation =
    authMode === "pit_location" || authMode === "oauth_marketplace";

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre del cliente" hint="Como lo llamamos internamente.">
          <input
            type="text"
            required
            maxLength={120}
            value={clientName}
            onChange={(e) => {
              setClientName(e.target.value);
              if (!slug) autoSlug(e.target.value);
            }}
            placeholder="Acme Beauty SRL"
            className={inputCls}
          />
        </Field>

        <Field
          label="Slug"
          hint="Se usa en la URL del link de entrevista. Solo a–z, 0–9 y guiones."
        >
          <input
            type="text"
            required
            pattern="[a-z0-9][a-z0-9-]{1,47}"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="acme-beauty"
            className={inputCls + " font-mono"}
          />
        </Field>

        <Field label="Email de contacto" hint="Opcional — para notificaciones.">
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="ceo@acme.com"
            className={inputCls}
          />
        </Field>

        <Field
          label="Modo de autenticación GHL"
          hint={
            authMode === "pit_agency"
              ? "PIT de agencia (Kwiq) — usa GHL_AGENCY_PIT del .env."
              : authMode === "pit_location"
                ? "PIT de sub-cuenta — para clientes con GHL propio."
                : "OAuth Marketplace — para instalaciones self-service."
          }
        >
          <select
            value={authMode}
            onChange={(e) => setAuthMode(e.target.value as AuthMode)}
            className={inputCls}
          >
            <option value="pit_agency">PIT agencia (Kwiq)</option>
            <option value="pit_location">PIT sub-cuenta (cliente)</option>
            <option value="oauth_marketplace">OAuth Marketplace</option>
          </select>
        </Field>
      </section>

      <section className="grid gap-4 rounded-xl border border-kwiq-border bg-kwiq-bg/40 p-4 sm:grid-cols-2">
        <Field
          label={needsLocation ? "Location ID (obligatorio)" : "Location ID"}
          hint="El id de la sub-cuenta de GHL. Se puede agregar después."
        >
          <input
            type="text"
            required={needsLocation}
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            placeholder="locXXXXXXXXXXXX"
            className={inputCls + " font-mono"}
          />
        </Field>

        <Field
          label="Company ID (opcional)"
          hint="Agency ID — solo si lo tenés a mano."
        >
          <input
            type="text"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            placeholder="compXXXXXXXXXXXX"
            className={inputCls + " font-mono"}
          />
        </Field>

        {needsPit && (
          <Field
            label="PIT de sub-cuenta"
            hint="Se guarda cifrado con AES-256-GCM. Solo verás los últimos 4 chars después."
          >
            <input
              type="password"
              required
              value={pit}
              onChange={(e) => setPit(e.target.value)}
              placeholder="pit-xxxxxxxxxxxxxxxx"
              autoComplete="off"
              className={inputCls + " font-mono"}
            />
          </Field>
        )}
      </section>

      <Field label="Notas internas" hint="Opcional — contexto para el equipo.">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Cliente de Juan. Tiene calendario propio en GHL."
          className={inputCls + " resize-none"}
        />
      </Field>

      {error && (
        <div className="rounded-md border border-kwiq-err/40 bg-kwiq-err/10 px-3 py-2 text-sm text-kwiq-err">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading || !clientName || !slug}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition",
            loading || !clientName || !slug
              ? "bg-kwiq-border text-kwiq-muted"
              : "bg-kwiq-accent text-kwiq-bg hover:bg-kwiq-accentHover",
          )}
        >
          {loading ? "Creando…" : "Crear proyecto"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-kwiq-border px-4 py-2 text-sm text-kwiq-muted hover:text-kwiq-text"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "rounded-lg border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 text-sm outline-none focus:border-kwiq-accent";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-kwiq-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-kwiq-muted/80">{hint}</span>}
    </label>
  );
}

function errorLabel(code?: string): string | null {
  switch (code) {
    case "slug_taken":
      return "Ese slug ya existe. Elegí otro.";
    case "invalid_body":
      return "Faltan datos o hay un formato inválido.";
    case "missing_pit":
      return "Para PIT sub-cuenta tenés que pegar el token del cliente.";
    case "missing_location":
      return "En este modo necesitamos el Location ID.";
    case "not_admin":
      return "Tu usuario no tiene permisos de admin.";
    default:
      return null;
  }
}
