-- =============================================================================
-- Kwiq Interview · Assets de marca (logo, paleta, tipografías, brandbook)
-- -----------------------------------------------------------------------------
-- Agrega:
--   - Tabla public.branding_assets (1 fila por archivo subido durante la
--     entrevista para la sección `branding`).
--   - Bucket privado `branding` en Supabase Storage.
--   - Políticas RLS: SELECT/INSERT/UPDATE/DELETE solo para admins Kwiq.
--     El upload del cliente usa service_role desde /api/interview/upload,
--     así que el cliente NUNCA toca Storage ni la tabla directamente.
-- -----------------------------------------------------------------------------
-- Convención de file_path en el bucket:
--     {project_id}/{kind}/{asset_id}-{sanitized_original_name}
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enum: tipos de asset soportados
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.branding_asset_kind as enum (
    'logo',
    'palette',
    'font',
    'brandbook',
    'other'
  );
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Tabla: branding_assets
-- -----------------------------------------------------------------------------
create table if not exists public.branding_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.kwiq_projects(id) on delete cascade,
  session_id uuid references public.interview_sessions(id) on delete set null,
  kind public.branding_asset_kind not null,
  file_path text not null,                     -- path dentro del bucket `branding`
  mime_type text,
  original_name text,
  size_bytes bigint,
  uploaded_by_email text,                      -- opcional, tomado de la sesión o del admin
  uploaded_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists branding_assets_project_idx
  on public.branding_assets (project_id);
create index if not exists branding_assets_session_idx
  on public.branding_assets (session_id);
create index if not exists branding_assets_kind_idx
  on public.branding_assets (kind);

-- -----------------------------------------------------------------------------
-- RLS: solo admins pueden leer/administrar la metadata.
-- El ingreso de filas ocurre server-side con service_role (bypasea RLS).
-- -----------------------------------------------------------------------------
alter table public.branding_assets enable row level security;

drop policy if exists "branding_assets_admin_all" on public.branding_assets;
create policy "branding_assets_admin_all" on public.branding_assets
  for all to authenticated
  using (public.is_kwiq_admin())
  with check (public.is_kwiq_admin());

grant select, insert, update, delete on public.branding_assets to authenticated;
grant select, insert, update, delete on public.branding_assets to service_role;

-- -----------------------------------------------------------------------------
-- Bucket de Supabase Storage: `branding` (privado)
-- -----------------------------------------------------------------------------
-- El bucket arranca privado — solo accesible con service_role o signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'branding',
  'branding',
  false,
  52428800, -- 50 MB
  array[
    'image/png',
    'image/jpeg',
    'image/svg+xml',
    'image/webp',
    'application/pdf',
    'font/woff',
    'font/woff2',
    'font/ttf',
    'font/otf',
    'application/font-woff',
    'application/font-woff2',
    'application/x-font-ttf',
    'application/x-font-otf',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Storage RLS: solo admins ven los objetos del bucket branding desde el cliente
-- autenticado. El upload durante la entrevista se hace server-side con
-- service_role.
-- -----------------------------------------------------------------------------
drop policy if exists "branding_admin_select" on storage.objects;
create policy "branding_admin_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'branding' and public.is_kwiq_admin());

drop policy if exists "branding_admin_insert" on storage.objects;
create policy "branding_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'branding' and public.is_kwiq_admin());

drop policy if exists "branding_admin_update" on storage.objects;
create policy "branding_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'branding' and public.is_kwiq_admin())
  with check (bucket_id = 'branding' and public.is_kwiq_admin());

drop policy if exists "branding_admin_delete" on storage.objects;
create policy "branding_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'branding' and public.is_kwiq_admin());

-- Fin.
