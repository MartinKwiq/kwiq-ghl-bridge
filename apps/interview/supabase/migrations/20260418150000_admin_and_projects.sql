-- =============================================================================
-- Kwiq Interview · Admin + Proyectos
-- -----------------------------------------------------------------------------
-- Agrega:
--   - kwiq_admins            → allowlist de admins (FK a auth.users)
--   - kwiq_projects          → 1 fila por cliente onboardeado (creds GHL cifradas)
--   - interview_sessions.project_id (FK opcional)
--   - Restricción de dominio @kwiq.io en signup (trigger)
--   - Helpers: is_kwiq_admin(), current_admin_user_id()
--
-- NOTA sobre cifrado de credenciales GHL:
--   Los tokens PIT / refresh tokens se guardan cifrados a nivel aplicación
--   (AES-256-GCM, `lib/crypto.ts`, llave `INTERVIEW_ENCRYPTION_KEY`). A
--   futuro, migraremos a pgsodium / Supabase Vault para que el cifrado viva
--   dentro de Postgres. Por ahora, el blob cifrado se guarda como `text`
--   (base64url) y la DB nunca ve el plaintext.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos (enums)
-- -----------------------------------------------------------------------------
do $$ begin
  create type kwiq_project_status as enum (
    'draft',                   -- creado pero sin creds todavía
    'ready_for_interview',     -- listo para generar link de entrevista
    'interview_in_progress',   -- hay una interview_session abierta
    'ready_to_provision',      -- entrevista OK, falta disparar provisioning
    'provisioned',             -- subcuenta GHL provisionada con éxito
    'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type kwiq_auth_mode as enum (
    'pit_agency',              -- usamos el PIT de agencia global (desde .env)
    'pit_location',            -- PIT por sub-account (cifrado en la fila)
    'oauth_marketplace'        -- OAuth Marketplace con refresh token cifrado
  );
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Tabla: kwiq_admins
-- -----------------------------------------------------------------------------
-- Allowlist de administradores. La restricción por dominio @kwiq.io se aplica
-- en el trigger de auth.users (más abajo); esta tabla registra además un rol
-- por si en el futuro diferenciamos "owner" vs "collaborator".
create table if not exists public.kwiq_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin',
  display_name text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
-- Devuelve true si el uid actual es admin (está en kwiq_admins).
create or replace function public.is_kwiq_admin()
returns boolean language sql stable as $$
  select exists (
    select 1 from public.kwiq_admins where user_id = auth.uid()
  );
$$;

-- Devuelve el user_id actual (azúcar sintáctico).
create or replace function public.current_admin_user_id()
returns uuid language sql stable as $$
  select case when public.is_kwiq_admin() then auth.uid() else null end;
$$;

-- -----------------------------------------------------------------------------
-- Restricción de dominio: solo @kwiq.io se puede registrar vía Supabase Auth.
-- -----------------------------------------------------------------------------
-- El trigger corre en auth.users antes del insert. Si el email no termina en
-- @kwiq.io, rechaza el signup. Permitimos la primera creación programática
-- desde service_role (que NO dispara este hook gracias al bypass de triggers
-- de sistema cuando el cliente es Supabase Auth Admin API), pero si llega a
-- disparar, el email aún debe ser @kwiq.io.
create or replace function public.enforce_kwiq_email_domain()
returns trigger language plpgsql as $$
begin
  if new.email is null or not lower(new.email) like '%@kwiq.io' then
    raise exception using
      errcode = '42501',
      message = 'Solo emails @kwiq.io pueden registrarse como admin.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_kwiq_domain on auth.users;
create trigger enforce_kwiq_domain
  before insert on auth.users
  for each row execute procedure public.enforce_kwiq_email_domain();

-- Al crear un usuario nuevo válido, lo damos de alta automáticamente como
-- admin. Esto mantiene la allowlist sincronizada sin pasos manuales.
create or replace function public.register_kwiq_admin()
returns trigger language plpgsql security definer as $$
begin
  insert into public.kwiq_admins (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists register_kwiq_admin_trg on auth.users;
create trigger register_kwiq_admin_trg
  after insert on auth.users
  for each row execute procedure public.register_kwiq_admin();

-- -----------------------------------------------------------------------------
-- Tabla: kwiq_projects
-- -----------------------------------------------------------------------------
create table if not exists public.kwiq_projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,                 -- "acme-beauty"
  client_name text not null,                 -- "Acme Beauty SRL"
  contact_email text,
  status kwiq_project_status not null default 'draft',

  -- Modo de autenticación contra GHL.
  auth_mode kwiq_auth_mode not null default 'pit_agency',

  -- Solo relevantes si auth_mode != 'pit_agency'.
  -- Si auth_mode = 'pit_agency', usamos GHL_AGENCY_PIT desde el entorno.
  ghl_location_id text,                      -- sub-account id en GHL
  ghl_company_id text,                       -- agency (company) id, si corresponde
  ghl_token_enc text,                        -- PIT de sub-account o access_token cifrado
  ghl_refresh_enc text,                      -- refresh_token cifrado (OAuth)
  ghl_token_expires_at timestamptz,
  ghl_scopes text[],                         -- scopes concedidos en OAuth

  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kwiq_projects_status_idx on public.kwiq_projects (status);
create index if not exists kwiq_projects_created_by_idx on public.kwiq_projects (created_by);
create index if not exists kwiq_projects_location_idx
  on public.kwiq_projects (ghl_location_id)
  where ghl_location_id is not null;

drop trigger if exists kwiq_projects_updated on public.kwiq_projects;
create trigger kwiq_projects_updated
  before update on public.kwiq_projects
  for each row execute procedure public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Link entrevistas ↔ proyectos
-- -----------------------------------------------------------------------------
alter table public.interview_sessions
  add column if not exists project_id uuid references public.kwiq_projects(id) on delete set null;

create index if not exists interview_sessions_project_idx
  on public.interview_sessions (project_id);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.kwiq_admins enable row level security;
alter table public.kwiq_projects enable row level security;

-- Admins pueden leerse entre ellos.
drop policy if exists "kwiq_admins_read" on public.kwiq_admins;
create policy "kwiq_admins_read" on public.kwiq_admins
  for select to authenticated
  using (public.is_kwiq_admin());

-- Solo service_role escribe kwiq_admins (o el trigger que corre con security definer).
-- No damos insert/update/delete a authenticated.

drop policy if exists "kwiq_projects_admin_all" on public.kwiq_projects;
create policy "kwiq_projects_admin_all" on public.kwiq_projects
  for all to authenticated
  using (public.is_kwiq_admin())
  with check (public.is_kwiq_admin());

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------
grant select on public.kwiq_admins to authenticated;
grant select, insert, update, delete on public.kwiq_projects to authenticated;
grant select, insert, update, delete on public.kwiq_admins, public.kwiq_projects to service_role;

-- Fin.
