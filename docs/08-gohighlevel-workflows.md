# 08 — Workflows, triggers y acciones

Los **Workflows** son el motor de automatización visual de GHL. Reemplazan a los antiguos Campaigns y Triggers heredados (que todavía existen pero están en mantenimiento).

## Modelo mental

```
Trigger  →  [Action → Action → …]
              ├─ Branch (if/else)
              ├─ Wait (tiempo / hasta evento)
              └─ Goal (objetivo que al cumplirse termina el workflow)
```

- Un Contact "entra" al workflow por un trigger.
- Recorre los nodos siguiendo la lógica.
- Puede "salir" al cumplir el goal o al llegar al final.

## Triggers relevantes

### Contacto y actividad

| Trigger | Cuándo dispara |
|---|---|
| `Contact Created` | Nuevo contacto |
| `Contact Changed` | Cambia cualquier campo (con filtros) |
| `Contact Tag` | Tag añadido/removido |
| `Note Added` | Nueva nota en contacto |
| `Task Added` / `Task Reminder` | Tareas |
| `Birthday Reminder` | X días antes/después del cumpleaños |
| `Customer Replied` | Inbound message |

### Oportunidades

| Trigger | Cuándo dispara |
|---|---|
| `Opportunity Created` | |
| `Opportunity Status Changed` | Won/lost/abandoned/open |
| `Pipeline Stage Changed` | Movimiento entre stages |
| `Opportunity Changed` | Cualquier update |

### Citas

| Trigger | Cuándo dispara |
|---|---|
| `Appointment Status` | Booked, confirmed, showed, noshow, cancelled |
| `Customer Booked Appointment` | |

### Mensajería y call

| Trigger | |
|---|---|
| `Inbound SMS/Email/WhatsApp/FB/IG Message` | |
| `Email Events` | opens, clicks, bounces |
| `Call Status` | inbound, outbound, missed, voicemail |

### Externo y forms

| Trigger | |
|---|---|
| `Form Submitted` | Respuesta de form GHL |
| `Survey Submitted` | Encuesta |
| `Order Submitted` | Checkout en funnel |
| `Membership: New Signup` | |
| **`Inbound Webhook`** | URL única creada por el workflow; recibe POST externo. |

### Facturación / comercio

| Trigger | |
|---|---|
| `Invoice Events` | Created, paid, voided |
| `Subscription Events` | Created, cancelled |
| `Order Form Submitted` | |

## Acciones (actions) disponibles

### Comunicación

- `Send SMS`
- `Send Email`
- `Send WhatsApp`
- `Manual SMS/Email` (asignado a un user)
- `IVR` / `Call`
- `Voicemail Drop`

### Datos

- `Add Tag` / `Remove Tag`
- `Set Event Appointment Status`
- `Update Custom Field`
- `Update Contact Field`
- `Add / Update Opportunity`
- `Create / Update Task`
- `Create Note`
- `Assign to User`
- `Add to Workflow` / `Remove from Workflow` / `Remove from All Workflows`

### Control

- `Wait` (duración, hasta evento, hasta día/hora)
- `If/Else` (Branch por filtros)
- `Math Operation`
- `Go to` (salto)
- `End Workflow`

### Integración / externa

- **`Webhook (Outbound)`** — POST simple al URL destino con payload de contacto.
- **`Custom Webhook` (Premium)** — HTTP request configurable (GET/POST/PUT/DELETE + headers + auth + body JSON/form + query params + mapear response a custom fields).
- **`Inbound Webhook` como Action (Premium)** — pausa el flujo y espera respuesta externa antes de continuar.
- **`Execute GHL API`** — llamar a GHL desde GHL (raro pero útil).

### IA dentro del workflow

- `AI Agent / Conversation AI` (enviar conversación al agente).
- `Content AI` para generar texto.
- Nodos de `Workflow AI` para clasificar/resumir.

### Código

- **`Custom Code`** (JS) — pequeño snippet que puede acceder a `inputData` y devolver `output` para ramas posteriores.

## Inbound Webhook como Trigger

1. En el canvas del workflow agregas el trigger `Inbound Webhook`.
2. GHL genera una URL única, ej: `https://services.leadconnectorhq.com/hooks/<companyId>/webhook-trigger/<workflowId>`.
3. Haces POST con JSON.
4. El workflow crea (o actualiza) un contacto según el mapping, y arranca.

Payload ejemplo:

```bash
curl -X POST "https://services.leadconnectorhq.com/hooks/agcy_abc/webhook-trigger/wf_123" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Martín",
    "email": "martin@kwiq.io",
    "phone": "+573001234567",
    "source": "external-form",
    "intent": "demo-request"
  }'
```

Los campos JSON se pueden **mapear** a custom values/custom fields del contacto desde el editor del trigger.

## Outbound Webhook / Custom Webhook (Action)

### Outbound Webhook (simple)
- Método: POST.
- Body: payload del contacto + evento.
- Sin headers custom ni auth.

### Custom Webhook (recomendado para el bridge)

Configurable:

| Campo | |
|---|---|
| URL | `https://kwiq-ghl-bridge.vercel.app/api/workflow/<id>` |
| Method | GET/POST/PUT/DELETE |
| Auth | Bearer, API Key, Basic, OAuth2, None |
| Headers | custom |
| Query params | custom |
| Body type | JSON / x-www-form-urlencoded |
| Body | con variables `{{contact.first_name}}`, `{{custom_value.api_secret}}` |
| Response mapping | extraer campos del JSON de respuesta al contacto/custom field |
| Retries | reintentos con backoff |

Ejemplo de body:

```json
{
  "event": "qualified_lead",
  "contact": {
    "id": "{{contact.id}}",
    "email": "{{contact.email}}",
    "phone": "{{contact.phone}}",
    "tags": "{{contact.tags}}"
  },
  "location_id": "{{location.id}}"
}
```

## Custom Values vs Custom Fields en workflows

| | Custom Value | Custom Field |
|---|---|---|
| Scope | Location (global, configurable) | Por contacto |
| Uso | Tokens/secret, configuración (ej. API key del bridge) | Datos del contacto |
| Variable | `{{custom_value.bridge_api_key}}` | `{{contact.customField.pais}}` |

Patrón del bridge: guardar el **secreto de autenticación con el middleware** como Custom Value en la Location; los Custom Webhook actions lo envían en el header `Authorization`.

## Patrón "bridge bidireccional"

```
External system (Supabase, otro CRM, nuestro app)
        │ ▲
        ▼ │
  kwiq-ghl-bridge  (Vercel)
        │ ▲
        ▼ │
      GHL Location
         ├─ Workflow  "External → GHL"    ← Inbound Webhook trigger
         └─ Workflow  "GHL → External"    → Custom Webhook action
```

- **Entrada** (external → GHL): external POST → Inbound Webhook trigger → crea contacto / actualiza oportunidad / envía mensaje.
- **Salida** (GHL → external): trigger (tag, stage change, etc.) → Custom Webhook action → bridge recibe payload firmado → propaga al sistema externo.

## Debugging

- Cada workflow tiene una vista **Execution Logs** con timing, estado y payload por contacto.
- El enroll/unenroll a un contacto se refleja con "Active in Workflow" en su ficha.
- Para Custom Webhook hay logs de request/response por ejecución.

## Ejemplo completo — webhook action disparando al bridge

```json
// Configuración del Custom Webhook action:
{
  "url": "https://kwiq-ghl-bridge.vercel.app/api/ghl/workflow",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer {{custom_value.bridge_token}}",
    "Content-Type": "application/json",
    "X-Workflow-Id": "wf_123",
    "X-Location-Id": "{{location.id}}"
  },
  "body": {
    "type": "stage_changed_to_won",
    "contactId": "{{contact.id}}",
    "opportunityId": "{{opportunity.id}}",
    "monetaryValue": "{{opportunity.monetary_value}}"
  }
}
```

```ts
// app/api/ghl/workflow/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.BRIDGE_WORKFLOW_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const payload = await req.json();
  // → encolar en Supabase (pg queue) para procesamiento idempotente por (locationId, type, opportunityId)
  return NextResponse.json({ ok: true });
}
```

## Fuentes

- [A List of Workflow Triggers](https://help.gohighlevel.com/support/solutions/articles/155000002292-a-list-of-workflow-triggers)
- [Workflow Trigger — Inbound Webhook](https://help.gohighlevel.com/support/solutions/articles/155000003147-workflow-trigger-inbound-webhook)
- [How to use the Inbound Webhook Workflow Premium Trigger](https://help.gohighlevel.com/support/solutions/articles/48001237383-how-to-use-the-inbound-webhook-workflow-premium-trigger)
- [Workflow Action — Webhook (Outbound)](https://help.gohighlevel.com/support/solutions/articles/155000003299-workflow-action-webhook-outbound-)
- [Workflow Action — Custom Webhook](https://help.gohighlevel.com/support/solutions/articles/155000003305-workflow-action-custom-webhook)
- [Guide to Custom Webhook Workflow Action](https://help.gohighlevel.com/support/solutions/articles/48001238167-guide-to-custom-webhook-workflow-action)
- [Custom Webhook — Secure Credential Management](https://help.gohighlevel.com/support/solutions/articles/155000005047-custom-webhook-action-secure-credential-management)
- [Cross-Object Workflow Actions](https://help.gohighlevel.com/support/solutions/articles/155000006701-custom-object-and-company-based-workflow-actions-triggers)
- [A Detailed Explanation of GoHighLevel Workflows — Marescia](https://marlonmarescia.com/gohighlevel-workflows/)
