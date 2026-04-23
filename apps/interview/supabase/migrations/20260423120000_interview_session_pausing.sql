-- Permite que una sesión quede en estado 'paused' para que el cliente
-- retome después. El engine ya persiste turnos y respuestas a medida que
-- llegan, así que pausar es puramente una marca de estado; al entrar al
-- chat de vuelta, retomamos desde current_section_id + interview_turns.

-- 1) Agregar valor 'paused' al enum interview_status (idempotente).
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_enum e on t.oid = e.enumtypid
    where t.typname = 'interview_status' and e.enumlabel = 'paused'
  ) then
    alter type interview_status add value 'paused';
  end if;
end$$;

-- 2) Columnas de tracking de pausas (no obligatorias — informativas).
alter table public.interview_sessions
  add column if not exists paused_at timestamptz,
  add column if not exists resumed_at timestamptz;

-- 3) Comentarios para futuros desarrolladores.
comment on column public.interview_sessions.paused_at is
  'Timestamp cuando el cliente pausó la entrevista; null si nunca la pausó o ya la retomó.';
comment on column public.interview_sessions.resumed_at is
  'Timestamp de la última vez que el cliente retomó una sesión pausada.';
