-- Sprint 1B: la app crea sub-cuentas GHL automáticamente desde el form.
-- Para eso necesitamos persistir los datos del negocio + admin que GHL
-- pide al crear la location: name, address, contact, timezone, etc.
--
-- Estos campos se guardan tal cual los tipea el admin antes de tocar GHL,
-- así si el call a /locations/ falla, podemos reintentarlo después con
-- los mismos datos (idempotencia del provisioner).

alter table public.kwiq_projects
  -- Datos del admin humano de la sub-cuenta (no del usuario Kwiq).
  add column if not exists admin_first_name text,
  add column if not exists admin_last_name text,
  add column if not exists admin_phone text,
  -- Datos del negocio.
  add column if not exists business_name text,
  add column if not exists business_niche text,
  add column if not exists business_phone text,
  add column if not exists business_address text,
  add column if not exists business_city text,
  add column if not exists business_state text,
  add column if not exists business_country text,
  add column if not exists business_postal_code text,
  add column if not exists business_website text,
  add column if not exists business_timezone text,
  -- Lat/lon para usos futuros (mapa, analítica regional). Opcionales.
  add column if not exists business_lat double precision,
  add column if not exists business_lng double precision,
  -- Snapshot que se aplica al crear la sub-cuenta. Si el admin lo dejó
  -- en blanco, el provisioner aplica el snapshot por defecto (configurable
  -- en kwiq_settings).
  add column if not exists snapshot_id text,
  -- Timestamp de cuándo creamos la sub-cuenta en GHL — null si todavía
  -- no se llamó al endpoint.
  add column if not exists ghl_location_created_at timestamptz;

-- Setting nuevo: snapshot canónico de Kwiq (ID que el provisioner usa
-- como fallback cuando el admin no eligió uno explícitamente).
insert into public.kwiq_settings (key, value, is_secret, description)
values (
  'ghl.default_snapshot_id',
  null,
  false,
  'ID del snapshot Kwiq base que se aplica por defecto al crear sub-cuentas. Si está null, no se aplica snapshot — el provisioner crea la sub-cuenta vacía.'
)
on conflict (key) do nothing;

comment on column public.kwiq_projects.business_name is
  'Nombre del negocio que se va a crear como sub-cuenta en GHL (campo `name` de POST /locations/).';
comment on column public.kwiq_projects.snapshot_id is
  'Snapshot a aplicar al crear la sub-cuenta. Si null, se usa kwiq_settings["ghl.default_snapshot_id"].';
comment on column public.kwiq_projects.ghl_location_created_at is
  'Timestamp de cuándo POST /locations/ devolvió OK. Sirve para distinguir proyectos pendientes de creación vs. ya creados.';
