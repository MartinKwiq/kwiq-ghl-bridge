# @kwiq-ghl-bridge/interview

Entrevista conversacional de **Kwiq Onboarding**. Reemplaza la planilla de
intake (`Solicitud de información - Actualizada.xlsx`) por un chat guiado
por un LLM: el cliente conversa y Kwiq queda configurado.

> **Cara al cliente** se habla siempre de _Kwiq_ — nunca mencionamos al
> proveedor técnico (LeadConnector / GHL) en la UI ni en el prompt del
> agente IA. Ver [`docs/BRANDING.md`](./docs/BRANDING.md) para la regla
> completa.

A medida que el cliente conversa, la app:

1. **Extrae datos estructurados** (slot-filling) contra `interview-schema.ts`.
2. **Persiste** turnos y respuestas en Supabase.
3. **Genera salidas** en cualquier momento:
   - `ghl_autoconfig_json`: configuración estructurada lista para que el
     provisioner aplique a la sub-cuenta del cliente (custom fields,
     custom values, pipelines, calendarios, tags, usuarios, servicios,
     workflows de handoff). Internamente la llamamos así porque mapea 1:1
     con la API del proveedor.
   - `conversation_ai_prompt`: system prompt del agente IA que va a atender
     a los clientes del cliente.

Forma parte del monorepo `kwiq-ghl-bridge`. Corre 100% local y es 100%
compatible con Vercel + Supabase managed.

### Demo sin configuración

Apenas levantás la app, podés ir a `/demo` para ver el flujo completo sin
configurar Gemini ni Supabase. Es un guion determinístico con datos ficticios
— ideal para mostrar el producto antes de poner credenciales.

### ¿Qué sigue después del JSON?

La app actual solo **genera** la configuración (fase _dry-run_). La fase
de **commit** que aplica esa configuración automáticamente a la sub-cuenta
del cliente — creación del agente IA, custom fields, calendarios, etc. —
está diseñada en [`docs/PROVISIONING.md`](./docs/PROVISIONING.md) y se
construirá en `apps/provisioner` próximamente.

## Stack

- Next.js 15 (App Router, Route Handlers, Server Actions).
- React 19, Tailwind CSS 3.4, TypeScript estricto.
- Gemini (`@google/generative-ai`, `gemini-2.5-flash`) detrás de una interfaz
  `LLMClient` (Claude / OpenAI quedan como stubs).
- Supabase (`@supabase/ssr` + `@supabase/supabase-js`) con RLS por
  `session_token`.
- Zod para validación de payloads en rutas API.

## Quickstart

```bash
# 1. Instalar deps
cd apps/interview
npm install

# 2. Copiar el ejemplo de env y completar
cp .env.local.example .env.local
#   → GEMINI_API_KEY        (https://aistudio.google.com/app/apikey)
#   → NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY

# 3. Supabase local (opcional, si no usás uno managed)
supabase start                        # requiere Supabase CLI
npm run db:push                       # aplica migraciones

# 4. Levantar la app
npm run dev
# → http://localhost:3001
```

Entrá a http://localhost:3001, apretá **Empezar entrevista**, ingresá opcionalmente
nombre de empresa/email y arrancás a chatear. Al llegar al botón **Ver outputs**
en el header, podés generar y descargar el JSON + prompt.

## Variables de entorno

Ver `.env.local.example`. Las mínimas para arrancar:

| Variable                         | Scope         | Notas                                      |
| -------------------------------- | ------------- | ------------------------------------------ |
| `GEMINI_API_KEY`                 | server        | https://aistudio.google.com/app/apikey     |
| `GEMINI_MODEL`                   | server        | Default: `gemini-2.5-flash`                 |
| `LLM_PROVIDER`                   | server        | `gemini` \| `claude` \| `openai`           |
| `NEXT_PUBLIC_SUPABASE_URL`       | server+client | URL del proyecto                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | server+client | RLS obligatorio                            |
| `SUPABASE_SERVICE_ROLE_KEY`      | **server**    | Nunca exponer al cliente                   |
| `NEXT_PUBLIC_APP_URL`            | server+client | Base URL para links                        |
| `INTERVIEW_ENCRYPTION_KEY`       | server (opc.) | Cifra credenciales capturadas              |

## Rutas

| Método / ruta                          | Qué hace                                       |
| --------------------------------------- | ---------------------------------------------- |
| `GET  /`                                | Landing con botones "Empezar entrevista" + "Probar demo" |
| `GET  /demo`                            | Walkthrough client-only sin Gemini ni Supabase |
| `GET  /entrevista/nueva`                | Form → crea sesión → redirige al chat          |
| `GET  /entrevista/[token]`              | UI de chat conversacional                      |
| `GET  /entrevista/[token]/outputs`      | Preview, copiar y descargar configuración      |
| `POST /api/session`                     | Crea sesión (insert + saludo inicial)          |
| `POST /api/chat`                        | Procesa un turno del usuario                   |
| `POST /api/outputs`                     | (Re)genera y versiona la configuración         |

## Arquitectura

```
Cliente (Next.js, React 19)
   │
   │ fetch /api/*
   ▼
Server routes (Node runtime)
   │
   ├─► lib/llm/gemini.ts           # LLM (swappable por env)
   ├─► lib/interview-engine.ts     # Orquesta turno: carga historia, llama LLM,
   │                               # extrae slots, avanza sección
   ├─► lib/generators/*            # Build JSON GHL + prompt Conversation AI
   └─► lib/supabase/server.ts      # service_role para escritura
          │
          ▼
   Supabase Postgres (RLS)
     - interview_sessions
     - interview_turns
     - interview_answers
     - derived_outputs
```

### Modelo de datos

```
interview_sessions
  ├─ id (uuid, pk)
  ├─ session_token (text, unique) ← credencial en URL
  ├─ schema_version / current_section_id / completed_section_ids[]
  └─ status enum (draft|in_progress|completed|archived)

interview_turns   (log append-only del chat)
  └─ role (user|assistant|system|tool), content, tokens, provider/model

interview_answers (slot-filling con upsert por clave compuesta)
  └─ (session_id, section_id, question_id, record_index) UNIQUE

derived_outputs   (JSON/texto versionados)
  └─ kind in (ghl_autoconfig_json, conversation_ai_prompt, …)
```

## Cambiar de proveedor LLM

Editá `LLM_PROVIDER` en `.env.local`. El contrato está en `lib/llm/types.ts`
(`LLMClient`). Las implementaciones:

- `lib/llm/gemini.ts` — completo.
- `lib/llm/claude.ts` — stub; habilitalo instalando `@anthropic-ai/sdk`.
- `lib/llm/openai.ts` — stub; habilitalo instalando `openai`.

## Schema de la entrevista

La fuente de verdad está en `lib/interview-schema.ts`:

- 13 secciones (contexto_general, informacion_general, ubicaciones, personal,
  servicios_productos, calendarios, info_contacto, pipeline, listas_inteligentes,
  handoff, custom_fields_extra, activos_digitales, agente_ia).
- Cada `QuestionDef` declara su `output.target` → `buildGhlAutoConfig` lo
  despacha al bucket correcto del payload final.
- Secciones `repeatable` producen N registros indexados por `record_index`.

## Deploy a Vercel

1. Importar el repo en Vercel y setear **Root Directory** en
   `apps/interview/`.
2. Cargar variables de entorno en Project Settings → Environment Variables
   (Production + Preview). Mínimas: `GEMINI_API_KEY`,
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`.
3. Framework preset: **Next.js**. Node 20+.
4. Build command por defecto (`next build`). Output: `.next`.
5. Supabase managed: aplicar migraciones con
   `supabase link --project-ref <ref>` → `supabase db push`.

## Branding y docs adicionales

- [`docs/BRANDING.md`](./docs/BRANDING.md) — cómo mantener la UI consistente
  con Kwiq, dónde cambiar colores/logo/fuentes, qué terminología se puede
  usar en qué contexto.
- [`docs/PROVISIONING.md`](./docs/PROVISIONING.md) — matriz completa de qué
  se puede auto-provisionar contra el CRM vía API y qué requiere un humano
  (WhatsApp, DNS, 10DLC, OAuth de Google/Meta). Arquitectura del provisioner,
  idempotencia, fases de rollout, roadmap.

## Roadmap

| Task | Estado      | Qué hace                                              |
| ---- | ----------- | ----------------------------------------------------- |
| #12  | ✅ Completo | Schema tipado de la entrevista                        |
| #13  | ✅ Completo | Scaffolding Next.js                                    |
| #14  | ✅ Completo | Capa LLM (`LLMClient` + `GeminiClient`)                |
| #15  | ✅ Completo | Migración SQL inicial (sesiones, turnos, outputs)     |
| #16  | ✅ Completo | MVP chat — sección *Contexto General* (+ todas las demás vía schema) |
| #17  | ✅ Completo | Generadores de salida (JSON config + prompt IA)       |
| #19  | ✅ Completo | Modo demo client-only (`/demo`)                        |
| #21  | ✅ Completo | Rebrand a Kwiq (logos, copy, favicon)                 |
| #20  | 📐 Diseño  | Auto-provisioning — documentado en `docs/PROVISIONING.md`, implementación pendiente en `apps/provisioner` |
| #18  | ✅ Completo | README + guía de deploy                               |
|      | ⏳         | Streaming token-a-token (mejora UX, requiere SSE)      |
|      | ⏳         | Autenticación opcional del cliente vía Supabase Auth   |
|      | ⏳         | Cifrado de credenciales sensibles con `pgsodium`       |
|      | ⏳         | Provisioner de GHL que consuma el JSON generado        |

## Troubleshooting

- **"GEMINI_API_KEY no está definida"** → creaste `.env.local` pero no reiniciaste
  `next dev`. Kill + `npm run dev`.
- **"Sesión no encontrada"** → verificá que el token de la URL esté en
  `interview_sessions` y que `SUPABASE_SERVICE_ROLE_KEY` sea correcta.
- **LLM devuelve JSON roto** → aumentá `maxOutputTokens` en
  `lib/interview-engine.ts` o bajá `temperature`. El parser (`parseSectionTurn`)
  tolera fences `\`\`\`json` pero no texto libre.
