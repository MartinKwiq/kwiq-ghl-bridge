# 03 — Webhooks y eventos en tiempo real

## Dos mundos de webhooks en GHL

GHL mezcla dos mecanismos diferentes bajo la misma palabra "webhook". Hay que tenerlos claros:

| Tipo | Configuración | Para qué sirve | Volumen |
|---|---|---|---|
| **Marketplace App Webhooks** | Se declaran al crear la app en developer marketplace. Reciben eventos globales de **todas las Locations que instalaron la app**. | Ingesta *event-driven* de cambios en GHL. | Alto, estable |
| **Workflow Webhooks** | Se configuran **dentro de un workflow** de una Location concreta. | Notificar a sistemas externos cuando un contacto atraviesa el workflow. | Por workflow |

El middleware `kwiq-ghl-bridge` usa **ambos**: los Marketplace webhooks para la telemetría general; los Workflow webhooks para triggers finos y específicos por cliente.

## Marketplace App Webhooks

### Configuración

Al crear la app en `marketplace.gohighlevel.com`:

1. Pestaña **Webhooks** → activar.
2. Declarar una **URL HTTPS** (ej. `https://kwiq-ghl-bridge.vercel.app/api/webhooks/ghl`).
3. Seleccionar los **eventos** a los que se suscribe la app.
4. GHL genera un **signing key / public key** (ver sección firma).

### Lista de eventos (no exhaustiva)

GHL anuncia ~50+ eventos. Los más comunes:

| Categoría | Eventos |
|---|---|
| Contactos | `ContactCreate`, `ContactUpdate`, `ContactDelete`, `ContactDndUpdate`, `ContactTagUpdate` |
| Oportunidades | `OpportunityCreate`, `OpportunityUpdate`, `OpportunityDelete`, `OpportunityStageUpdate`, `OpportunityStatusUpdate`, `OpportunityMonetaryValueUpdate`, `OpportunityAssignedToUpdate` |
| Citas | `AppointmentCreate`, `AppointmentUpdate`, `AppointmentDelete` (algunas docs lo llaman `AppointmentBooked`/`AppointmentStatusUpdate`) |
| Tareas | `TaskCreate`, `TaskComplete`, `TaskDelete` |
| Notas | `NoteCreate`, `NoteUpdate`, `NoteDelete` |
| Mensajes | `InboundMessage`, `OutboundMessage` |
| Conversaciones | `ConversationUnreadUpdate` |
| Formularios | `FormSubmit` |
| Encuestas | `SurveySubmit` |
| Pagos/Invoices | `OrderCreate`, `InvoicePaid`, `InvoiceUpdate` |
| Campañas / Email | `CampaignStatusUpdate`, `LCEmail*` (eventos de entrega) |
| Calendarios de sistema | `CalendarCreate`, `CalendarUpdate`, `CalendarDelete` |
| Instalación app | `INSTALL`, `UNINSTALL` (lifecycle del marketplace) |
| Usuario | `UserCreate`, `UserUpdate`, `UserDelete` |

> ⚠️ La lista canónica y con campos exactos vive en [Webhook Integration Guide](https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide/index.html). Verifica nombres exactos contra el portal al implementar — algunos varían entre docs antiguos y nuevos (`AppointmentBooked` vs `AppointmentCreate`).

### Ejemplo de payload (ContactCreate)

```json
{
  "type": "ContactCreate",
  "locationId": "loc_xyz789",
  "companyId": "agcy_abc123",
  "timestamp": "2026-04-18T15:22:13.482Z",
  "webhookId": "whk_abcdef",
  "contactId": "ct_12345",
  "firstName": "Martín",
  "lastName": "Kwiq",
  "email": "martin@kwiq.io",
  "phone": "+573001234567",
  "tags": ["lead"],
  "customFields": [
    { "id": "cf_pais", "value": "Colombia" }
  ],
  "source": "public api"
}
```

### Eventos de lifecycle (INSTALL / UNINSTALL)

Cuando una Agency o Location **instala** tu app, GHL envía un webhook `INSTALL` con los IDs y el token. Al desinstalarla envía `UNINSTALL`. **Siempre** persistir estos eventos: disparan creación/limpieza de filas en `ghl_installations` en Supabase.

## Verificación de firma

GHL está migrando de firmas **RSA** a **Ed25519**.

| Header | Algoritmo | Clave | Estado |
|---|---|---|---|
| `x-wh-signature` | RSA-SHA256 | RSA public key (legacy) | **Deprecado el 1 de julio de 2026** |
| `x-ghl-signature` | Ed25519 | GHL Ed25519 public key | **Actual y recomendado** |

### Política recomendada (compatible durante la transición)

1. Si el request trae `x-ghl-signature` → verificar con la **Ed25519 public key** de GHL.
2. Si solo trae `x-wh-signature` → verificar con la **RSA public key** de GHL.
3. Si no trae ninguna → rechazar (403).

### Verificación Ed25519 en Node (Next.js API Route en Vercel)

```ts
// app/api/webhooks/ghl/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

const GHL_ED25519_PUB_KEY_PEM = process.env.GHL_ED25519_PUB_KEY!; // PEM stored in env

export const runtime = "nodejs"; // necesitamos acceso a Node crypto

export async function POST(req: NextRequest) {
  const sig = req.headers.get("x-ghl-signature");
  const raw = Buffer.from(await req.arrayBuffer());

  if (!sig) return NextResponse.json({ error: "missing_signature" }, { status: 403 });

  const verifier = crypto.createVerify("SHA256"); // Ed25519 usa verify() directo
  const ok = crypto.verify(
    null, // Ed25519
    raw,
    crypto.createPublicKey({ key: GHL_ED25519_PUB_KEY_PEM, format: "pem" }),
    Buffer.from(sig, "base64"),
  );

  if (!ok) return NextResponse.json({ error: "invalid_signature" }, { status: 403 });

  const event = JSON.parse(raw.toString("utf8"));
  // → Persistir crudo en Supabase (tabla ghl_events) para idempotencia
  // → Encolar procesamiento async (Supabase Realtime + edge function)
  return NextResponse.json({ ok: true });
}
```

> ⚠️ El `GHL_ED25519_PUB_KEY` exacto lo publica GHL en la doc del marketplace — no hardcodear en el repo; cargar desde env.

## Idempotencia y reintentos

- GHL envía reintentos en caso de error o timeout (> 10 s).
- Cada evento trae un `webhookId` estable → **usarlo como clave primaria** en la tabla `ghl_events` para descartar duplicados.
- Responder **rápido**: solo validar firma, persistir evento, responder `200`. Procesar en background.

## Workflow Webhooks

Desde un Workflow de GHL puedes tanto **recibir** (Inbound Webhook trigger) como **enviar** (Outbound Webhook / Custom Webhook action). Se documenta a detalle en `08-gohighlevel-workflows.md`.

Para el bridge, el patrón típico es:

- **Outbound Webhook action** → hacia `https://kwiq-ghl-bridge.vercel.app/api/workflow/<workflow_id>` con un token secreto por workflow.
- **Inbound Webhook trigger** → el middleware hace `POST` a la URL que GHL generó por workflow.

## Fuentes

- [Webhook Integration Guide — HighLevel](https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide/index.html)
- [Webhook Logs Dashboard](https://marketplace.gohighlevel.com/docs/webhook/WebhookLogsDashboard)
- [App Marketplace — Security Update: Webhook Authentication](https://ideas.gohighlevel.com/changelog/app-marketplace-security-update-webhook-authentication)
- [Unable to verify GHL webhook signature with public key (n8n)](https://community.n8n.io/t/unable-to-verify-gohighlevel-webhook-signature-with-public-key-using-n8n/94396)
- [GoHighLevel API & Webhooks Developer Quick-Start](https://www.highlevel.ai/blog/gohighlevel-api-webhooks-guide)
- [GoHighLevel Webhooks — 2026 Guide (SupplyGem)](https://supplygem.com/gohighlevel-webhooks/)
- [PHP client oficial (verificación webhook)](https://github.com/GoHighLevel/highlevel-api-php)
