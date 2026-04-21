-- =============================================================================
-- Kwiq Interview · Multi-user (roles internos + clientes de entrevista)
-- -----------------------------------------------------------------------------
-- Objetivo:
--   1) Formalizar 3 roles en kwiq_admins: owner | admin | operator.
--      - owner:    puede todo, incluso CRUD de otros admins y tocar secretos.
--      - admin:    puede crear proyectos, editar, correr entrevistas. No puede
--                  gestionar usuarios ni tocar secretos globales.
--      - operator: solo lectura. Puede acompañar entrevistas (futuro).
--
--   2) Introducir un pool de usuarios CLIENTE ("kwiq_interview_users") que se
--      loguean en /interview/login (NO /admin/login) con su propio email y
--      password. Son creados por un admin cuando se les comparte el link de
--      entrevista. Su perfil persiste y queda atado al proyecto correspondiente.
--
--   3) Relajar el trigger de dominio `@kwiq.io` — antes bloqueaba cualquier
--      signup que no fuera @kwiq.io, lo cual rompe el flow de cliente. Ahora
--      la regla se aplica SOLO cuando el signup viene con `raw_user_meta_data`
--      marcando `{"kwiq_role": "admin"}`. Los signups de cliente pasan libres.
--
-- Cifrado: las credenciales de cliente vs admin son la misma tabla auth.users
-- de Supabase (la DB ve solo hashes). Datos de perfil (nombre, empresa, teléfono)
-- viven en kwiq_interview_users sin cifrado adicional (no son secretos).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Roles internos: CHECK + seed
-- -----------------------------------------------------------------------------
-- kwiq_admins.role ya existe como `text` con default 'admin'. Agregamos un
-- CHECK para que solo los 3 valores válidos entren.
do $$ begin
  alter table public.kwiq_admins
    add constraint kwiq_admins_role_check
    check (role in ('owner', 'admin', 'operator'));
exception when duplicate_object then null;
         when others then
           -- Si ya había filas con roles distintos, las normalizamos a 'admin'.
           update public.kwiq_admins set role = 'admin'
             where role not in ('owner', 'admin', 'operator');
           alter table public.kwiq_admins
             add constraint kwiq_admins_role_check
             check (role in ('owner', 'admin', 'operator'));
end $$;

-- martin@kwiq.io = owner.
update public.kwiq_admins
  set role = 'owner'
  where user_id in (
    select id from auth.users where lower(email) = 'martin@kwiq.io'
  );

-- -----------------------------------------------------------------------------
-- Helpers por rol
-- -----------------------------------------------------------------------------
create or replace function public.current_kwiq_admin_role()
returns text language sql stable as $$
  select role from public.kwiq_admins where user_id = auth.uid();
$$;

create or replace function public.is_kwiq_owner()
returns boolean language sql stable as $$
  select coalesce(public.current_kwiq_admin_role() = 'owner', false);
$$;

-- Owner o admin (los dos que pueden escribir proyectos).
create or replace function public.is_kwiq_admin_or_owner()
returns boolean language sql stable as $$
  select coalesce(public.current_kwiq_admin_role() in ('owner', 'admin'), false);
$$;

-- -----------------------------------------------------------------------------
-- 2) Tabla: kwiq_interview_users (clientes)
-- -----------------------------------------------------------------------------
-- 1 fila por persona externa (cliente) que recibe un link de entrevista.
-- Se vincula opcionalmente a un kwiq_projects (el proyecto que está onboardeando).
create table if not exists public.kwiq_interview_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  company_name text,
  phone text,

  -- Proyecto Kwiq al que pertenece la entrevista de este cliente.
  -- Nullable para poder crear el usuario antes de tener el proyecto asociado,
  -- o desvincular sin borrar el perfil.
  project_id uuid references public.kwiq_projects(id) on delete set null,

  -- Estado del onboarding.
  invited_by uuid references auth.users(id),
  invited_at timestamptz not null default now(),
  first_login_at timestamptz,
  last_login_at timestamptz,
  interview_completed_at timestamptz,

  -- Metadata libre (notas internas, flags de futuro).
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kwiq_interview_users_project_idx
  on public.kwiq_interview_users (project_id);
create index if not exists kwiq_interview_users_invited_by_idx
  on public.kwiq_interview_users (invited_by);
create index if not exists kwiq_interview_users_email_idx
  on public.kwiq_interview_users (lower(email));

drop trigger if exists kwiq_interview_users_updated on public.kwiq_interview_users;
create trigger kwiq_interview_users_updated
  before update on public.kwiq_interview_users
  for each row execute procedure public.set_updated_at();

-- Helper: ¿el uid actual es un usuario cliente?
create or replace function public.is_kwiq_interview_user()
returns boolean language sql stable as $$
  select exists (
    select 1 from public.kwiq_interview_users where user_id = auth.uid()
  );
$$;

-- -----------------------------------------------------------------------------
-- 3) Relajar el trigger de dominio @kwiq.io
-- -----------------------------------------------------------------------------
-- Antes: todo signup tenía que ser @kwiq.io.
-- Ahora: solo signups que declaran `kwiq_role=admin` en raw_user_meta_data.
-- Los clientes (sin ese flag, o con kwiq_role='client') pasan libres.
create or replace function public.enforce_kwiq_email_domain()
returns trigger language plpgsql as $$
declare
  intended_role text;
begin
  intended_role := coalesce(new.raw_user_meta_data->>'kwiq_role', 'client');

  if intended_role = 'admin' then
    if new.email is null or not lower(new.email) like '%@kwiq.io' then
      raise exception using
        errcode = '42501',
        message = 'Solo emails @kwiq.io pueden registrarse como admin de Kwiq.';
    end if;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Auto-registro: ajustar para enrutar por rol
-- -----------------------------------------------------------------------------
-- Antes: todo usuario nuevo entraba a kwiq_admins.
-- Ahora: depende del `kwiq_role` en metadata. Los clientes van a
-- kwiq_interview_users; los admins siguen yendo a kwiq_admins.
create or replace function public.register_kwiq_admin()
returns trigger language plpgsql security definer as $$
declare
  intended_role text;
begin
  intended_role := coalesce(new.raw_user_meta_data->>'kwiq_role', 'client');

  if intended_role = 'admin' then
    insert into public.kwiq_admins (user_id, role, display_name)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'kwiq_admin_role', 'admin'),
      coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
    )
    on conflict (user_id) do nothing;
  else
    insert into public.kwiq_interview_users (
      user_id,
      email,
      display_name,
      company_name,
      phone,
      project_id,
      invited_by
    )
    values (
      new.id,
      new.email,
      nullif(new.raw_user_meta_data->>'display_name', ''),
      nullif(new.raw_user_meta_data->>'company_name', ''),
      nullif(new.raw_user_meta_data->>'phone', ''),
      nullif(new.raw_user_meta_data->>'project_id', '')::uuid,
      nullif(new.raw_user_meta_data->>'invited_by', '')::uuid
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) RLS en kwiq_interview_users
-- -----------------------------------------------------------------------------
alter table public.kwiq_interview_users enable row level security;

-- Un cliente solo se ve a sí mismo.
drop policy if exists "kwiq_interview_users_self_read" on public.kwiq_interview_users;
create policy "kwiq_interview_users_self_read" on public.kwiq_interview_users
  for select to authenticated
  using (user_id = auth.uid() or public.is_kwiq_admin());

-- Un cliente puede actualizar su propio perfil (display_name, phone, company_name).
drop policy if exists "kwiq_interview_users_self_update" on public.kwiq_interview_users;
create policy "kwiq_interview_users_self_update" on public.kwiq_interview_users
  for update to authenticated
  using (user_id = auth.uid() or public.is_kwiq_admin_or_owner())
  with check (user_id = auth.uid() or public.is_kwiq_admin_or_owner());

-- Admins (owner/admin) pueden insertar/borrar clientes desde /admin/ajustes.
drop policy if exists "kwiq_interview_users_admin_write" on public.kwiq_interview_users;
create policy "kwiq_interview_users_admin_write" on public.kwiq_interview_users
  for insert to authenticated
  with check (public.is_kwiq_admin_or_owner());

drop policy if exists "kwiq_interview_users_admin_delete" on public.kwiq_interview_users;
create policy "kwiq_interview_users_admin_delete" on public.kwiq_interview_users
  for delete to authenticated
  using (public.is_kwiq_admin_or_owner());

-- -----------------------------------------------------------------------------
-- 6) Endurecer RLS de kwiq_admins (solo owners pueden modificar la allowlist)
-- -----------------------------------------------------------------------------
-- Hasta acá nadie podía insertar/borrar admins desde authenticated (solo el
-- trigger SECURITY DEFINER hacía el insert, y service_role). Ahora queremos
-- que un owner pueda también promover/degradar desde la UI.
drop policy if exists "kwiq_admins_owner_update" on public.kwiq_admins;
create policy "kwiq_admins_owner_update" on public.kwiq_admins
  for update to authenticated
  using (public.is_kwiq_owner())
  with check (public.is_kwiq_owner());

drop policy if exists "kwiq_admins_owner_delete" on public.kwiq_admins;
create policy "kwiq_admins_owner_delete" on public.kwiq_admins
  for delete to authenticated
  using (public.is_kwiq_owner() and user_id <> auth.uid()); -- no te podés auto-borrar

-- Ojo: el INSERT sigue bloqueado desde authenticated. La creación de nuevos
-- admins pasa por /api/admin/users/invite (que usa service_role).

-- -----------------------------------------------------------------------------
-- 7) Permisos
-- -----------------------------------------------------------------------------
grant select, update on public.kwiq_admins to authenticated;
grant delete on public.kwiq_admins to authenticated;
grant select, insert, update, delete on public.kwiq_interview_users to authenticated;
grant select, insert, update, delete on public.kwiq_interview_users to service_role;

-- Fin.
