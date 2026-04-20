# Auto-provisioning de sub-cuentas Kwiq

> **TL;DR** — Sí, podemos automatizar ~80% de la configuración directamente
> contra la API v2 de LeadConnector (el backend técnico de Kwiq). El 20%
> restante son pasos que **tienen que hacerse con un humano** porque Meta,
> Google, Twilio o el propio cliente exigen interacciones OAuth, verificaciones
> de identidad o DNS. La recomendación es un flujo **asistido en tres fases**:
> _dry-run → commit → connect wizard_.

Este documento es la guía interna del equipo para implementar esa capa de
provisioning encima del JSON que ya genera `apps/interview`.

---

## 1. ¿Por qué hablamos de "Kwiq" pero el backend es LeadConnector?

- **Cara al cliente:** Kwiq es la plataforma. No mencionamos a GoHighLevel ni
  a LeadConnector en UI, emails, prompts del agente, nombres de archivos
  descargados, etc. El cliente compra una solución Kwiq.
- **Cara al equipo:** LeadConnector (LC) es nuestro proveedor white-label.
  Para el equipo y el código interno, mencionar LC/GHL está bien (schemas,
  variables de entorno, módulos de integración). Ver
  [`docs/BRANDING.md`](./BRANDING.md) para el patrón exacto.
- **Implicación práctica:** toda el área pública del producto (`/`, `/demo`,
  `/entrevista/*`, welcome del agente IA, copy de emails) habla de Kwiq.
  El área técnica (`lib/generators/ghl-autoconfig.ts`, `supabase/migrations/*`,
  los JSON descargados internos) puede seguir usando terminología LC para no
  romper el mapping 1:1 con la API.

---

## 2. Matriz de capacidades de provisioning

Leyenda:

- ✅ **Automatizable**: la app lo crea/actualiza via API sin intervención.
- 🟡 **Asistido**: la app prepara todo (link OAuth, instrucciones, DNS records) pero el
  cliente debe hacer 1–2 clicks para completar.
- 🔴 **Manual**: requiere un humano en la consola de LC (o verificación externa
  de Meta/Google/Twilio). No lo auto-provisionamos.

### 2.1 Modelo de datos del CRM

| Recurso | Estado | Endpoint LC v2 | Notas |
|---|---|---|---|
| Custom fields (contact) | ✅ | `POST /locations/{locationId}/customFields` | Mapear `QuestionDef.output.target === "ghl_custom_field_contact"`. Idempotente por `fieldKey`. |
| Custom fields (opportunity) | ✅ | Mismo endpoint, `model: "opportunity"` | Idem. |
| Custom values | ✅ | `POST /locations/{locationId}/customValues` | Variables globales tipo `{{horario_atencion}}`. Ideales para inyectar en prompts y workflows. |
| Tags | ✅ | `POST /locations/{locationId}/tags` | Crear lote completo al inicio; LC deduplica por nombre case-insensitive. |
| Contactos | ✅ | `POST /contacts/` | Solo útil para sembrar "super admins" o datos de prueba; no es parte del onboarding típico. |

### 2.2 Calendarios y agendamiento

| Recurso | Estado | Endpoint | Notas |
|---|---|---|---|
| Calendar groups | ✅ | `POST /calendars/groups` | Agrupan calendarios por sucursal/servicio. |
| Calendars (class, service, round-robin) | ✅ | `POST /calendars` | Soporta availability, appointment duration, buffer, slots. |
| Calendar custom availability | ✅ | Mismo endpoint, `availabilities[]` | Perfecto para "martes y jueves de 14 a 19". |
| **Conexión con Google Calendar / Outlook** del usuario | 🔴 | N/A (OAuth de Google/Microsoft) | El cliente tiene que ir a *Settings → My Profile → Integrations* y loguearse. **No hay API**. |

> **Implicación:** podemos crear el calendario y dejarlo listo, pero el *sync*
> con la cuenta personal del cliente se lo pedimos en el "connect wizard".

### 2.3 Pipelines / Opportunities

| Recurso | Estado | Endpoint | Notas |
|---|---|---|---|
| Pipeline | ✅ | `POST /opportunities/pipelines` | |
| Stages | ✅ | Mismo payload, `stages[]` | Orden y `showInFunnel` manejables. |
| Opportunities | ✅ | `POST /opportunities` | No se usa en provisioning, sí en seed/test data. |

### 2.4 Usuarios y roles

| Recurso | Estado | Endpoint | Notas |
|---|---|---|---|
| Users (team members) | ✅ | `POST /users/` | Hay que enviar invitación por email; el usuario setea su password. |
| Roles / permissions | ✅ | Body del POST | Podemos pre-configurar permisos por perfil (dueño, recepción, ventas). |

### 2.5 Workflows y automatizaciones

| Recurso | Estado | Notas |
|---|---|---|
| Ejecutar workflow sobre un contacto | ✅ | `POST /workflows/{id}/subscriptions/{contactId}` |
| Listar workflows | ✅ | `GET /workflows/` |
| **Crear workflow desde cero via API** | 🔴 | No soportado públicamente. |
| **Instalar workflows desde snapshot** | 🟡 | Se carga un snapshot de agencia a la sub-cuenta; se hace una vez por la agencia (Kwiq) y a cada cliente se le aplica el snapshot. Es automatizable con el endpoint de snapshots, pero requiere que la agencia tenga el snapshot creado previamente. |

> **Recomendación:** mantener un **snapshot canónico de Kwiq** (una sola vez,
> manual) que ya traiga los workflows base (recordatorios, no-show, nurture,
> handoff). Al crear la sub-cuenta, aplicamos el snapshot y después sobre-escribimos
> con los datos que recopiló la entrevista (custom values, calendarios, tags).

### 2.6 Conversation AI / Agente IA

El provisioner consume el **bundle de 3 capas** que produce
`lib/generators/conversation-ai-prompt.ts` — ver
[`PROMPT-GENERATION.md`](./PROMPT-GENERATION.md) para el detalle.

| Recurso | Estado | Notas |
|---|---|---|
| Crear agente IA | ✅ | Endpoints de Conversation AI v2 (bot profile, goals, prompt, tone). |
| Cargar capa 1 (prompt) | ✅ | `bundle.prompt` va al campo prompt del Guided Form (≤2000 chars). |
| Cargar capa 2 (custom values) | ✅ | `ghl_autoconfig.custom_values[]` se crean antes de activar el bot. `bundle.custom_values_referenced` valida que existan todos. |
| Cargar capa 3 (knowledge base) | ✅ | `bundle.knowledge_base_spec.urls[]` se carga con el crawler, `asset_refs[]` se suben desde Supabase Storage, `manual_faqs[]` como entries. |
| Setear response style | ✅ | `bundle.response_style` → dropdown Concise/Balanced/Detailed. |
| Activar el agente sobre conversaciones | ✅ | Toggle por canal (SMS, email, WhatsApp, FB/IG). |
| Configurar *handoff* a humano | ✅ | `bundle.handoff_phrase` + reglas por keyword, horario o sentiment. |
| Voice AI (llamadas) | 🟡 | Requiere número de teléfono provisionado primero (ver 2.8). |

### 2.7 Conversaciones y canales

| Canal | Conectar | Estado | Qué requiere |
|---|---|---|---|
| **SMS (A2P 10DLC en US)** | 🔴 | Manual | Brand + campaign registration en Twilio/Bandwidth. Semanas de aprobación. |
| **SMS fuera de US** | 🟡 | Asistido | Comprar número local desde la consola; LC lo conecta solo. |
| **Email** | 🟡 | Asistido | SPF/DKIM/DMARC en el DNS del cliente — la app genera los registros, el cliente los pega. Después LC los verifica. |
| **WhatsApp Business** | 🔴 | Manual | Meta Business Verification + phone number verification OTP + política de plantillas. **No es totalmente API-only.** |
| **Facebook Messenger** | 🟡 | Asistido | OAuth de Meta (el cliente aprueba la página). |
| **Instagram DM** | 🟡 | Asistido | Igual que FB, con IG vinculado a la misma página de FB. |
| **Google Business Messages** | 🔴 | Manual | Verificación en Google Business Profile. |
| **Webchat widget** | ✅ | Automatizable | Lo configuramos via API y damos un snippet listo para pegar en el sitio del cliente. |

### 2.8 Teléfono / Voice

| Recurso | Estado | Notas |
|---|---|---|
| Comprar número (non-US) | 🟡 | API disponible; algunos países piden documento local → asistido. |
| Comprar número (US) con A2P 10DLC | 🔴 | Obligatorio registrar marca + campaña antes. |
| Configurar IVR / call routing | ✅ | Workflows + "call tree" via API. |

### 2.9 Pagos / facturación

| Recurso | Estado | Notas |
|---|---|---|
| Conectar Stripe | 🟡 | OAuth de Stripe — un click del cliente. |
| Conectar otros PSPs (Mercadopago, PayU, etc) | 🟡 | Según el PSP y el país. |
| Crear productos/precios | ✅ | `POST /products` una vez conectado el PSP. |

### 2.10 Activos digitales / marca

| Recurso | Estado | Notas |
|---|---|---|
| Subir logo, favicon, imágenes | ✅ | `POST /medias/upload` |
| Crear páginas (funnels, sitios) | 🟡 | Soporte parcial via API. Recomendamos snapshot + customización manual. |
| Subir credenciales (GA, Pixel, Tag Manager) | ✅ | Custom values o settings del sitio. |
| Dominios personalizados | 🟡 | La app genera los DNS records (CNAME/A), el cliente los aplica. |

### 2.11 Oportunidades Kwiq (upsell)

La sección `oportunidades_kwiq` de la entrevista detecta activos que el
cliente **no tiene** y que Kwiq puede venderle (web, branding, dominio,
hosting, WhatsApp Business API, onboarding CRM). No se auto-provisionan —
son señales de venta. El provisioner debe:

1. Leer `ghl_autoconfig.upsells: string[]` antes de ejecutar.
2. Si contiene `whatsapp_line` → **abortar** el paso de activar WhatsApp
   Channel; dejarlo pendiente hasta que el equipo Kwiq gestione la línea.
3. Si contiene `domain_purchase` o `hosting_setup` → usar subdominio
   temporal de Kwiq como fallback para links (ej. `cliente.kwiq.app`).
4. Registrar cada flag como task en el tablero interno de ops para que
   alguien del equipo le haga follow-up comercial al cliente.

El panel `/admin/proyectos/[slug]` ya renderiza los upsells como badges
para que el account manager los vea de un vistazo.

---

## 3. Arquitectura recomendada del provisioner

> **Estado actual (MVP, 2026-04):** el provisioner vive **dentro** de
> `apps/interview` como módulo `lib/provisioner/`. Se migrará a
> `apps/provisioner` (servicio separado o background function) cuando
> los runs empiecen a pasar el timeout de Vercel Pro (~60 s) o cuando
> querramos correr jobs programados en vez de disparar desde el request.
> Por ahora el entry-point único es `runProvisioner({ project_id, mode })`
> importable desde `@/lib/provisioner`.
>
> Módulo actual:
>
> ```
> apps/interview/lib/provisioner/
>   index.ts              ← barrel
>   run.ts                ← orquestador (runProvisioner)
>   types.ts              ← StepResult / RunStatus / ProvisionInput
>   location-client.ts    ← fetch wrapper con Agency PIT
>   idempotency.ts        ← fingerprint + decideAction + upsert
>   steps/
>     custom-values.ts    ← ÚNICO step implementado por ahora
> ```
>
> Tablas Supabase (migración `20260419180000_provisioner.sql`):
> `kwiq_provisioning_runs` + `kwiq_provisioning_resources`. El resto
> de los steps (tags, custom_fields, pipelines, calendars, users,
> ai_agent) sigue la misma forma — se van cableando en commits
> siguientes. El orden canónico (§3.3) no cambia.

```
apps/interview                        lib/provisioner (MVP actual)
──────────────                        ─────────────────────────────
  entrevista  ──→  derived_outputs   ──→  run.ts  ──→  steps/*  ──→  LC API v2
   (JSON)          (Supabase)                │                         │
                                              └─► kwiq_provisioning_runs
                                              └─► kwiq_provisioning_resources
                                                  (idempotency store)
```

<details>
<summary>Diseño target cuando extraigamos a <code>apps/provisioner</code></summary>

```
apps/interview                        apps/provisioner (futuro)
──────────────                        ──────────────────────
  entrevista  ──→  derived_outputs   ──→  loader  ──→  plan  ──→  apply
   (JSON)          (Supabase)                 │          │          │
                                              │          │          └─► LC API v2
                                              │          └─► dry-run UI (diff)
                                              └─► validador de schema
```
</details>

### 3.1 Tokens y multi-tenant

Tenemos dos caminos para autenticar contra LC:

1. **Agency-level OAuth app** (recomendado).
   - Kwiq crea una app en el Marketplace de LC con scopes granulares.
   - Cada sub-cuenta (cliente nuevo) hace OAuth una vez y nosotros guardamos
     el `access_token` + `refresh_token` del *location*.
   - Ventajas: scopes auditable, revocable, el cliente sabe qué estamos
     haciendo, cumple con el modelo de seguridad de LC.
   - Storage: nueva tabla `kwiq_account_credentials` en Supabase, cifrada con
     `pgsodium` o `INTERVIEW_ENCRYPTION_KEY`.

2. **Agency Private Integration Token** (atajo interno).
   - Un solo token con acceso a todas las sub-cuentas de la agencia.
   - Usamos el header `Location-Id: <subAccountId>` en cada request.
   - Ventajas: cero OAuth, cero consentimiento.
   - Desventajas: blast radius alto (si se filtra el token, todas las
     sub-cuentas quedan expuestas); no auditable por cliente.

**Recomendación:** arrancar con el *Agency PIT* para el MVP (solo lo usa el
equipo interno de Kwiq en modo asistido). Migrar a OAuth antes de abrir
self-service para el cliente final.

### 3.2 Idempotencia (obligatorio)

Cada recurso de LC debe ser creado con una clave de idempotencia que
guardamos en la tabla `provisioning_resources`:

```sql
CREATE TABLE provisioning_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  resource_kind text NOT NULL,          -- 'custom_field' | 'calendar' | 'pipeline' | ...
  external_id text NOT NULL,            -- ID devuelto por LC
  fingerprint text NOT NULL,            -- hash del payload que mandamos
  last_applied_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, resource_kind, external_id)
);
```

Reglas:
- Antes de `POST`, buscar si ya existe un row con mismo `(project_id, resource_kind, local_key)`.
  Si existe, usar `PUT`/`PATCH` con `external_id`.
- `fingerprint = sha256(canonicalize(payload))`. Si cambia, `PATCH`; si no, skip.

> **MVP:** implementado en `lib/provisioner/idempotency.ts`. La tabla
> efectivamente creada es `kwiq_provisioning_resources` con
> `UNIQUE (project_id, resource_kind, local_key)` — la clave es por
> **proyecto**, no por sesión, para que re-correr la entrevista y
> re-provisionar no duplique recursos.

### 3.3 Orden de aplicación (grafo de dependencias)

El orden importa: hay recursos que referencian a otros. Orden sugerido:

1. **Location (sub-account)** — probablemente ya existe, creada por el sales.
2. **Snapshot base** (workflows, templates, SMS canned, email sequences).
3. **Tags** (los necesitan workflows y automations).
4. **Custom fields** (contact y opportunity).
5. **Custom values** (muchos workflows del snapshot los usan).
6. **Pipelines + stages**.
7. **Calendars** (apuntan a users asignados).
8. **Users** (necesarios antes que los calendars los mencionen — si hay ciclo,
   crear users → luego patch calendars con `teamMembers[]`).
9. **AI agent + prompt** (referencia custom values ya existentes).
10. **Canales** (SMS/WA/FB) — se activan solo cuando el connect wizard termina.

### 3.4 Fases del rollout de UX

```
Fase 1 · DRY-RUN              Fase 2 · COMMIT                Fase 3 · CONNECT
─────────────────             ─────────────────              ──────────────────
• Muestra el JSON de Kwiq     • Aplica a LC con idempotencia • Wizard con checklist:
• Diff vs estado actual       • Progreso por recurso         ·  [ ] Gmail/Outlook
• Warnings (quotas, scopes)   • Retries + rollback parcial   ·  [ ] WhatsApp
• "Aplicar configuración"     • Logs visibles al admin       ·  [ ] Stripe
• No toca nada aún            • Guarda external_ids          ·  [ ] Dominio (DNS)
                                                             ·  [ ] A2P (si US)
```

**Fase 1 ya la tenemos**: es la ruta `/entrevista/[token]/outputs`.
Falta Fase 2 (`apps/provisioner`) y Fase 3 (`/entrevista/[token]/connect`).

### 3.5 Rate limits y backoff

LC v2 tiene rate limits por location (aprox. 100 req/10s, confirmar en sus
docs antes de shipear). Requisitos:

- Wrapper HTTP con cola por `locationId`.
- Backoff exponencial en 429 / 503.
- Circuit breaker si cae la API (no bloquear la entrevista).

### 3.6 Observabilidad

- Cada request a LC loguea a `provisioning_requests` (id, timestamp, método,
  path, status, latencia, request body hash, response body truncado, error).
- Dashboard básico: tasa de éxito, top errores, tiempo medio por fase.
- Alertas en Sentry / Slack si success rate < 95% en ventanas de 15 min.

---

## 4. Sí, no o con pinzas — guía rápida para Martín

| Pregunta | Respuesta |
|---|---|
| ¿Podemos crear el agente de IA ella misma e insertar el prompt? | **Sí.** 100% API. Lo tenemos que implementar en `apps/provisioner`. |
| ¿Rellenar custom values si ya están creados? | **Sí.** `PATCH` con idempotencia. |
| ¿Crear calendarios con disponibilidad? | **Sí.** |
| ¿Conectar WhatsApp sola? | **No.** Meta exige verificación del negocio y OTP del número. Recomiendo un wizard asistido. |
| ¿Conectar Facebook / Instagram? | **Asistido.** OAuth de Meta — un click del cliente. |
| ¿Registrar un número SMS en US? | **No automatizable sin 10DLC.** Fuera de US sí, con asistencia. |
| ¿Instalar workflows? | **Vía snapshot.** Creamos el snapshot una sola vez (manual) y lo aplicamos automáticamente por cliente. |
| ¿Pagos (Stripe, etc)? | **Asistido.** OAuth. |
| ¿DNS / dominio propio? | **Asistido.** Generamos los records, el cliente los pega en su DNS. |

### Recomendación general

No intentes hacer **full self-service sin humano** en el V1. Los dolores
típicos (WhatsApp trabado, DNS mal propagado, 10DLC rechazado) requieren
soporte humano la primera vez. El objetivo del V1 es:

> "Del briefing inicial al CRM + agente listos en 1 sola sesión de 20 min,
> con el cliente solo tocando **Conectar WhatsApp**, **Conectar calendario**
> y copiando 3 registros DNS."

Eso ya es **10× más rápido** que el flujo actual con planilla + manual labor.

---

## 5. Roadmap de implementación

| Sprint | Entregable | Estado |
|---|---|---|
| **S1** | `lib/provisioner` skeleton: cliente LC v2 con auth PIT, fetch wrapper, tablas `kwiq_provisioning_runs` + `kwiq_provisioning_resources`. | ✅ 2026-04-19 |
| **S2** | Provisioner de custom values + idempotency end-to-end (fingerprint sha256, create/update/skip). Modo `dry_run` sin writes. | ✅ 2026-04-19 |
| **S2.5** | Provisioners de: tags, custom fields. Orden §3.3. | ⏳ |
| **S3** | Provisioners de: calendars, pipelines, users. | ⏳ |
| **S4** | Provisioner del AI agent + prompt (consume `conversation_ai_bundle` de 3 capas). | ⏳ |
| **S5** | Snapshot loader (aplicar snapshot Kwiq base a la sub-cuenta). | ⏳ |
| **S6** | UI del **commit** dentro de `/admin/proyectos/[slug]` (botón "Provisionar en GHL", estados idle/running/done/failed). | 🟡 en curso |
| **S7** | Connect wizard: Google Calendar, Gmail/Outlook, Stripe, dominios. | ⏳ |
| **S8** | WhatsApp playbook (guiado, no API-only) + A2P para clientes US. | ⏳ |
| **S9** | Migración de PIT → OAuth Marketplace para self-service. | ⏳ |

---

## 6. Riesgos y open questions

- **Cambios de API sin aviso.** LC deprecó endpoints en el pasado con 30 días
  de aviso. Necesitamos monitorear su changelog y un test de contrato semanal.
- **Snapshot drift.** Si la agencia edita el snapshot base, las sub-cuentas
  existentes no se actualizan automáticamente. Decisión: ¿versionamos los
  snapshots y ofrecemos "actualizar a la última Kwiq v2.3"?
- **PII.** Algunos slots capturan datos sensibles (credenciales de GA, tokens
  de Meta en texto plano, contraseñas temporales). Todo lo sensible debe
  encriptarse con `INTERVIEW_ENCRYPTION_KEY` antes de persistirse, y
  eliminarse de `derived_outputs` cuando ya se aplicaron a LC.
- **Fallos parciales.** Si creamos 8 recursos y falla el 9no, ¿rollback o
  continue? Recomiendo **continue** + sistema de retry por recurso, porque
  los rollbacks en LC son caros (no hay transacciones).

---

## 7. Referencias

- [Documentación API REST v2 y OAuth](../../../docs/04-api-rest-v2.md)
- [Webhooks y eventos en tiempo real](../../../docs/05-webhooks.md)
- [Contactos, Custom Fields, Tags, Pipelines](../../../docs/06-contactos-custom-fields.md)
- [Conversations y canales (SMS, email, WA, FB/IG)](../../../docs/07-conversations.md)
- [Calendarios y agendamiento](../../../docs/08-calendarios.md)
- [Conversation AI](../../../docs/09-conversation-ai.md)
- [Workflows y Triggers](../../../docs/10-workflows.md)
