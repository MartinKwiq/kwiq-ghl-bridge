-- -----------------------------------------------------------------------------
-- Migration: provisioner
-- Fecha: 2026-04-19
--
-- Introduce las dos tablas que necesita `lib/provisioner`:
--
--   - kwiq_provisioning_runs      → un row por invocación del provisioner
--                                   (timing, status, logs por step).
--   - kwiq_provisioning_resources → idempotency store — un row por cada
--                                   recurso creado/actualizado en GHL.
--
-- El provisioner consulta `kwiq_provisioning_resources` antes de hacer POST
-- para saber si ya creó el recurso en una corrida anterior (y en ese caso
-- hace PATCH en vez de POST). El `fingerprint` permite detectar si el
-- payload cambió y evitar writes innecesarios.
-- -----------------------------------------------------------------------------

create type kwiq_provisioning_status as enum (
  'pending',
  'running',
  'succeeded',
  'failed',
  'partial'
);

-- -----------------------------------------------------------------------------
-- kwiq_provisioning_runs
-- -----------------------------------------------------------------------------
create table if not exists public.kwiq_provisioning_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.kwiq_projects(id) on delete cascade,
  triggered_by uuid references auth.users(id) on delete set null,

  -- Estado global de la corrida.
  status kwiq_provisioning_status not null default 'pending',

  -- Snapshot del input con el que se disparó el run. Guardamos una copia
  -- completa para reproducibilidad.
  autoconfig_snapshot jsonb,
  conversation_ai_snapshot jsonb,

  -- Resultado acumulado. `step_results` es un array de objetos con la forma:
  --   { step: string, status: 'ok'|'error'|'skipped', created: int,
  --     updated: int, skipped: int, error_message?: string, duration_ms: int }
  step_results jsonb not null default '[]'::jsonb,

  -- Si falló globalmente (excepción no atrapada por los steps), ese mensaje
  -- vive acá.
  error_message text,

  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists kwiq_provisioning_runs_project_idx
  on public.kwiq_provisioning_runs (project_id, created_at desc);

create index if not exists kwiq_provisioning_runs_status_idx
  on public.kwiq_provisioning_runs (status);

-- -----------------------------------------------------------------------------
-- kwiq_provisioning_resources (idempotency store)
-- -----------------------------------------------------------------------------
create table if not exists public.kwiq_provisioning_resources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.kwiq_projects(id) on delete cascade,

  -- 'custom_value' | 'custom_field' | 'tag' | 'calendar' | 'pipeline' |
  -- 'user' | 'conversation_ai_bot' | ...
  resource_kind text not null,

  -- Clave lógica estable dentro del proyecto. Para custom values, el `key`
  -- que vive en el autoconfig (ej. "horario_atencion"). Nunca debería
  -- colisionar entre kinds del mismo project, pero el UNIQUE lo garantiza.
  local_key text not null,

  -- ID devuelto por GHL. Es lo que usamos para PATCH en próximas corridas.
  external_id text not null,

  -- sha256 del payload canónico que mandamos la última vez. Si no cambió
  -- entre corridas, skip write.
  fingerprint text not null,

  -- Último run que lo tocó (para auditoría).
  last_run_id uuid references public.kwiq_provisioning_runs(id) on delete set null,
  last_applied_at timestamptz not null default now(),

  unique (project_id, resource_kind, local_key)
);

create index if not exists kwiq_provisioning_resources_project_idx
  on public.kwiq_provisioning_resources (project_id);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.kwiq_provisioning_runs enable row level security;
alter table public.kwiq_provisioning_resources enable row level security;

-- Los admins @kwiq.io (vía kwiq_admins) son los únicos que leen/escriben
-- estas tablas. Igual que con kwiq_projects, usamos una policy permisiva
-- basada en la allowlist.
drop policy if exists "kwiq_provisioning_runs_admin_all"
  on public.kwiq_provisioning_runs;
create policy "kwiq_provisioning_runs_admin_all"
  on public.kwiq_provisioning_runs
  for all
  to authenticated
  using (
    exists (select 1 from public.kwiq_admins a where a.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.kwiq_admins a where a.user_id = auth.uid())
  );

drop policy if exists "kwiq_provisioning_resources_admin_all"
  on public.kwiq_provisioning_resources;
create policy "kwiq_provisioning_resources_admin_all"
  on public.kwiq_provisioning_resources
  for all
  to authenticated
  using (
    exists (select 1 from public.kwiq_admins a where a.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.kwiq_admins a where a.user_id = auth.uid())
  );

grant select, insert, update, delete
  on public.kwiq_provisioning_runs, public.kwiq_provisioning_resources
  to authenticated;
grant select, insert, update, delete
  on public.kwiq_provisioning_runs, public.kwiq_provisioning_resources
  to service_role;
