# kwiq-ghl-bridge

Middleware de integración entre **GoHighLevel** y sistemas externos, construido sobre **Vercel + Supabase**.

## Objetivo

Crear un servicio puente (bridge) que permita conectar GoHighLevel (GHL) con otras plataformas y fuentes de datos vía API y webhooks, centralizando lógica de sincronización, reglas de negocio y control de bots/agentes IA.

## Stack tecnológico

| Capa | Tecnología | Rol |
|---|---|---|
| Frontend / API | **Vercel** (Next.js + API Routes / Edge Functions) | Hosting del panel y endpoints |
| Backend / Datos | **Supabase** (Postgres + Auth + Edge Functions + Realtime) | Persistencia, auth multi-tenant, queues |
| Plataforma externa | **GoHighLevel** (API v2 + Webhooks + OAuth 2.0) | CRM, calendarios, conversaciones, IA |

## Estructura del repositorio

```
kwiq-ghl-bridge/
├── README.md                    ← este archivo
├── docs/                        ← documentación técnica
│   ├── 00-gohighlevel-overview.md
│   ├── 01-gohighlevel-auth-oauth.md
│   ├── 02-gohighlevel-api-rest.md
│   ├── 03-gohighlevel-webhooks.md
│   ├── 04-gohighlevel-contacts-pipelines.md
│   ├── 05-gohighlevel-conversations.md
│   ├── 06-gohighlevel-calendars.md
│   ├── 07-gohighlevel-conversation-ai.md
│   ├── 08-gohighlevel-workflows.md
│   └── 99-architecture-proposal.md
└── src/                         ← código (se añadirá en la fase 2)
```

## Fases

1. **Fase 1 — Descubrimiento (en curso)**: documentar a fondo GHL, definir arquitectura.
2. **Fase 2 — Scaffolding**: app Next.js en Vercel + proyecto Supabase, auth, migraciones.
3. **Fase 3 — Integración OAuth**: conectar con GHL vía OAuth 2.0 (agency + location tokens).
4. **Fase 4 — Ingesta de webhooks**: consumir eventos de GHL, persistir en Supabase.
5. **Fase 5 — Lógica de middleware**: reglas, transformaciones, reenvío a sistemas externos.
6. **Fase 6 — Panel de control**: UI para configurar integraciones por sub-cuenta.

## Estado actual

- [x] Carpeta del proyecto creada
- [ ] Documentación de GHL (en progreso)
- [ ] Arquitectura técnica
- [ ] Scaffolding inicial
