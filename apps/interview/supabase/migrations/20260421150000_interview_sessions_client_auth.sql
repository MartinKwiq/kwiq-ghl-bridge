-- =============================================================================
-- Kwiq Interview · Flow cliente autenticado
-- -----------------------------------------------------------------------------
-- Asocia `interview_sessions` al auth.user del cliente y al kwiq_project al
-- que pertenece, para que cuando un cliente invitado haga login reciba SUS
-- sesiones y las nuevas queden linkeadas al proyecto correcto.
--
-- Cambios:
--   1. Agregamos columnas `user_id` (auth.users) y `project_id` (kwiq_projects)
--      a interview_sessions. Ambas nullable para no romper el flow legacy
--      anónimo por token corto (/entrevista/nueva).
--   2. Índices parciales para lookups "sesiones de este cliente" y
--      "sesiones del proyecto X".
--   3. Ampliamos `register_kwiq_admin` para que al crear el registro en
--      kwiq_interview_users capture además `first_login_at` = null inicial,
--      y ya linkee el project_id si viene en metadata.
-- =============================================================================

-- 1. Columnas nuevas en interview_sessions -----------------------------------
alter table public.interview_sessions
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists project_id uuid references public.kwiq_projects(id) on delete set null;

-- Lookup: "todas las sesiones de este cliente" (ordenadas por created_at desc).
create index if not exists interview_sessions_user_created_idx
  on public.interview_sessions (user_id, created_at desc)
  where user_id is not null;

-- Lookup: "todas las sesiones de este proyecto".
create index if not exists interview_sessions_project_created_idx
  on public.interview_sessions (project_id, created_at desc)
  where project_id is not null;

-- 2. RLS: el cliente logueado puede leer sus propias sesiones ----------------
-- Nota: la escritura sigue pasando por service_role (server-side), por eso
-- sólo agregamos la policy de SELECT. Evita que el browser de un cliente
-- pueda ver sesiones de otros clientes si alguna vez consultamos directo.
alter table public.interview_sessions enable row level security;

drop policy if exists interview_sessions_self_read on public.interview_sessions;
create policy interview_sessions_self_read
  on public.interview_sessions
  for select
  to authenticated
  using (user_id = auth.uid());

-- Mantenemos service_role bypass (por si alguna policy lo bloquea).
drop policy if exists interview_sessions_service_role_all on public.interview_sessions;
create policy interview_sessions_service_role_all
  on public.interview_sessions
  for all
  to service_role
  using (true)
  with check (true);

-- 3. Trigger update: cuando un cliente completa el magic link por primera
-- vez, marcamos first_login_at. Esto ocurre la primera vez que el auth.user
-- recibe una sesión activa y llama a nuestro endpoint /api/interview/me.
-- El tracking en la tabla lo hacemos desde el endpoint, no desde trigger,
-- para tener control de timezone + actualizar last_login_at en cada hit.

-- 4. Helper: devuelve el project_id del cliente logueado.
-- Lo usaremos como default en inserts y para RLS futuro si hace falta.
create or replace function public.current_client_project_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ku.project_id
  from public.kwiq_interview_users ku
  where ku.user_id = auth.uid()
  limit 1;
$$;

grant execute on function public.current_client_project_id() to authenticated, anon;

-- 5. Trigger ya existente (register_kwiq_admin) — no hace falta tocarlo:
-- la migration 20260421120000 ya lee project_id desde raw_user_meta_data.

comment on column public.interview_sessions.user_id is
  'auth.users.id del cliente autenticado que inició la sesión. Null para sesiones anónimas del flow legacy por token.';
comment on column public.interview_sessions.project_id is
  'kwiq_projects.id al que pertenece el cliente. Heredado de kwiq_interview_users.project_id al crear la sesión. Null si anónimo.';
