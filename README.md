# kwiq-ghl-bridge

Middleware Kwiq ↔ **GoHighLevel** — onboarding interview, branding capture y
auto-provisioning de sub-cuentas. Construido sobre **Vercel + Supabase** y
100% diseñado para que la UI nunca mencione al proveedor técnico (GHL /
LeadConnector). Cara al cliente es siempre **Kwiq**.

## Qué hay acá

```
kwiq-ghl-bridge/
├── apps/
│   └── interview/              ← app Next.js 15 (única app por ahora)
│       ├── app/                ← App Router: entrevista + admin
│       ├── lib/
│       │   ├── interview-schema.ts        ← fuente de verdad del cuestionario
│       │   ├── interview-engine.ts        ← orquesta turnos con Gemini
│       │   ├── generators/
│       │   │   ├── ghl-autoconfig.ts          ← payload estructurado para el provisioner
│       │   │   └── conversation-ai-prompt.ts  ← bundle 3 capas (prompt + CVs + KB)
│       │   ├── supabase/
│       │   └── llm/                       ← abstracción swappable (Gemini default)
│       ├── docs/
│       │   ├── BRANDING.md            ← reglas de copy / colores / fuentes
│       │   ├── PROVISIONING.md        ← qué se auto-configura vs. humano
│       │   └── PROMPT-GENERATION.md   ← modelo de 3 capas (Conversation AI)
│       ├── DEPLOY.md                  ← env vars + Vercel + Supabase
│       └── README.md
├── docs/                       ← investigación técnica de GHL
│   ├── 00-gohighlevel-overview.md
│   ├── 01-gohighlevel-auth-oauth.md
│   ├── 02-gohighlevel-api-rest.md
│   ├── 03-gohighlevel-webhooks.md
│   ├── 04-gohighlevel-contacts-pipelines.md
│   ├── 05-gohighlevel-conversations.md
│   ├── 06-gohighlevel-calendars.md
│   ├── 07-gohighlevel-conversation-ai.md
│   ├── 08-gohighlevel-workflows.md
│   ├── 99-architecture-proposal.md
│   └── ghl/
│       └── conversation-ai.md   ← referencia 3-capas con fuentes oficiales
├── PUSH-TO-GITHUB.md          ← instrucciones para el primer push
└── README.md                  ← este archivo
```

## Estado actual (alpha demo)

| Área | Estado | Notas |
|---|---|---|
| Esquema tipado de entrevista | ✅ | 14 secciones, incl. `branding` + `oportunidades_kwiq` |
| Chat conversacional con Gemini | ✅ | Slot-filling con confidence, persistencia en Supabase |
| Captura de branding assets | ✅ | Drag-and-drop al chat → Supabase Storage privado |
| Detección de upsell | ✅ | web, branding, dominio, hosting, WhatsApp, CRM |
| Generador `ghl_autoconfig_json` | ✅ | Dispatcher declarativo sobre `output.target` |
| Generador Conversation AI | ✅ | Bundle 3 capas: prompt + custom values + KB spec |
| Admin `/admin/proyectos` | ✅ | Lista, crea, detalle con assets + upsells |
| Admin `/admin/ajustes` | ✅ | Config no-code en DB (GHL PIT, Gemini key, etc.) |
| Provisioner de GHL | 📐 | Diseño en `docs/PROVISIONING.md`, impl. pendiente |
| Panel `/admin/snapshots` | ✅ | Lista snapshots + locations en vivo vía Agency PIT |

## Levantarlo local

```bash
cd apps/interview
npm install
cp .env.local.example .env.local
# pegá SUPABASE_SERVICE_ROLE_KEY (dashboard → settings → API keys)
npm run dev              # http://localhost:3001
```

Admin bootstrap: `martin@kwiq.io` / `Kwiq!Admin-2026#bootstrap` — cambialo
en `/admin/ajustes` después del primer login. Todo lo demás (Gemini key,
PIT de GHL, templates de snapshot) se carga desde ahí.

## Stack técnico

| Capa | Tecnología | Rol |
|---|---|---|
| Frontend / API | Next.js 15 (App Router) + React 19 + TS | UI entrevista + admin + API Routes |
| Persistencia | Supabase Postgres + Storage + Auth | Sesiones, turnos, outputs, branding assets |
| LLM | Gemini `2.5-flash` (swappable) | Slot-filling + reformulación conversacional |
| CRM destino | GoHighLevel (API v2 + PIT) | Custom values, calendarios, Conversation AI |
| Hosting | Vercel | Root dir `apps/interview` |

## Documentación clave

- **Arquitectura** — [`docs/99-architecture-proposal.md`](./docs/99-architecture-proposal.md)
- **Autenticación con GHL** — [`docs/01-gohighlevel-auth-oauth.md`](./docs/01-gohighlevel-auth-oauth.md)
- **Conversation AI (3 capas)** — [`docs/ghl/conversation-ai.md`](./docs/ghl/conversation-ai.md)
- **Generador de prompt** — [`apps/interview/docs/PROMPT-GENERATION.md`](./apps/interview/docs/PROMPT-GENERATION.md)
- **Auto-provisioning** — [`apps/interview/docs/PROVISIONING.md`](./apps/interview/docs/PROVISIONING.md)
- **Branding & copy** — [`apps/interview/docs/BRANDING.md`](./apps/interview/docs/BRANDING.md)
- **Deploy** — [`apps/interview/DEPLOY.md`](./apps/interview/DEPLOY.md)

## Siguiente milestone

1. `apps/provisioner` — consume `ghl_autoconfig_json` + `conversation_ai_bundle`
   y lo aplica idempotentemente a la sub-cuenta del cliente.
2. Entornos separados: `interview.kwiq.io` (cliente) y `admin.kwiq.io`
   (equipo Kwiq).
3. Verificar la documentación técnica de GHL contra fuentes oficiales y
   actualizar lo que haya cambiado desde la investigación inicial.
