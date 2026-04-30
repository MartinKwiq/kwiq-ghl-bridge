"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BUSINESS_NICHES,
  COUNTRIES,
  TIMEZONES,
  suggestTimezoneForCountry,
} from "@/lib/business-data";
import { LocationPicker } from "@/components/admin/location-picker";

type AuthMode = "pit_agency" | "pit_location" | "oauth_marketplace";

interface SnapshotOption {
  id: string;
  name: string;
}

/**
 * Formulario para crear un nuevo proyecto Kwiq + (opcional) la sub-cuenta
 * GHL en el mismo paso.
 *
 * Estructura:
 *  1. Cliente Kwiq: nombre interno, slug, modo de auth.
 *  2. Negocio: nombre comercial, nicho, teléfono, sitio web.
 *  3. Dirección: país → timezone autocomplete → ciudad/estado/calle/CP +
 *     mapa Mapbox opcional (aparece si NEXT_PUBLIC_MAPBOX_TOKEN está cargada).
 *  4. Admin de la sub-cuenta: first/last name, email, teléfono.
 *  5. Snapshot a aplicar: dropdown auto-discovery + fallback de texto libre.
 *  6. Toggle "Crear sub-cuenta en GHL ahora" (default ON).
 *
 * Al submit, llama a POST /api/admin/proyectos. Si el toggle estaba ON, la
 * API también crea la sub-cuenta en GHL y devuelve `ghl_creation` con el
 * resultado. Si falló (típicamente scopes), mostramos el error con un
 * link a /admin/ajustes para regenerar el PIT.
 */
export function NewProjectForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postCreate, setPostCreate] = useState<{
    slug: string;
    ghl_status?: string;
    ghl_message?: string;
    ghl_missing?: string[];
  } | null>(null);

  // ─── Cliente Kwiq ───────────────────────────────────────────────────
  const [clientName, setClientName] = useState("");
  const [slug, setSlug] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("pit_agency");
  const [pit, setPit] = useState("");
  const [notes, setNotes] = useState("");

  // ─── Negocio ────────────────────────────────────────────────────────
  const [businessName, setBusinessName] = useState("");
  const [businessNiche, setBusinessNiche] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessWebsite, setBusinessWebsite] = useState("");

  // ─── Dirección ──────────────────────────────────────────────────────
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessCity, setBusinessCity] = useState("");
  const [businessState, setBusinessState] = useState("");
  const [businessCountry, setBusinessCountry] = useState("MX");
  const [businessPostalCode, setBusinessPostalCode] = useState("");
  const [businessLat, setBusinessLat] = useState<number | null>(null);
  const [businessLng, setBusinessLng] = useState<number | null>(null);
  const [businessTimezone, setBusinessTimezone] = useState("America/Mexico_City");

  // ─── Admin de la sub-cuenta ─────────────────────────────────────────
  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");
  const [adminPhone, setAdminPhone] = useState("");

  // ─── Snapshots ──────────────────────────────────────────────────────
  const [snapshots, setSnapshots] = useState<SnapshotOption[]>([]);
  const [snapshotsLoadHint, setSnapshotsLoadHint] = useState<string | null>(null);
  const [snapshotId, setSnapshotId] = useState("");
  const [snapshotIdManual, setSnapshotIdManual] = useState("");

  // ─── Crear sub-cuenta GHL al guardar ────────────────────────────────
  const [createGhlLocation, setCreateGhlLocation] = useState(true);

  // Auto-fetch de snapshots al montar.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/snapshots");
        const body = (await res.json().catch(() => ({}))) as
          | { ok: true; snapshots: SnapshotOption[] }
          | { ok: false; hint?: string };
        if (cancelled) return;
        if ("ok" in body && body.ok) {
          setSnapshots(body.snapshots);
        } else {
          setSnapshotsLoadHint(
            (body as { hint?: string }).hint ??
              "No pudimos listar snapshots. Pegá el ID a mano si querés aplicar uno.",
          );
        }
      } catch {
        if (cancelled) return;
        setSnapshotsLoadHint("No pudimos contactar la API de snapshots.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-suggest timezone cuando cambia el país.
  useEffect(() => {
    const suggested = suggestTimezoneForCountry(businessCountry);
    if (suggested) setBusinessTimezone(suggested);
  }, [businessCountry]);

  function autoSlug(name: string) {
    if (slug) return; // no pisamos si el admin ya lo editó
    const next = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
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

    // Si va a crear la sub-cuenta, validamos campos obligatorios client-side.
    if (createGhlLocation) {
      const missing: string[] = [];
      if (!businessName.trim()) missing.push("nombre del negocio");
      if (!adminFirstName.trim()) missing.push("nombre del admin");
      if (!adminLastName.trim()) missing.push("apellido del admin");
      if (!contactEmail.trim()) missing.push("email del admin");
      if (!businessPhone.trim()) missing.push("teléfono del negocio");
      if (!businessCountry) missing.push("país");
      if (!businessTimezone) missing.push("timezone");
      if (missing.length) {
        setError(
          `Para crear la sub-cuenta GHL faltan: ${missing.join(", ")}. Si querés guardar el proyecto sin crearla por ahora, desactivá el toggle.`,
        );
        setLoading(false);
        return;
      }
    }

    const finalSnapshotId = snapshotIdManual.trim() || snapshotId || null;

    try {
      const payload: Record<string, unknown> = {
        client_name: clientName.trim(),
        slug: slug.trim(),
        contact_email: contactEmail.trim() || null,
        auth_mode: authMode,
        notes: notes.trim() || null,
        admin_first_name: adminFirstName.trim() || null,
        admin_last_name: adminLastName.trim() || null,
        admin_phone: adminPhone.trim() || null,
        business_name: businessName.trim() || null,
        business_niche: businessNiche || null,
        business_phone: businessPhone.trim() || null,
        business_website: businessWebsite.trim() || null,
        business_address: businessAddress.trim() || null,
        business_city: businessCity.trim() || null,
        business_state: businessState.trim() || null,
        business_country: businessCountry || null,
        business_postal_code: businessPostalCode.trim() || null,
        business_timezone: businessTimezone || null,
        business_lat: businessLat,
        business_lng: businessLng,
        snapshot_id: finalSnapshotId,
        create_ghl_location: createGhlLocation,
      };
      if (authMode === "pit_location" && pit.trim()) {
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
        ghl_creation?: {
          status: string;
          message?: string;
          missing?: string[];
        } | null;
      };

      if (!res.ok) {
        setError(
          body.detail ||
            errorLabel(body.error) ||
            "No pudimos crear el proyecto. Probá de nuevo.",
        );
        return;
      }

      // Proyecto creado. Si falló la creación de la sub-cuenta, mostramos
      // un mensaje de seguimiento sin bloquear al admin.
      const ghl = body.ghl_creation;
      if (
        ghl &&
        ghl.status !== "created" &&
        ghl.status !== "already_exists"
      ) {
        setPostCreate({
          slug: body.slug ?? slug,
          ghl_status: ghl.status,
          ghl_message: ghl.message,
          ghl_missing: ghl.missing,
        });
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

  // Pantalla intermedia: proyecto creado pero sub-cuenta GHL falló.
  if (postCreate) {
    return (
      <div className="flex flex-col gap-4 text-sm">
        <div className="rounded-md border border-kwiq-warn/40 bg-kwiq-warn/10 px-3 py-3">
          <p className="font-medium text-kwiq-text">
            Proyecto creado, pero la sub-cuenta GHL no se creó.
          </p>
          <p className="mt-2 text-kwiq-muted">{postCreate.ghl_message}</p>
          {postCreate.ghl_status === "ghl_error" && (
            <p className="mt-2 text-xs text-kwiq-muted">
              Posible causa: el Agency PIT no tiene el scope{" "}
              <code className="text-kwiq-text">locations.write</code>. Andá a{" "}
              <a
                href="/admin/ajustes"
                className="text-kwiq-accent hover:underline"
              >
                /admin/ajustes
              </a>{" "}
              y regenerá el token con el checkbox tildado.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <a
            href={`/admin/proyectos/${postCreate.slug}`}
            className="rounded-lg border border-kwiq-border px-3 py-1.5 text-xs text-kwiq-text hover:bg-kwiq-bg/40"
          >
            Ir al proyecto y reintentar después
          </a>
          {postCreate.ghl_status === "ghl_error" && (
            <a
              href="/admin/ajustes"
              className="rounded-lg bg-kwiq-accent px-3 py-1.5 text-xs font-medium text-kwiq-bg hover:bg-kwiq-accentHover"
            >
              Ir a Ajustes
            </a>
          )}
        </div>
      </div>
    );
  }

  const needsPit = authMode === "pit_location";

  return (
    <form className="flex flex-col gap-6" onSubmit={submit}>
      {/* ─── Cliente Kwiq ──────────────────────────────────────── */}
      <Section title="Cliente Kwiq" subtitle="Cómo lo llamamos internamente.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre del cliente" hint="Ej. Acme Beauty SRL." required>
            <input
              type="text"
              required
              maxLength={120}
              value={clientName}
              onChange={(e) => {
                setClientName(e.target.value);
                autoSlug(e.target.value);
              }}
              className={inputCls}
            />
          </Field>

          <Field label="Slug" hint="Para la URL de la entrevista. a-z, 0-9, guiones." required>
            <input
              type="text"
              required
              pattern="[a-z0-9][a-z0-9-]{1,47}"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="acme-beauty"
              className={cn(inputCls, "font-mono")}
            />
          </Field>
        </div>

        <Field label="Modo de autenticación GHL">
          <select
            value={authMode}
            onChange={(e) => setAuthMode(e.target.value as AuthMode)}
            className={inputCls}
          >
            <option value="pit_agency">PIT agencia (Kwiq) — recomendado</option>
            <option value="pit_location">PIT sub-cuenta (cliente)</option>
            <option value="oauth_marketplace">OAuth Marketplace</option>
          </select>
        </Field>

        {needsPit && (
          <Field
            label="PIT de sub-cuenta"
            hint="Se cifra con AES-256-GCM antes de guardarse."
            required
          >
            <input
              type="password"
              required
              value={pit}
              onChange={(e) => setPit(e.target.value)}
              placeholder="pit-xxxxxxxxxxxxxxxx"
              autoComplete="off"
              className={cn(inputCls, "font-mono")}
            />
          </Field>
        )}
      </Section>

      {/* ─── Datos del negocio ────────────────────────────────── */}
      <Section title="Datos del negocio" subtitle="Lo que se va a crear como sub-cuenta en GHL.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre del negocio" hint="Como aparece en facturas y en GHL." required>
            <input
              type="text"
              required={createGhlLocation}
              maxLength={200}
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Acme Beauty"
              className={inputCls}
            />
          </Field>

          <Field label="Nicho de negocio">
            <select
              value={businessNiche}
              onChange={(e) => setBusinessNiche(e.target.value)}
              className={inputCls}
            >
              <option value="">— Seleccionar —</option>
              {BUSINESS_NICHES.map((n) => (
                <option key={n.value} value={n.value}>
                  {n.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Teléfono del negocio" hint="Con código de país. Ej. +52 55 1234 5678." required>
            <input
              type="tel"
              required={createGhlLocation}
              value={businessPhone}
              onChange={(e) => setBusinessPhone(e.target.value)}
              placeholder="+5215512345678"
              className={inputCls}
            />
          </Field>

          <Field label="Sitio web" hint="Opcional.">
            <input
              type="url"
              value={businessWebsite}
              onChange={(e) => setBusinessWebsite(e.target.value)}
              placeholder="https://miempresa.com"
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      {/* ─── Dirección + Mapa ─────────────────────────────────── */}
      <Section title="Dirección" subtitle="Para que GHL geolocalice la sub-cuenta.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="País" required>
            <select
              required={createGhlLocation}
              value={businessCountry}
              onChange={(e) => setBusinessCountry(e.target.value)}
              className={inputCls}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label} ({c.code})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Timezone" required>
            <select
              required={createGhlLocation}
              value={businessTimezone}
              onChange={(e) => setBusinessTimezone(e.target.value)}
              className={inputCls}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Ciudad">
            <input
              type="text"
              value={businessCity}
              onChange={(e) => setBusinessCity(e.target.value)}
              placeholder="Monterrey"
              className={inputCls}
            />
          </Field>

          <Field label="Región / Estado">
            <input
              type="text"
              value={businessState}
              onChange={(e) => setBusinessState(e.target.value)}
              placeholder="Nuevo León"
              className={inputCls}
            />
          </Field>

          <Field label="Dirección" className="sm:col-span-2">
            <input
              type="text"
              value={businessAddress}
              onChange={(e) => setBusinessAddress(e.target.value)}
              placeholder="Av. Constitución 1234, Col. Centro"
              className={inputCls}
            />
          </Field>

          <Field label="Código postal">
            <input
              type="text"
              maxLength={20}
              value={businessPostalCode}
              onChange={(e) => setBusinessPostalCode(e.target.value)}
              placeholder="64000"
              className={inputCls}
            />
          </Field>
        </div>

        <LocationPicker
          country={businessCountry}
          city={businessCity}
          address={businessAddress}
          lat={businessLat}
          lng={businessLng}
          onPick={({ lat, lng, address, city, state, postalCode }) => {
            setBusinessLat(lat);
            setBusinessLng(lng);
            if (address && !businessAddress) setBusinessAddress(address);
            if (city && !businessCity) setBusinessCity(city);
            if (state && !businessState) setBusinessState(state);
            if (postalCode && !businessPostalCode) setBusinessPostalCode(postalCode);
          }}
        />
      </Section>

      {/* ─── Admin de la sub-cuenta ──────────────────────────── */}
      <Section
        title="Admin de la sub-cuenta"
        subtitle="La persona que va a manejar GHL día a día. Recibe la invitación al email."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" required>
            <input
              type="text"
              required={createGhlLocation}
              maxLength={80}
              value={adminFirstName}
              onChange={(e) => setAdminFirstName(e.target.value)}
              placeholder="María"
              className={inputCls}
            />
          </Field>

          <Field label="Apellido" required>
            <input
              type="text"
              required={createGhlLocation}
              maxLength={80}
              value={adminLastName}
              onChange={(e) => setAdminLastName(e.target.value)}
              placeholder="González"
              className={inputCls}
            />
          </Field>

          <Field label="Email del admin" hint="También se usa como email de contacto Kwiq." required>
            <input
              type="email"
              required={createGhlLocation}
              maxLength={254}
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="maria@acme.com"
              className={inputCls}
            />
          </Field>

          <Field label="Teléfono del admin" hint="Opcional.">
            <input
              type="tel"
              value={adminPhone}
              onChange={(e) => setAdminPhone(e.target.value)}
              placeholder="+5215512345678"
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      {/* ─── Snapshot ─────────────────────────────────────────── */}
      <Section
        title="Snapshot a aplicar"
        subtitle="Plantilla de la sub-cuenta. Si dejás todo vacío, se aplica el default global o se crea vacía."
      >
        {snapshots.length > 0 ? (
          <Field label="Snapshot">
            <select
              value={snapshotId}
              onChange={(e) => setSnapshotId(e.target.value)}
              className={inputCls}
              disabled={!!snapshotIdManual.trim()}
            >
              <option value="">— No aplicar snapshot —</option>
              {snapshots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field
          label="Snapshot ID (manual)"
          hint={
            snapshotsLoadHint ??
            "Si no aparece en el dropdown, pegá el ID directamente."
          }
        >
          <input
            type="text"
            maxLength={64}
            value={snapshotIdManual}
            onChange={(e) => setSnapshotIdManual(e.target.value)}
            placeholder="snap_xxxxxxxxxxxx"
            className={cn(inputCls, "font-mono")}
          />
        </Field>
      </Section>

      {/* ─── Toggle creación ─────────────────────────────────── */}
      <Section title="Crear sub-cuenta en GHL ahora">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-kwiq-border bg-kwiq-bg/40 px-3 py-3">
          <input
            type="checkbox"
            checked={createGhlLocation}
            onChange={(e) => setCreateGhlLocation(e.target.checked)}
            className="mt-0.5"
          />
          <span className="flex flex-col gap-1 text-sm">
            <span className="text-kwiq-text">
              Crear la sub-cuenta en GHL al guardar
            </span>
            <span className="text-xs text-kwiq-muted">
              Si está activo, además de guardar el proyecto en Kwiq llamamos a
              GHL para crear la sub-cuenta con los datos de arriba. Si falla,
              el proyecto queda guardado y podés reintentar después desde el
              detalle del proyecto.
            </span>
          </span>
        </label>
      </Section>

      <Section title="Notas internas" subtitle="Opcional — solo el equipo Kwiq las ve.">
        <Field label="">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Cliente de Juan. Tiene calendario propio en Google."
            className={cn(inputCls, "resize-none")}
          />
        </Field>
      </Section>

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
          {loading
            ? createGhlLocation
              ? "Creando proyecto y sub-cuenta…"
              : "Guardando…"
            : createGhlLocation
              ? "Crear proyecto y sub-cuenta"
              : "Crear proyecto"}
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
  "w-full rounded-lg border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 text-sm outline-none focus:border-kwiq-accent";

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-kwiq-border bg-kwiq-bg/30 p-4">
      <div>
        <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-kwiq-muted">
          {title}
        </h3>
        {subtitle && (
          <p className="mt-1 text-xs text-kwiq-muted/80">{subtitle}</p>
        )}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm", className)}>
      {label && (
        <span className="text-kwiq-muted">
          {label}
          {required && <span className="ml-1 text-kwiq-accent">*</span>}
        </span>
      )}
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
    case "crypto_error":
      return "El servidor no puede cifrar el PIT — revisá INTERVIEW_ENCRYPTION_KEY.";
    default:
      return null;
  }
}
