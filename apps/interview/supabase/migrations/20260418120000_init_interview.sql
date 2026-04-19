-- =============================================================================
-- Kwiq Interview · Migración inicial
-- -----------------------------------------------------------------------------
-- Tablas:
--   interview_sessions   → 1 fila por entrevista en curso / completada
--   interview_turns      → log conversacional bruto (user/assistant) + tokens
--   interview_answers    → datos estructurados extraídos (slot-filling)
--   derived_outputs      → salidas generadas (JSON GHL + prompt Conversation AI)
--
-- Acceso:
--   - Lectura/escritura por `session_token` (sin login de Supabase Auth).
--   - Todas las escrituras desde el server pasan por service_role (bypasea RLS).
--   - El cliente sólo accede con anon key + custom JWT o header con token.
-- =============================================================================

-- Extensiones necesarias
create extension if not exists "pgcrypto" with schema extensions;

-- -----------------------------------------------------------------------------
-- Tipos (enums)
-- -----------------------------------------------------------------------------
do $$ begin
  create type interview_status as enum ('draft', 'in_progress', 'completed', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type interview_turn_role as enum ('system', 'user', 'assistant', 'tool');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type derived_output_kind as enum (
    'ghl_autoconfig_json',
    'conversation_ai_prompt',
    'context_summary_md',
    'raw_schema_snapshot'
  );
exception
  when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------
-- Tabla: interview_sessions
-- -----------------------------------------------------------------------------
create table if not exists public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  -- Token corto (24 hex) expuesto en la URL. Sirve como credencial del cliente.
  session_token text not null unique,
  -- Nombre legible de la empresa (capturado en los primeros turnos).
  company_name text,
  -- Versión del schema (`INTERVIEW.version`) con que se inició la entrevista.
  schema_version text not null,
  -- Estado y progreso.
  status interview_status not null default 'draft',
  current_section_id text,
  completed_section_ids text[] not null default '{}',
  -- Meta.
  owner_email text,
  locale text not null default 'es',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists interview_sessions_token_idx
  on public.interview_sessions (session_token);
create index if not exists interview_sessions_status_idx
  on public.interview_sessions (status);

-- -----------------------------------------------------------------------------
-- Tabla: interview_turns
-- -----------------------------------------------------------------------------
-- Log append-only del chat. Preserva orden estricto por `turn_index`.
create table if not exists public.interview_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions(id) on delete cascade,
  turn_index integer not null,
  role interview_turn_role not null,
  content text not null,
  -- Sección activa en la que ocurrió este turno (puede ser null en saludos).
  section_id text,
  -- Métricas del LLM.
  input_tokens integer,
  output_tokens integer,
  model text,
  provider text,
  -- Datos extra (ej: finish_reason, safety flags).
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, turn_index)
);

create index if not exists interview_turns_session_idx
  on public.interview_turns (session_id, turn_index);

-- -----------------------------------------------------------------------------
-- Tabla: interview_answers
-- -----------------------------------------------------------------------------
-- Datos estructurados extraídos con slot-filling. Upsert por (session, section, question, record).
-- `record_index` permite múltiples instancias de una sección repeatable (p.ej. varios servicios).
create table if not exists public.interview_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions(id) on delete cascade,
  section_id text not null,
  question_id text not null,
  record_index integer not null default 0,
  value jsonb,
  -- Confianza estimada por el LLM (0..1). Permite priorizar repreguntas.
  confidence numeric(4,3),
  -- Handoff a humano / pendiente.
  needs_review boolean not null default false,
  source_turn_id uuid references public.interview_turns(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, section_id, question_id, record_index)
);

create index if not exists interview_answers_session_idx
  on public.interview_answers (session_id);
create index if not exists interview_answers_section_idx
  on public.interview_answers (session_id, section_id);

-- -----------------------------------------------------------------------------
-- Tabla: derived_outputs
-- -----------------------------------------------------------------------------
-- Salidas generadas al terminar una sección (o la entrevista completa).
-- Cada generación crea un registro nuevo; se puede versionar por (session, kind, version).
create table if not exists public.derived_outputs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions(id) on delete cascade,
  kind derived_output_kind not null,
  version integer not null default 1,
  content jsonb not null,
  checksum text,
  created_at timestamptz not null default now(),
  unique (session_id, kind, version)
);

create index if not exists derived_outputs_session_idx
  on public.derived_outputs (session_id, kind);

-- -----------------------------------------------------------------------------
-- Trigger: updated_at auto
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists interview_sessions_updated on public.interview_sessions;
create trigger interview_sessions_updated
  before update on public.interview_sessions
  for each row execute procedure public.set_updated_at();

drop trigger if exists interview_answers_updated on public.interview_answers;
create trigger interview_answers_updated
  before update on public.interview_answers
  for each row execute procedure public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
-- Modelo: el cliente pasa el `session_token` como header
-- `x-session-token` (lo lee un Edge Function o la app server-side).
-- Desde el cliente con anon key NO permitimos acceso directo — toda la lectura
-- y escritura se hace server-side con la service_role key. Por lo tanto, las
-- tablas se quedan sólo con RLS habilitado y SIN políticas para anon.

alter table public.interview_sessions enable row level security;
alter table public.interview_turns    enable row level security;
alter table public.interview_answers  enable row level security;
alter table public.derived_outputs    enable row level security;

-- Policy mínima de lectura pública por token, útil si en el futuro queremos
-- permitir al front (con la anon key) leer el progreso de su propia sesión.
-- Se activa pasando el token como GUC `request.session_token` (via PostgREST
-- header → `request.headers->>x-session-token`).

create or replace function public.current_session_token()
returns text language sql stable as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb->>'session_token',
    current_setting('request.headers', true)::jsonb->>'x-session-token'
  );
$$;

drop policy if exists "sessions_read_own" on public.interview_sessions;
create policy "sessions_read_own" on public.interview_sessions
  for select using (session_token = public.current_session_token());

drop policy if exists "turns_read_own" on public.interview_turns;
create policy "turns_read_own" on public.interview_turns
  for select using (
    session_id in (
      select id from public.interview_sessions
      where session_token = public.current_session_token()
    )
  );

drop policy if exists "answers_read_own" on public.interview_answers;
create policy "answers_read_own" on public.interview_answers
  for select using (
    session_id in (
      select id from public.interview_sessions
      where session_token = public.current_session_token()
    )
  );

drop policy if exists "outputs_read_own" on public.derived_outputs;
create policy "outputs_read_own" on public.derived_outputs
  for select using (
    session_id in (
      select id from public.interview_sessions
      where session_token = public.current_session_token()
    )
  );

-- Ninguna política de INSERT/UPDATE/DELETE para anon → todo pasa por service_role.

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant select on public.interview_sessions, public.interview_turns,
                 public.interview_answers, public.derived_outputs to anon, authenticated;

grant select, insert, update, delete on public.interview_sessions,
                                         public.interview_turns,
                                         public.interview_answers,
                                         public.derived_outputs to service_role;

-- Fin.
