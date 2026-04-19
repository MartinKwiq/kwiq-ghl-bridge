# 05 — Conversations (SMS, Email, WhatsApp, FB/IG, Call)

## Modelo unificado

GHL expone una **bandeja unificada** llamada **Conversations** donde cada hilo agrupa los mensajes intercambiados con un contacto, **sin importar el canal**.

```
Contact (1) ── (N) Conversation (1) ── (N) Message
```

Cada `Message` tiene un `type` que identifica el canal.

## Canales soportados

| Canal | Proveedor típico | `type` en API | Notas |
|---|---|---|---|
| SMS | Twilio nativo o **LC Phone** (número provisto por GHL) | `SMS` | Requiere registro A2P 10DLC en US. |
| MMS | Twilio/LC Phone | `MMS` | |
| Email | LC Email (nativo) o SMTP propio | `Email` | |
| WhatsApp | **LC WhatsApp** (WhatsApp Business API oficial, vía GHL) o conectores externos | `WhatsApp` | Plantillas aprobadas por Meta. |
| Facebook Messenger | Conexión de página FB | `FB` | |
| Instagram DM | Conexión de cuenta IG business | `IG` | |
| Google Business Messages / GMB Chat | GMB conectado | `GMB` | |
| Web Chat / Live Chat | Widget GHL en el sitio | `Live_Chat` | |
| Call | LC Phone / Twilio | `CALL` | Se guarda el registro, no el audio salvo grabación activada. |
| Custom | Tu propio conector como "Conversation Provider" | `Custom` | Recomendado para canales no nativos. |

## Endpoints principales

```
GET   /conversations/search?locationId=...&limit=50
GET   /conversations/{conversationId}
GET   /conversations/{conversationId}/messages
POST  /conversations/messages                  ← enviar mensaje saliente
POST  /conversations/messages/inbound          ← registrar mensaje entrante (custom provider)
PUT   /conversations/{conversationId}          ← star, unread, archive
DELETE /conversations/{conversationId}
```

## Estructura de un Message

```json
{
  "id": "msg_abc123",
  "conversationId": "cnv_xyz",
  "locationId": "loc_xyz789",
  "contactId": "ct_12345",
  "type": "SMS",
  "direction": "inbound",           // o "outbound"
  "status": "delivered",            // sent, delivered, failed, read, etc.
  "body": "Hola, quiero info",
  "attachments": [],
  "dateAdded": "2026-04-18T15:22:13.482Z",
  "providerMessageId": "SMxxxx...", // id de Twilio/Meta/etc.
  "source": "kwiq-ghl-bridge"
}
```

## Enviar mensajes

### SMS

```bash
curl -X POST "https://services.leadconnectorhq.com/conversations/messages" \
  -H "Authorization: Bearer $GHL_TOKEN" \
  -H "Version: 2021-07-28" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "SMS",
    "contactId": "ct_12345",
    "message": "Hola, tu cita está confirmada."
  }'
```

### Email

```json
{
  "type": "Email",
  "contactId": "ct_12345",
  "subject": "Tu cita",
  "html": "<p>Hola, tu cita está confirmada.</p>",
  "emailFrom": "citas@kwiq.io",
  "emailReplyTo": "soporte@kwiq.io",
  "attachments": ["https://.../confirmacion.pdf"]
}
```

### WhatsApp (plantilla aprobada)

```json
{
  "type": "WhatsApp",
  "contactId": "ct_12345",
  "templateId": "wamt_abc",
  "templateParams": ["Martín", "20 de abril 10:00"]
}
```

## Mensajes entrantes en canales custom

Si tu middleware opera como **Conversation Provider** (por ejemplo para un canal que GHL no soporta nativamente), usa:

```bash
curl -X POST "https://services.leadconnectorhq.com/conversations/messages/inbound" \
  -H "Authorization: Bearer $GHL_TOKEN" \
  -H "Version: 2021-07-28" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "Custom",
    "contactId": "ct_12345",
    "message": "Mensaje recibido desde canal X",
    "providerMessageId": "ext-msg-0001",
    "conversationProviderId": "cvp_kwiq"
  }'
```

Previamente debes **registrar el provider** desde la app del marketplace (sección *Conversation Providers*).

## Webhooks relacionados

| Evento | Qué se dispara |
|---|---|
| `InboundMessage` | Llega un mensaje al contacto en cualquier canal. |
| `OutboundMessage` | GHL envió un mensaje al contacto. |
| `ConversationUnreadUpdate` | Cambió el contador de no leídos. |
| `ConversationProviderOutboundMessage` | GHL pide a tu provider enviar un mensaje saliente (webhook a tu endpoint). |

Para un bot/IA custom (alternativa a Conversation AI de GHL), el patrón es:

1. GHL → webhook `InboundMessage` → kwiq-ghl-bridge.
2. kwiq-ghl-bridge consulta Claude/OpenAI con historial.
3. kwiq-ghl-bridge → `POST /conversations/messages` con la respuesta.
4. Opcional: si el modelo pide handoff, aplicar tag `__stop_bot__` o `human_handover` (ver doc 07).

## Estados y flags de conversación

- `unread` → hay mensajes sin abrir.
- `archived` → oculto de la bandeja principal.
- `starred` → marcado.
- DND por canal en el `Contact` bloquea outbound por ese canal aunque lo pidas por API.

## Limitaciones conocidas

- **A2P 10DLC** (US): números de SMS deben estar registrados; sin registro los mensajes se caen silenciosamente.
- **WhatsApp**: plantillas aprobadas en Meta. No se pueden enviar mensajes "libres" fuera de la ventana de 24h.
- **Throughput SMS**: depende del tipo de número (Long Code, Toll-Free, Short Code).
- **Adjuntos Email**: límite por tamaño total del mensaje (≤ 25 MB típico).
- **Emojis / Unicode en SMS**: cuentan como mensajes de 70 caracteres en vez de 160.

## Fuentes

- [Send a new message — HighLevel API](https://marketplace.gohighlevel.com/docs/ghl/conversations/send-a-new-message/index.html)
- [Conversation Providers — HighLevel API](https://marketplace.gohighlevel.com/docs/marketplace-modules/ConversationProviders/index.html)
- [Conversations API — Add Inbound Message with Contact ID](https://help.gohighlevel.com/support/solutions/articles/155000007340-conversations-api-add-inbound-message-with-contact-id-)
- [Guía práctica: messaging en GHL](https://crm-messaging.cloud/messaging-on-gohighlevel/)
- [GoHighLevel Conversation AI API Guide](https://consultevo.com/gohighlevel-conversation-ai-api-guide/)
