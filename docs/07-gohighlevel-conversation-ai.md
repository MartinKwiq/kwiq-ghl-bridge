# 07 — Conversation AI, handoff a humano y control del bot

> Tema crítico para el proyecto: el bridge orquesta cuándo el bot responde, cuándo se detiene y cuándo entra un humano.

## Los productos de IA de GHL (no confundir)

GHL tiene **varios productos de IA** separados. Para este proyecto nos importa el primero:

| Producto | Qué hace |
|---|---|
| **Conversation AI** (a.k.a. AI Employee / AI Agent) | Chatea por SMS/email/FB/IG/WA/webchat; responde preguntas entrenadas; agenda citas; cualifica leads. |
| **Voice AI** | Atiende llamadas entrantes/salientes con voz sintética. |
| **Content AI** | Redacta emails, posts, funnel copy. |
| **Reviews AI** | Responde reseñas de Google/FB. |
| **Workflow AI** (a veces "AI Step") | Nodo de IA dentro de workflows para clasificar / resumir. |

## 1. Configuración de Conversation AI

Se configura a nivel **Location** en `Settings → Conversation AI`. Elementos clave:

| Elemento | Qué define |
|---|---|
| **Name & Persona** | Nombre del agente (ej. "Sofía, asistente Kwiq") y tono (formal, casual…). |
| **Objectives / Intents** | *Booking*, *Lead Qualification*, *Support*, *Custom*. |
| **Knowledge Base** | Se entrena con URLs (ej. `https://kwiq.io/faq`), PDFs, y Q&A escritos a mano. |
| **Business Hours** | Cuándo puede responder. |
| **Channels** | SMS, email, WhatsApp, webchat, FB Messenger, IG DM, Voice AI. |
| **Calendars** | A qué calendarios puede acceder para ofrecer slots. |
| **Variables / Custom Fields** | Valores del contacto disponibles en el prompt (nombre, país, último producto…). |
| **Escalation / Handoff** | Reglas para transferir a humano (ver sección 3). |
| **Bot Status Default** | `active` / `inactive` para nuevos contactos. |

### Flow Builder (avanzado)

GHL expone un **Flow Builder** tipo nodo-a-nodo donde puedes componer:

- Nodos de *Message* (la IA responde con una línea).
- Nodos de *Decision* (branching por intención).
- Nodos de *Calendar* (ofrecer slot + crear appointment).
- Nodos de *API call* (llamar al bridge).
- Nodo de *Human Handover*.

## 2. Canales soportados y variables

El mismo bot responde en múltiples canales. En cada mensaje tiene acceso a:

- Campos estándar del contacto: `{{contact.first_name}}`, `{{contact.email}}`, etc.
- **Custom Fields**: `{{contact.customField.<key>}}`.
- **Custom Values** (nivel Location): `{{custom_value.<key>}}`.
- Metadatos de conversación: último mensaje, canal, tags.

## 3. Handoff a humano (Human Handover)

Acción nativa de Conversation AI. Los triggers más comunes:

| Trigger | Ejemplo |
|---|---|
| **Palabra clave** | El usuario escribe "hablar con humano", "agente", "supervisor". |
| **Intención detectada** | La IA reconoce que la petición está fuera de su scope. |
| **Máximo de mensajes** | Tras N turnos sin resolver. |
| **Acción manual** | Un staff pulsa "Take over" en la UI. |
| **Workflow** | Un workflow aplica un tag que fuerza handoff. |

### Qué hace el Handover (configurable)

- **Pausa el bot** por un tiempo configurable (ej. 24 h) o hasta reactivación manual.
- **Añade tag** al contacto. Tag por defecto: `human_handover`. Puede personalizarse.
- **Asigna la conversación** a un staff (por rol, pericia, round-robin).
- **Envía notificación** interna (app, email) al usuario asignado y/o a un canal Slack vía webhook.
- **Mensaje de transición** al usuario: *"Te conecto con un asesor."*

## 4. Stop Bot / pausar la IA

El estado por contacto se llama **Bot Status** y acepta:

| Estado | Significado |
|---|---|
| `active` | Bot responde normalmente. |
| `sleep` / `snooze` | Bot silenciado **temporalmente** (tiempo definido). Se despierta solo. |
| `inactive` / `off` | Bot desactivado **indefinidamente** para ese contacto. |

### Formas de cambiar el Bot Status

1. **UI**: en el hilo de Conversations → toggle "AI on/off".
2. **Workflow**: action `Update Conversation AI Bot Status` (o similar).
3. **Tag-driven**: ciertos tags predeterminados silencian el bot.
   - Tag `__stop_bot__` (o el que configures como "silencio") → Bot Status = `inactive` hasta retirar el tag.
4. **API**: llamando al endpoint de bot status del contacto (⚠️ verificar endpoint actual; soportado vía workflow action universalmente).
5. **Auto-pausa por respuesta manual**: si un staff envía un mensaje al contacto, GHL puede pausar el bot automáticamente (configuración a nivel Location).

### Reanudar el bot

- Quitar el tag (`DELETE /contacts/{id}/tags` con `["__stop_bot__"]`).
- Set Bot Status = `active` desde UI, workflow o API.

## 5. Integración con Calendarios desde la IA

Conversation AI puede **agendar citas directamente**: en la configuración se le enlazan uno o más calendarios; la IA pide hora, consulta free-slots internamente y crea el appointment. Lanza los mismos webhooks (`AppointmentCreate`) que un agendamiento manual.

## 6. Límites y consideraciones por plan

- Tokens / mensajes mensuales varían según plan y add-on de IA.
- Idiomas: soporta multi-idioma (ES/EN/PT/FR…); el prompt lo induce.
- Concurrencia: sin número público, pero se aplica rate limit compartido con la API.
- Privacidad: los datos se guardan en el mismo tenant — revisar DPA de GHL si manejas info sensible.

> ⚠️ Las cuotas exactas y los endpoints API públicos de control del bot cambian con frecuencia; verificar contra [help.gohighlevel.com](https://help.gohighlevel.com) al implementar.

## 7. Orquestación desde el middleware (kwiq-ghl-bridge)

Patrones recomendados:

### A. Dejar que la IA de GHL haga el trabajo y observar
- El bridge solo consume webhooks `InboundMessage`, `OutboundMessage` y `AppointmentCreate`.
- Usa `ContactTagUpdate` con tag `human_handover` como señal para notificar a Slack/CRM externo.

### B. Silenciar la IA durante un flujo crítico
- Bridge aplica tag `__stop_bot__` antes de ciertos mensajes (p. ej. cobros, legales).
- Tras el flujo, quita el tag y el bot vuelve.

### C. Reemplazar la IA con un LLM propio (Claude/OpenAI/Gemini)
- Bridge subscribe `InboundMessage`.
- Mantiene el bot de GHL `inactive` para esos contactos (`__stop_bot__`).
- Recibe el mensaje → llama a Claude con contexto (historial, custom fields, RAG de KB).
- Bridge responde vía `POST /conversations/messages`.
- Si Claude detecta intención de handoff → aplica tag `human_handover` + asigna staff → notificación.
- **Ventajas**: control total del prompt, del modelo, de los costos; permite RAG con tu propio stack.
- **Contra**: pierdes Flow Builder visual y algunas integraciones nativas de GHL.

### D. Híbrido con Flow Builder
- La IA de GHL maneja cualificación básica / FAQs / booking.
- Cuando el flujo detecta un intent fuera de su scope, llama a un **API node** que apunta al bridge — tu LLM propio responde para ese turno — y devuelves el texto al flow.

## 8. Ejemplo de payload: tag drive silenciamiento

```json
// Outbound: kwiq-ghl-bridge silencia el bot
POST /contacts/ct_12345/tags
Authorization: Bearer <token>
Version: 2021-07-28
Content-Type: application/json

{ "tags": ["__stop_bot__"] }
```

```json
// Inbound webhook ContactTagUpdate (evento recibido)
{
  "type": "ContactTagUpdate",
  "locationId": "loc_xyz789",
  "contactId": "ct_12345",
  "tags": ["human_handover"],
  "timestamp": "2026-04-18T15:24:00Z"
}
```

## Fuentes

- [Setting Up Conversation AI: Streamline Client Engagement](https://help.gohighlevel.com/support/solutions/articles/155000004401-setting-up-conversation-ai)
- [Human Handover Action in HighLevel's Conversation AI](https://help.gohighlevel.com/support/solutions/articles/155000005615-conversation-ai-human-handover-action)
- [Bot Status for Individual Contacts](https://help.gohighlevel.com/support/solutions/articles/155000004096-bot-status-for-individual-contacts)
- [Conversation AI Flow Builder: Setup Guide](https://help.gohighlevel.com/support/solutions/articles/155000006515-conversation-ai-flow-builder)
- [HighLevel Conversation AI Agents Dashboard](https://help.gohighlevel.com/support/solutions/articles/155000005427-conversation-ai-agents-dashboard)
- [Conversation AI — Human Handover (Changelog)](https://ideas.gohighlevel.com/changelog/conversation-ai-human-handover)
- [Have AI bot turn off permanently on a contact when staff replies (Idea)](https://ideas.gohighlevel.com/conversation-ai/p/have-ai-bot-turn-off-permanently-on-a-contact-when-staff-replies)
- [Automatically stop AI responses once a manual response is entered](https://ideas.gohighlevel.com/conversation-ai/p/automatically-stop-ai-responses-once-a-manual-response-is-entered)
- [GoHighLevel Conversation AI API Guide — consultevo](https://consultevo.com/gohighlevel-conversation-ai-api-guide/)
