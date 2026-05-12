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

type AuthMode = "pit_agency" | "pit_location" | "oauth_marketplace";

/**
 * `create`: la app llama a la API de GHL para crear la sub-cuenta desde
 *   cero con los datos del form. Es el flow por defecto histórico.
 * `import`: la sub-cuenta YA existe en GHL (la creó otra persona o vos
 *   directamente desde el dashboard GHL). El admin pega el `location_id`
 *   y la app solo crea el row de kwiq_projects apuntando a esa location.
 *   No se dispara ningún fetch contra GHL. El resto del flow (PIT,
 *   inventario, entrevista, provisioner) funciona idéntico.
 */
type CreationMode = "create" | "import";

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
    invite_status?: string;
    invite_message?: string;
    invite_email?: string;
  } | null>(null);

  // ─── Modo de alta del proyecto ─────────────────────────────────────
  // create  → la app crea la sub-cuenta en GHL desde cero.
  // import  → la sub-cuenta ya existe en GHL; solo la registramos acá.
  const [creationMode, setCreationMode] = useState<CreationMode>("create");
  const [importLocationId, setImportLocationId] = useState("");

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
  // Lat/lng quedan reservados para una futura integración de mapa pero por
  // ahora siempre van null — el form no los expone porque GHL hace su propio
  // geocoding al recibir la dirección.
  const businessLat: number | null = null;
  const businessLng: number | null = null;
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

  // ─── Invitar al cliente al guardar ──────────────────────────────────
  const [inviteClientOnSave, setInviteClientOnSave] = useState(true);

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

  // En modo importar nunca se llama a GHL para crear. Forzamos el toggle
  // a false y bloqueamos la UI del checkbox abajo.
  useEffect(() => {
    if (creationMode === "import") {
      setCreateGhlLocation(false);
    } else {
      setCreateGhlLocation(true);
    }
  }, [creationMode]);

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

    // Validaciones específicas por modo.
    if (creationMode === "import") {
      // En modo importar lo único obligatorio (además de slug + cliente)
      // es el location_id que ya existe en GHL.
      const lid = importLocationId.trim();
      if (!lid) {
        setError(
          "En modo importar necesitamos el Location ID de la sub-cuenta que ya existe en GHL. Lo encontrás en GHL Agency dashboard → Sub-Accounts → click en la sub-cuenta → Settings, o en la URL cuando estás dentro de la sub-cuenta.",
        );
        setLoading(false);
        return;
      }
    } else if (createGhlLocation) {
      // Modo crear: validamos los campos que necesita la API de GHL.
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

    // Si va a invitar al cliente, necesitamos el email obligatoriamente.
    if (inviteClientOnSave && !contactEmail.trim()) {
      setError(
        "Para invitar al cliente automáticamente necesitamos el email del admin. Cargalo arriba o desactivá el toggle de invitación.",
      );
      setLoading(false);
      return;
    }

    const finalSnapshotId = snapshotIdManual.trim() || snapshotId || null;

    try {
      const isImporting = creationMode === "import";
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
        snapshot_id: isImporting ? null : finalSnapshotId,
        // En modo importar nunca se crea la sub-cuenta en GHL.
        create_ghl_location: isImporting ? false : createGhlLocation,
        invite_client: inviteClientOnSave,
      };
      if (isImporting) {
        payload.ghl_location_id = importLocationId.trim();
      }
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
        client_invitation?: {
          status: string;
          message?: string;
          email?: string;
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

      // Proyecto creado. Evaluamos los dos sub-resultados (sub-cuenta GHL +
      // invitación al cliente) y decidimos si mostrar pantalla intermedia o
      // redirigir directamente al detalle.
      const ghl = body.ghl_creation;
      const inv = body.client_invitation;

      const ghlFailed =
        !!ghl && ghl.status !== "created" && ghl.status !== "already_exists";
      const inviteFailed =
        !!inv && inv.status !== "invited" && inv.status !== "already_exists";

      if (ghlFailed || inviteFailed) {
        setPostCreate({
          slug: body.slug ?? slug,
          ghl_status: ghl?.status,
          ghl_message: ghl?.message,
          ghl_missing: ghl?.missing,
          invite_status: inv?.status,
          invite_message: inv?.message,
          invite_email: inv?.email,
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

  // Pantalla intermedia: proyecto creado pero algo de los pasos auxiliares
  // (sub-cuenta GHL o invitación al cliente) falló. Mostramos cada uno con
  // su error puntual y links de acción.
  if (postCreate) {
    const ghlFailed =
      !!postCreate.ghl_status &&
      postCreate.ghl_status !== "created" &&
      postCreate.ghl_status !== "already_exists";
    const inviteFailed =
      !!postCreate.invite_status &&
      postCreate.invite_status !== "invited" &&
      postCreate.invite_status !== "already_exists";

    return (
      <div className="flex flex-col gap-4 text-sm">
        <div className="rounded-md border border-kwiq-ok/40 bg-kwiq-ok/10 px-3 py-3">
          <p className="font-medium text-kwiq-text">
            ✓ Proyecto creado en Kwiq.
          </p>
          <p className="mt-1 text-xs text-kwiq-muted">
            Algunos pasos automáticos quedaron pendientes. Podés terminar
            desde el detalle del proyecto.
          </p>
        </div>

        {ghlFailed && (
          <div className="rounded-md border border-kwiq-warn/40 bg-kwiq-warn/10 px-3 py-3">
            <p className="font-medium text-kwiq-text">
              ⚠ La sub-cuenta GHL no se creó.
            </p>
            <p className="mt-2 whitespace-pre-line text-kwiq-muted">
              {postCreate.ghl_message}
            </p>
            {/* Hint específico solo si el mensaje sugiere auth / scopes —
                no aplica para errores de validación (422) o de red. */}
            {postCreate.ghl_status === "ghl_error" &&
              isAuthError(postCreate.ghl_message) && (
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
            {postCreate.ghl_status === "ghl_error" &&
              !isAuthError(postCreate.ghl_message) && (
                <p className="mt-2 text-xs text-kwiq-muted">
                  Es un error de validación o de red. Si el mensaje no es
                  claro, copialo y mándamelo y lo arreglamos. El proyecto
                  quedó guardado — podés reintentar desde el detalle.
                </p>
              )}
          </div>
        )}

        {inviteFailed && (
          <div className="rounded-md border border-kwiq-warn/40 bg-kwiq-warn/10 px-3 py-3">
            <p className="font-medium text-kwiq-text">
              ⚠ No pudimos mandar la invitación al cliente.
            </p>
            <p className="mt-2 text-kwiq-muted">
              {postCreate.invite_message ??
                "Hubo un error mandando el email. Probá invitar al cliente manualmente desde Ajustes → Usuarios."}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <a
            href={`/admin/proyectos/${postCreate.slug}`}
            className="rounded-lg border border-kwiq-border px-3 py-1.5 text-xs text-kwiq-text hover:bg-kwiq-bg/40"
          >
            Ir al proyecto
          </a>
          {ghlFailed && postCreate.ghl_status === "ghl_error" && (
            <a
              href="/admin/ajustes"
              className="rounded-lg bg-kwiq-accent px-3 py-1.5 text-xs font-medium text-kwiq-bg hover:bg-kwiq-accentHover"
            >
              Ir a Ajustes (regenerar PIT)
            </a>
          )}
          {inviteFailed && (
            <a
              href="/admin/ajustes/usuarios"
              className="rounded-lg border border-kwiq-border px-3 py-1.5 text-xs text-kwiq-text hover:bg-kwiq-bg/40"
            >
              Invitar cliente manualmente
            </a>
          )}
        </div>
      </div>
    );
  }

  const needsPit = authMode === "pit_location";
  const isImporting = creationMode === "import";

  return (
    <form className="flex flex-col gap-6" onSubmit={submit}>
      {/* ─── Modo de alta ──────────────────────────────────────── */}
      <Section
        title="Modo de alta"
        subtitle="¿La sub-cuenta GHL hay que crearla ahora o ya existe?"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <ModeCard
            active={creationMode === "create"}
            onClick={() => setCreationMode("create")}
            title="Crear nueva sub-cuenta"
            description="La app llama a GHL y crea la sub-cuenta desde cero con los datos que cargues abajo. Aplica el snapshot que elijas. Es el flow que usaste con Sonrisa Andina."
          />
          <ModeCard
            active={creationMode === "import"}
            onClick={() => setCreationMode("import")}
            title="Importar sub-cuenta existente"
            description="Ya existe una sub-cuenta en GHL (vacía o con cosas dentro) y solo querés registrarla acá para que el cliente haga la entrevista. Solo necesitamos el Location ID."
          />
        </div>

        {isImporting && (
          <Field
            label="Location ID de GHL"
            hint="Lo encontrás en GHL Agency dashboard → Sub-Accounts → click en la sub-cuenta → Settings → Business Info → Location ID. También aparece en la URL cuando estás dentro: …/location/<location_id>/…"
            required
          >
            <input
              type="text"
              required
              value={importLocationId}
              onChange={(e) => setImportLocationId(e.target.value.trim())}
              placeholder="abcdefghijklmnop1234"
              maxLength={64}
              autoComplete="off"
              className={cn(inputCls, "font-mono")}
            />
          </Field>
        )}
      </Section>

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

      {!isImporting && (
      <>
      {/* ─── Datos del negocio ────────────────────────────────── */}
      <Section title="Datos del negocio" subtitle="Lo que se va a crear como sub-cuenta en GHL.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre del negocio" hint="Como aparece en facturas y en GHL." required>
            <input
              type="text"
              required={createGhlLocation && !isImporting}
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
              required={createGhlLocation && !isImporting}
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
              required={createGhlLocation && !isImporting}
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
              required={createGhlLocation && !isImporting}
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
              required={createGhlLocation && !isImporting}
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
              required={createGhlLocation && !isImporting}
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
              required={createGhlLocation && !isImporting}
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
      </>
      )}

      {isImporting && (
        <Section
          title="Email de contacto del cliente"
          subtitle="Lo usamos para mandarle el magic link de la entrevista. No tiene que ser el mismo que el usuario admin en GHL."
        >
          <Field label="Email" required>
            <input
              type="email"
              required
              maxLength={254}
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="maria@acme.com"
              className={inputCls}
            />
          </Field>
        </Section>
      )}

      {/* ─── Toggles automáticos ─────────────────────────────── */}
      <Section
        title="Automáticos al guardar"
        subtitle="Estos pasos se disparan solos para que vos no tengas que ir a otra pantalla. Si alguno falla, el proyecto queda guardado y podés reintentar después."
      >
        {!isImporting && (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-kwiq-border bg-kwiq-bg/40 px-3 py-3">
            <input
              type="checkbox"
              checked={createGhlLocation}
              onChange={(e) => setCreateGhlLocation(e.target.checked)}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-1 text-sm">
              <span className="text-kwiq-text">
                Crear la sub-cuenta en GHL
              </span>
              <span className="text-xs text-kwiq-muted">
                Llamamos a GHL para crear la sub-cuenta con los datos de arriba.
                Aplicamos el snapshot elegido si hay uno.
              </span>
            </span>
          </label>
        )}

        {isImporting && (
          <div className="rounded-lg border border-kwiq-accent/30 bg-kwiq-accent/5 px-3 py-3 text-sm">
            <span className="text-kwiq-text">
              ✓ Importando sub-cuenta existente
            </span>
            <p className="mt-1 text-xs text-kwiq-muted">
              La app NO va a tocar GHL al guardar — solo registra el proyecto
              apuntando al Location ID que pegaste arriba. Después cargás el
              PIT y sincronizás inventario desde el detalle del proyecto.
            </p>
          </div>
        )}

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-kwiq-border bg-kwiq-bg/40 px-3 py-3">
          <input
            type="checkbox"
            checked={inviteClientOnSave}
            onChange={(e) => setInviteClientOnSave(e.target.checked)}
            className="mt-0.5"
          />
          <span className="flex flex-col gap-1 text-sm">
            <span className="text-kwiq-text">
              Invitar al cliente por email
            </span>
            <span className="text-xs text-kwiq-muted">
              Le mandamos al admin del cliente (
              <code className="text-kwiq-text">
                {contactEmail || "email del admin"}
              </code>
              ) un magic link para que active su cuenta y arranque la
              entrevista. Vos no le tenés que mandar nada manualmente —
              Supabase manda el email automáticamente.
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
            ? "Guardando…"
            : submitButtonLabel(
                creationMode,
                createGhlLocation,
                inviteClientOnSave,
              )}
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

/**
 * Card clickable para elegir entre "crear nueva" e "importar existente".
 * Visual de radio sin radio-button — toda la card es la zona de click.
 */
function ModeCard({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-1 rounded-lg border px-3 py-3 text-left text-sm transition",
        active
          ? "border-kwiq-accent bg-kwiq-accent/10"
          : "border-kwiq-border bg-kwiq-bg/40 hover:border-kwiq-accent/60",
      )}
      aria-pressed={active}
    >
      <span
        className={cn(
          "flex items-center gap-2 font-medium",
          active ? "text-kwiq-accent" : "text-kwiq-text",
        )}
      >
        <span
          className={cn(
            "inline-flex h-4 w-4 items-center justify-center rounded-full border",
            active
              ? "border-kwiq-accent bg-kwiq-accent text-kwiq-bg"
              : "border-kwiq-border",
          )}
        >
          {active ? "✓" : ""}
        </span>
        {title}
      </span>
      <span className="text-xs text-kwiq-muted">{description}</span>
    </button>
  );
}

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

/**
 * Heurística: ¿el mensaje de error de GHL sugiere problema de auth (PIT
 * sin scope) o algo más (validación de body, red, etc.)? Lo usamos para
 * mostrar el hint correcto en la pantalla post-create.
 */
function isAuthError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("401") ||
    m.includes("403") ||
    m.includes("unauthorized") ||
    m.includes("forbidden") ||
    m.includes("scope") ||
    m.includes("permission")
  );
}

/**
 * Texto del botón submit según los toggles activos. Se hace explícito qué va
 * a hacer el click para que el admin no tenga sorpresas.
 */
function submitButtonLabel(
  mode: CreationMode,
  createGhl: boolean,
  invite: boolean,
): string {
  if (mode === "import") {
    return invite
      ? "Importar proyecto + invitar cliente"
      : "Importar proyecto";
  }
  if (createGhl && invite) return "Crear proyecto + sub-cuenta + invitar cliente";
  if (createGhl) return "Crear proyecto + sub-cuenta GHL";
  if (invite) return "Crear proyecto + invitar cliente";
  return "Crear proyecto";
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
