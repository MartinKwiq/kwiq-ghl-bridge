-- =============================================================================
-- Kwiq Interview · kwiq_settings (no-code config)
-- -----------------------------------------------------------------------------
-- Tabla key-value donde guardamos toda la configuración que el admin puede
-- cambiar desde la UI (sin tocar código ni .env). Incluye secretos cifrados
-- (AES-256-GCM con INTERVIEW_ENCRYPTION_KEY) y valores en claro.
--
-- Claves típicas:
--   ghl.agency_pit           (is_secret=true)  → PIT global de la agencia Kwiq
--   ghl.agency_company_id    (is_secret=false) → Company ID agencia
--   ghl.marketplace.client_id     (is_secret=false)
--   ghl.marketplace.client_secret (is_secret=true)
--   ghl.marketplace.redirect_uri  (is_secret=false)
--   llm.gemini_api_key       (is_secret=true)
--   llm.provider             (is_secret=false) → "gemini" | "claude" | "openai"
--   llm.model                (is_secret=false) → "gemini-2.5-flash"
--   app.public_url           (is_secret=false) → https://interview.kwiq.io
-- =============================================================================

create table if not exists public.kwiq_settings (
  key text primary key,
  value text,                         -- plaintext (si is_secret=false)
  value_enc text,                     -- ciphertext base64url (si is_secret=true)
  is_secret boolean not null default false,
  description text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- Solo uno de los dos puede estar poblado a la vez (no ambos).
alter table public.kwiq_settings
  drop constraint if exists kwiq_settings_value_xor;
alter table public.kwiq_settings
  add constraint kwiq_settings_value_xor
  check (
    (is_secret = true and value is null)
    or (is_secret = false and value_enc is null)
  );

drop trigger if exists kwiq_settings_updated on public.kwiq_settings;
create trigger kwiq_settings_updated
  before update on public.kwiq_settings
  for each row execute procedure public.set_updated_at();

-- RLS
alter table public.kwiq_settings enable row level security;

-- Solo admins leen/escriben. Los secretos se devuelven como blob cifrado
-- (la app los desencripta server-side con INTERVIEW_ENCRYPTION_KEY).
drop policy if exists "kwiq_settings_admin_all" on public.kwiq_settings;
create policy "kwiq_settings_admin_all" on public.kwiq_settings
  for all to authenticated
  using (public.is_kwiq_admin())
  with check (public.is_kwiq_admin());

grant select, insert, update, delete on public.kwiq_settings to authenticated;
grant select, insert, update, delete on public.kwiq_settings to service_role;

-- Sembrar filas vacías con descripciones, así la UI de /admin/ajustes las
-- muestra con hints aunque todavía no tengan valor.
insert into public.kwiq_settings (key, is_secret, description)
values
  ('ghl.agency_pit',              true,  'Private Integration Token de la agencia Kwiq (GHL).'),
  ('ghl.agency_company_id',       false, 'Company (Agency) ID asociado al PIT de la agencia.'),
  ('ghl.marketplace.client_id',   false, 'Client ID de la OAuth App del GHL Marketplace.'),
  ('ghl.marketplace.client_secret', true, 'Client Secret de la OAuth App del GHL Marketplace.'),
  ('ghl.marketplace.redirect_uri', false, 'Callback URL del OAuth Marketplace.'),
  ('llm.provider',                false, 'Proveedor LLM: gemini | claude | openai.'),
  ('llm.model',                   false, 'Modelo por defecto. Ej: gemini-2.5-flash.'),
  ('llm.gemini_api_key',          true,  'API key de Google Gemini.'),
  ('app.public_url',              false, 'URL pública del sitio (ej. https://interview.kwiq.io).')
on conflict (key) do nothing;

-- Fin.
