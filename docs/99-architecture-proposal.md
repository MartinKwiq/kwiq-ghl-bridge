# 99 — Propuesta de arquitectura: kwiq-ghl-bridge

Borrador inicial. Se irá iterando después de revisar la documentación de GHL con el equipo.

## Objetivo

Middleware multi-tenant que conecta **GoHighLevel** con sistemas externos. Administrable por Agency y sus Locations, extensible a varios casos de uso (sync CRM, orquestación de IA, reporting, reglas de negocio).

## Stack elegido

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend / API público | **Next.js (App Router) en Vercel** | DX, Edge + Node runtimes, deploy instantáneo, buena integración con Supabase y OAuth flows. |
| Backend persistente | **Supabase** (Postgres + Auth + Edge Functions + Realtime + Storage) | Postgres gestionado, RLS por tenant, Auth multi-rol, edge functions para jobs de baja latencia, pg_cron para programados. |
| Colas / reintentos | `pgmq` (Postgres message queue en Supabase) **o** Vercel Queues | Evita depender de infra extra; consumidor en edge function. |
| Secretos | Variables de entorno Vercel + `pgsodium` para refresh tokens | Cifrado en reposo. |
| Observabilidad | Vercel logs + Supabase logs + Sentry (errores) | |
| Integración GHL | OAuth 2.0 v2 + Marketplace App Webhooks + Workflow Custom Webhooks | |

## Diagrama de alto nivel

```
┌────────────────────────────────────────────────────────────────┐
│                          Panel (Next.js)                        │
│   - Onboarding OAuth GHL                                        │
│   - Config por Location (toggles, secrets, reglas)              │
│   - Dashboards                                                  │
└───────────┬────────────────────────────────┬───────────────────┘
            │ auth                           │ api
            ▼                                ▼
┌───────────────────────┐            ┌─────────────────────────┐
│ Supabase Auth         │            │ Vercel API Routes       │
│ (users, org, roles)   │            │ - /oauth/callback       │
└───────────────────────┘            │ - /webhooks/ghl         │
                                     │ - /workflow/:id         │
                                     │ - /cron/refresh-tokens  │
                                     └───────────┬─────────────┘
                                                 │
                          ┌──────────────────────┼─────────────────────┐
                          ▼                      ▼                     ▼
                  ┌───────────────┐     ┌──────────────┐      ┌────────────────┐
                  │ Supabase      │     │ GoHighLevel  │      │ Sistemas       │
                  │ Postgres      │     │ API v2       │      │ Externos       │
                  │ + Realtime    │     │ + Webhooks   │      │ (CRM, ERP,     │
                  │ + pgmq        │     │              │      │  LLM, Slack…)  │
                  └───────┬───────┘     └──────┬───────┘      └───────┬────────┘
                          │                    │                       │
                          └──── Edge Functions (consumidores) ─────────┘
```

## Modelo de datos (borrador)

```sql
-- Organizaciones y sub-cuentas dentro del bridge (independiente de GHL)
create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table users (
  id uuid primary key,          -- = auth.users.id
  org_id uuid not null references orgs(id),
  role text check (role in ('owner','admin','viewer'))
);

-- Instalaciones GHL (una por Agency o Location según flujo)
create table ghl_installations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  user_type text check (user_type in ('Company','Location')),
  company_id text not null,
  location_id text,
  ghl_user_id text,
  access_token_enc bytea not null,         -- cifrado con pgsodium
  refresh_token_enc bytea not null,
  expires_at timestamptz not null,
  scope text,
  installed_at timestamptz default now(),
  uninstalled_at timestamptz
);

create unique index ghl_installations_unique
  on ghl_installations (company_id, coalesce(location_id,''));

-- Eventos crudos recibidos vía webhook (idempotencia + replay)
create table ghl_events (
  webhook_id text primary key,
  location_id text,
  event_type text,
  received_at timestamptz default now(),
  raw jsonb not null,
  processed_at timestamptz
);

-- Reglas / integraciones configuradas por Location
create table integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references orgs(id),
  location_id text not null,
  kind text,                   -- 'zapier-like', 'llm-bot', 'crm-sync', etc.
  config jsonb not null,
  enabled boolean default true
);

-- Cola de trabajos
-- usar pgmq.create('jobs') y produce/consume desde edge functions
```

RLS activado en todas las tablas; políticas por `org_id` derivado de `auth.uid()`.

## Endpoints HTTP del bridge

| Método | Path | Función |
|---|---|---|
| GET | `/api/oauth/authorize-url` | Devuelve URL para iniciar OAuth a la agency |
| GET | `/api/oauth/callback` | Recibe el `code`, intercambia, persiste instalación |
| POST | `/api/webhooks/ghl` | Recibe Marketplace App Webhooks — verifica firma, persiste, encola |
| POST | `/api/workflow/:workflowId` | Recibe Custom Webhook desde workflow (token secret) |
| POST | `/api/trigger/inbound/:integrationId` | Forwardea al Inbound Webhook trigger del workflow correspondiente |
| POST | `/api/admin/integrations` | CRUD de integraciones desde el panel |
| GET | `/api/cron/refresh-tokens` | Job periódico, protegido con `CRON_SECRET` |

## Fases de entrega

### Fase 1 — Documentación GHL ✅ (en curso)

### Fase 2 — Scaffolding
- `npm create next-app kwiq-ghl-bridge`
- Proyecto Supabase nuevo, habilitar `pgsodium`, `pgmq`, `pg_cron`.
- Deploy a Vercel con env vars.
- Auth Supabase (email + Google).
- Migraciones iniciales (tablas arriba).

### Fase 3 — OAuth GHL
- App en developer marketplace de GHL (primero Private, luego Marketplace).
- Flujo `/api/oauth/callback` → persistencia cifrada.
- Cron de refresh de tokens (cada 1h).
- Handler de `INSTALL`/`UNINSTALL`.

### Fase 4 — Ingesta de webhooks
- `/api/webhooks/ghl` con verificación de firma (Ed25519 + fallback RSA).
- Persistencia cruda + dedupe por `webhookId`.
- Consumidor en Supabase edge function.

### Fase 5 — Motor de integraciones
- DSL simple en `integrations.config` (trigger + actions + mappings).
- Integraciones preconstruidas:
  - **CRM sync bidireccional** con n sistema (inicialmente Supabase/Notion/Airtable/HubSpot/Salesforce).
  - **LLM Bot** (Claude / OpenAI) como respondedor alternativo.
  - **Slack notifier** para handoffs.
  - **Reporting pipeline** (volcado a BigQuery/Clickhouse).

### Fase 6 — Panel
- Instalación visual por sub-cuenta.
- Toggles on/off por integración.
- Logs de eventos y reintentos.
- Billing interno (por eventos procesados / integraciones activas).

## Seguridad

- Todos los secrets en Vercel env + `pgsodium` para tokens de GHL.
- Webhook signatures verificadas antes de tocar la DB.
- Workflow webhooks autenticados con `Bearer <bridge_token>` guardado como Custom Value en la Location.
- RLS en todas las tablas de Supabase.
- Rate limiting por org en endpoints públicos (ej. `@vercel/kv` + token bucket).
- Audit log de acciones administrativas.

## Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| Cambios breaking en la API de GHL | Abstracción de cliente propio (`/lib/ghl.ts`) y tests de contrato. |
| Deprecación `X-WH-Signature` (1 jul 2026) | Verificar Ed25519 primero, RSA como fallback hasta esa fecha. |
| Expiración de refresh token (1 año) | Cron proactivo y alertas cuando un install lleva > 300 días sin rotación. |
| Rate limits (100 req / 10s) | Cola en pgmq con backoff; coalescer ráfagas; evitar N+1. |
| Un LLM propio que se "desincroniza" de la IA nativa | Mantener contrato claro: si `__stop_bot__` está en el contacto, el bot nativo no entra; documentar en onboarding. |

## Preguntas abiertas para decidir con Martín

1. ¿Qué sistemas externos priorizamos en Fase 5? (Notion, Airtable, HubSpot, Salesforce, Pipedrive, un CRM custom…).
2. ¿Queremos publicar la app en el **Marketplace público** de GHL (requiere review) o mantenerla como **Private** por agencia?
3. ¿Usamos un LLM propio para conversación (Claude, OpenAI) o confiamos en Conversation AI nativo?
4. Multi-idioma en el panel del bridge: ¿ES + EN de entrada, o solo ES inicialmente?
5. Modelo de precios interno: ¿por Location activa, por eventos procesados, o flat por agencia?
