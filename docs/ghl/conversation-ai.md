# GHL Conversation AI — modelo de 3 capas

> Complementa [`docs/07-gohighlevel-conversation-ai.md`](../07-gohighlevel-conversation-ai.md) (que habla de orquestación, handoff y bot status) con el foco puesto en **cómo arma Kwiq el contenido del agente**: prompt, custom values y knowledge base.

## TL;DR

El prompt del agente NO es un monolito. GHL expone tres superficies separadas y complementarias:

| Capa | Qué lleva | Límite práctico | Cómo lo llena Kwiq |
|---|---|---|---|
| **Custom Values** (CVs) | Datos estructurados del negocio interpolables con `{{custom_values.xxx}}` | Ninguno relevante para el agente | Generador `ghl-autoconfig.ts` → uno por hallazgo de entrevista |
| **Knowledge Base** (KB) | Contenido extenso: web, PDFs, FAQs, políticas | Sin cap público; auto-chunk + rerank | URL del sitio + PDFs de branding/legales + FAQs tipeadas |
| **Prompt / Instructions** | Identidad, tono, reglas, handoff, qué hacer y qué NO | **2 000 caracteres** en "Guided Form", **~300 palabras** en Workflow Action | LLM propio genera sólo esta capa |

La regla de oro para el demo y adelante: **cualquier dato que exista en CRM o en docs entra por CVs o KB, nunca en el prompt**. El prompt se reserva para *comportamiento*.

## 1. Prompt — comportamiento, no datos

### Qué va adentro
- Identidad ("Sos Sofía, asistente virtual de Clínica Elevon").
- Idioma y tono ("español latinoamericano neutro, cálido y directo").
- Rol y objetivo ("tu trabajo es calificar consultas de pacientes nuevos y agendar valoración inicial").
- **Reglas negativas** ("nunca des diagnóstico médico; nunca prometas resultados clínicos").
- Criterios de handoff ("si el paciente pide hablar con alguien, o si la conversación sale del catálogo, decís ${handoff_phrase} y disparás el handoff").
- Estilo de respuesta (1–3 frases, sin emoji salvo que el cliente los use).

### Qué NO va adentro
- Horarios de atención (→ `{{custom_values.horario_atencion}}`)
- Catálogo de servicios (→ KB "Catálogo Elevon.pdf" o página web)
- Precios específicos (→ KB o derivar a humano)
- Políticas extensas de reembolso, cancelación, envío (→ KB)
- FAQs (→ KB)

### Límites oficiales
- **Guided Form bot** (UI formulario): campo *Additional Instructions* hasta **2 000 caracteres** (antes eran 1 200). Fuente: [Guided Form Based Setup for Conversation AI](https://help.gohighlevel.com/support/solutions/articles/155000005382-guided-form-based-setup-for-conversation-ai).
- **Flow Builder**: descripción de objetivo hasta **500 caracteres**. Fuente: [Conversation AI Flow Builder: Setup Guide](https://help.gohighlevel.com/support/solutions/articles/155000006515-conversation-ai-flow-builder).
- **Workflow AI Action** (nodo dentro de un workflow): prompt hasta **~300 palabras**. Fuente: [Increase the word limit in the workflow conversation ai prompt (idea)](https://ideas.gohighlevel.com/conversation-ai/p/increase-the-word-limit-in-the-workflow-conversation-ai-prompt).
- Son **guías, no límites estrictos** — el bot puede devolver respuestas más largas si el contexto lo pide. Fuente: [Response Style Settings for Conversation AI](https://help.gohighlevel.com/support/solutions/articles/155000007421-configure-response-settings-in-conversation-ai).

### Response Style (afecta al prompt)
GHL agregó un dropdown *Response Style* a nivel agente con tres valores: **Concise**, **Balanced** o **Detailed**. Esto reemplaza lo que antes poníamos en el prompt como "sé breve". Kwiq lo selecciona según el tono capturado en la entrevista (`ai_tono`).

## 2. Custom Values — datos estructurados

### Qué son
Variables de scope **Location** (sub-cuenta) que se interpolan en cualquier texto de GHL: prompts, emails, SMS, workflows, webchat widgets. Sintaxis:

```
{{custom_values.nombre_clave}}
```

Es el vehículo para que un agente genérico pueda responder con la info específica del negocio sin que ese dato viva dentro del prompt.

### Estructura típica generada por Kwiq

```
company_nombre             → "Clínica Elevon"
company_whatsapp           → "+54 9 11 5555 5555"
company_horario_atencion   → "Lunes a viernes 9 a 18h"
company_direccion          → "Av. Santa Fe 1234, CABA"
ai_nombre                  → "Sofía"
ai_handoff_phrase          → "Te paso con una persona del equipo."
catalogo_resumen           → "Valoraciones clínicas, odontología estética..."
```

### Ventaja operativa
Si el cliente cambia el número de WhatsApp, **no hay que regenerar el prompt** — se edita la CV. El agente responde con el valor nuevo en el siguiente turno.

### Marketplace y snapshots
GHL permite empaquetar agentes en el *AI Agent Marketplace* con sus **custom values + custom fields + workflows + calendarios** como dependencias. Cuando el snapshot clona el agente en otra sub-cuenta, arrastra las claves — por eso conviene mantener los nombres estables entre proyectos. Fuente: [Marketplace: Conversation & Voice AI Templates](https://help.gohighlevel.com/support/solutions/articles/155000005555-how-to-use-the-ai-agent-marketplace-templates-for-conversation-ai-and-voice-ai-automation).

### También interpolan campos de contacto
- `{{contact.first_name}}`, `{{contact.email}}`, `{{contact.phone}}` (estándar).
- `{{contact.customField.clave}}` para custom fields.

## 3. Knowledge Base — conocimiento extenso

### Fuentes soportadas
Según [Document Support in Knowledge Base](https://help.gohighlevel.com/support/solutions/articles/155000006671-knowledge-base-document-rich-text-support) y [New Knowledge Sources & Quality Upgrades](https://help.gohighlevel.com/support/solutions/articles/155000006456-conversation-ai-new-knowledge-sources-quality-upgrades):

| Tipo | Detalle |
|---|---|
| **Web URL (crawl)** | El *Enhanced Web Crawler* abre acordeones, clickea tabs y carga contenido dinámico. Modos: **Exact URL**, **All URLs with Path**, **All Pages in Domain**. |
| **Documentos** | PDF, DOC, DOCX, PPT, TXT — se auto-chunkean y rerankean. |
| **Rich-text editor** | Redactado directo dentro de GHL; extrae encabezados para citar pasajes. |
| **Tablas** | Para catálogos, precios, SKUs. |

### Auto-refresh (clave para sitios que cambian)
Las URLs entrenadas pueden auto-recrawlearse con cadencia **diaria / semanal / mensual**. Kwiq lo activa por defecto en mensual para la home del cliente y semanal para páginas de precios. Fuente: [Auto Refresh for Knowledge Base Trained Links](https://help.gohighlevel.com/support/solutions/articles/155000006539-auto-refresh-of-knowledge-base-trained-links).

### Múltiples KBs por agente
GHL permite asociar varias KBs a un solo agente (changelog: [Multiple Knowledge Bases in Conversation AI](https://ideas.gohighlevel.com/changelog/multiple-knowledge-bases-in-conversation-ai)). Kwiq puede separar:

- **KB base Kwiq** (compartida entre todos los clientes): cómo funciona el servicio, políticas Kwiq.
- **KB del cliente**: su sitio, catálogo, FAQs propias.
- **KB compliance**: legales, T&C, políticas de privacidad.

### Qué va en KB y qué no
- **Sí**: sitio web, PDFs de servicios, FAQs largas, T&C, políticas, casos de uso.
- **No**: datos que cambian todo el tiempo (precios volátiles → mejor API; inventario → idem).

## 4. Actions / Tools que el agente puede ejecutar

El agente puede disparar acciones sin tener que describirlas todas en el prompt. Se configuran aparte y el motor decide cuándo llamarlas.

| Acción | Qué hace | Fuente |
|---|---|---|
| **Book Appointment** | Toma uno o más calendarios; consulta disponibilidad; propone slots; crea el appointment. | [Workflow Action – Appointment Booking Conversation AI Booking Bot](https://help.gohighlevel.com/support/solutions/articles/155000003363-workflow-action-appointment-booking-conversation-ai-booking-bot) |
| **Trigger Workflow** | Se describe una *condición en lenguaje natural* ("cuando el cliente confirme que quiere una llamada"). El agente dispara el workflow y este hace el resto (tags, emails, SMS, notificación Slack…). | [Trigger a Workflow within Conversation AI](https://help.gohighlevel.com/support/solutions/articles/155000004098-trigger-a-workflow-within-conversation-ai) |
| **Human Handover** | Pausa el bot, aplica tag (`human_handover` por default), asigna staff, notifica. Ver doc 07. | [Human Handover Action](https://help.gohighlevel.com/support/solutions/articles/155000005615-conversation-ai-human-handover-action) |
| **Custom POST / webhook** (por ahora sólo Voice AI) | El agente llama a un endpoint externo con parámetros capturados en la conversación. Para Conversation AI se usa la ruta indirecta **Trigger Workflow → Webhook step**. | [Voice AI Custom Actions](https://help.gohighlevel.com/support/solutions/articles/155000005461-voice-ai-custom-actions) |

### Patrón Kwiq recomendado para acciones no nativas
1. Definir un workflow `kwiq_bridge_event` con *Webhook* step apuntando a nuestro middleware.
2. Agregar *Trigger Workflow* al agente con una descripción de condición específica por caso de uso.
3. El middleware recibe el webhook y hace lo que haga falta (escribir en BD externa, despachar Slack, actualizar Google Sheet, lo que sea).

## 5. Cómo Kwiq arma cada capa desde la entrevista

```
Entrevista (Gemini/Claude) ─┬─► lib/generators/ghl-autoconfig.ts
                             │      • custom_fields[]
                             │      • custom_values[]  ◄── datos del negocio
                             │      • tags, calendars, users, services_products
                             │
                             ├─► lib/generators/conversation-ai-prompt.ts
                             │      • system_prompt  (≤ 2 000 chars)       ◄── comportamiento
                             │      • response_style ("concise"|"balanced"|"detailed")
                             │      • handoff_phrase
                             │
                             └─► lib/generators/knowledge-base-spec.ts  (nuevo)
                                    • urls[]         (auto-refresh semanal / mensual)
                                    • pdf_refs[]     (IDs de branding_assets con mime application/pdf)
                                    • faqs_markdown  (rich-text a pegar en KB)
```

El agente de provisioning consume el JSON resultante y llama a la API de GHL en ese orden:
**CVs → KB → agente con prompt + links a KB + actions**.

## 6. Reglas de calidad para el prompt generado

1. **Nunca** incluyas datos que existan como CV o en KB — usá la referencia en su lugar.
2. **Siempre** definí un punto de corte claro (*"si te preguntan X, decís Y y disparás handoff"*).
3. **Siempre** limitá el formato de respuesta (*"1 a 3 frases"* o response_style=concise).
4. **Siempre** incluí al menos una regla negativa (qué NO hacer).
5. **Nunca** pases el prompt de 1 800 chars (margen del 10 % bajo el límite de 2 000).
6. **Siempre** validá contra la checklist antes de publicar:
   - ¿El agente sabe quién es y para quién trabaja?
   - ¿Sabe qué hacer si no sabe la respuesta?
   - ¿Sabe cómo transferir a humano?
   - ¿Conoce su idioma y tono?
   - ¿Tiene marcadas las acciones que puede tomar?

## 7. Fuentes

- [Setting Up Conversation AI](https://help.gohighlevel.com/support/solutions/articles/155000004401-setting-up-conversation-ai)
- [Customize your AI responses using Prompts](https://help.gohighlevel.com/support/solutions/articles/155000002255-customize-your-ai-responses-using-prompts)
- [AI Prompting 101 in HighLevel](https://help.gohighlevel.com/support/solutions/articles/155000002254-ai-prompting-101)
- [Training Your Conversation AI Bot](https://help.gohighlevel.com/support/solutions/articles/155000004416-training-your-conversation-ai-bot)
- [Guided Form Based Setup for Conversation AI](https://help.gohighlevel.com/support/solutions/articles/155000005382-guided-form-based-setup-for-conversation-ai)
- [Configure Advanced Bot Settings for Conversation AI](https://help.gohighlevel.com/support/solutions/articles/155000004415-advanced-settings-overview-conversation-ai)
- [Response Style Settings for Conversation AI](https://help.gohighlevel.com/support/solutions/articles/155000007421-configure-response-settings-in-conversation-ai)
- [Document Support in Knowledge Base](https://help.gohighlevel.com/support/solutions/articles/155000006671-knowledge-base-document-rich-text-support)
- [New Knowledge Sources & Quality Upgrades](https://help.gohighlevel.com/support/solutions/articles/155000006456-conversation-ai-new-knowledge-sources-quality-upgrades)
- [Enhanced Web Crawler](https://help.gohighlevel.com/support/solutions/articles/155000006625-knowledge-base-enhanced-web-crawler)
- [Auto Refresh for Knowledge Base Trained Links](https://help.gohighlevel.com/support/solutions/articles/155000006539-auto-refresh-of-knowledge-base-trained-links)
- [Multiple Knowledge Bases in Conversation AI (changelog)](https://ideas.gohighlevel.com/changelog/multiple-knowledge-bases-in-conversation-ai)
- [Trigger a Workflow within Conversation AI](https://help.gohighlevel.com/support/solutions/articles/155000004098-trigger-a-workflow-within-conversation-ai)
- [Workflow Action – Appointment Booking](https://help.gohighlevel.com/support/solutions/articles/155000003363-workflow-action-appointment-booking-conversation-ai-booking-bot)
- [Human Handover Action](https://help.gohighlevel.com/support/solutions/articles/155000005615-conversation-ai-human-handover-action)
- [Voice AI Custom Actions](https://help.gohighlevel.com/support/solutions/articles/155000005461-voice-ai-custom-actions)
- [Marketplace: Conversation & Voice AI Templates](https://help.gohighlevel.com/support/solutions/articles/155000005555-how-to-use-the-ai-agent-marketplace-templates-for-conversation-ai-and-voice-ai-automation)
- [Workflow Actions – Conversation AI](https://help.gohighlevel.com/support/solutions/articles/155000001358-workflow-actions-conversation-ai)
- [Increase word limit in workflow conversation ai prompt (idea)](https://ideas.gohighlevel.com/conversation-ai/p/increase-the-word-limit-in-the-workflow-conversation-ai-prompt)
- [AI Agents, Bots, and Builders – community roundup](https://ghl.news/post/ai-agents-bots-builders)
