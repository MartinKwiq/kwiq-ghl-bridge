# 04 — Contactos, Custom Fields, Tags, Pipelines y Opportunities

## 1. Modelo de Contacto

Un Contact es el **registro central** de GHL. Cada Location tiene su propio conjunto de contactos.

### Campos estándar (no exhaustivo)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | `ct_...` |
| `locationId` | string | FK a la Location |
| `firstName`, `lastName` | string | |
| `fullNameLowerCase` | string | generado |
| `email` | string | único por location **recomendado**, no garantizado |
| `phone` | string | E.164 (`+573001234567`) |
| `country`, `state`, `city`, `postalCode`, `address1`, `address2` | string | |
| `companyName` | string | |
| `website` | string | |
| `timezone` | string | `America/Bogota` |
| `dnd` | boolean | *Do Not Disturb* global |
| `dndSettings` | object | DND por canal (SMS, email, WhatsApp…) |
| `source` | string | origen (form, api, meta ads…) |
| `type` | string | `lead` / `customer` |
| `assignedTo` | string | `userId` del staff dueño |
| `tags` | string[] | |
| `customFields` | array | `{ id, value }` |
| `dateAdded`, `dateUpdated` | ISO-8601 | |
| `attributionSource` | object | UTM y tracking |

### CRUD principal

| Operación | Método + Path |
|---|---|
| Crear | `POST /contacts/` |
| Obtener por id | `GET /contacts/{contactId}` |
| Actualizar | `PUT /contacts/{contactId}` |
| Borrar | `DELETE /contacts/{contactId}` |
| Upsert por email/phone | `POST /contacts/upsert` |
| Buscar | `POST /contacts/search` (body con filters + pagination) |
| Listar por Location | `GET /contacts/?locationId=...&limit=100` |

### Ejemplo upsert (patrón estándar del bridge)

```bash
curl -X POST "https://services.leadconnectorhq.com/contacts/upsert" \
  -H "Authorization: Bearer $GHL_TOKEN" \
  -H "Version: 2021-07-28" \
  -H "Content-Type: application/json" \
  -d '{
    "locationId": "loc_xyz789",
    "email": "martin@kwiq.io",
    "phone": "+573001234567",
    "firstName": "Martín",
    "source": "kwiq-ghl-bridge",
    "tags": ["imported"]
  }'
```

Respuesta incluye `new: true|false` y el `contact`.

## 2. Custom Fields

GHL soporta custom fields a nivel de Location. Dos ámbitos: **Contact** y **Opportunity**.

### Tipos de Custom Field

| Tipo | Descripción |
|---|---|
| `TEXT` | Texto libre corto |
| `LARGE_TEXT` | Texto largo / textarea |
| `NUMERICAL` | Numérico |
| `PHONE` | Teléfono |
| `MONETARY` | Moneda |
| `DATE` | Fecha |
| `DROPDOWN` / `SINGLE_OPTIONS` | Selector único |
| `RADIO` | Radio |
| `CHECKBOX` | Checkboxes (múltiples) |
| `TEXTBOX_LIST` | Lista de textos |
| `FILE_UPLOAD` | Archivo adjunto |
| `SIGNATURE` | Firma |

> ⚠️ Los nombres exactos en la API pueden venir en mayúsculas o guiones (ej. `LARGE_TEXT` vs `TEXTAREA`). Verifica contra `GET /locations/{locationId}/customFields`.

### Endpoints relevantes

```
GET    /locations/{locationId}/customFields
POST   /locations/{locationId}/customFields
PUT    /locations/{locationId}/customFields/{customFieldId}
DELETE /locations/{locationId}/customFields/{customFieldId}
```

### Uso al crear/actualizar contactos

```json
"customFields": [
  { "id": "cf_pais", "value": "Colombia" },
  { "id": "cf_fecha_nacimiento", "value": "1992-05-12" },
  { "id": "cf_tipo_lead", "value": "Comprador" }
]
```

Se puede enviar por `id` **o** por `key` (nombre interno); preferir `id` para estabilidad.

## 3. Tags

Texto libre normalizado que sirve para **segmentación y disparar workflows**. No tienen tipado.

Operaciones comunes:

```
POST /contacts/{contactId}/tags   { "tags": ["vip","2026"] }
DELETE /contacts/{contactId}/tags { "tags": ["vip"] }
GET  /locations/{locationId}/tags
```

Patrón muy usado en el bridge: tag `__stop_bot__` para pausar la IA (ver doc 07).

## 4. Pipelines y Opportunities

### Modelo

```
Pipeline (1) ── (N) Stage (1) ── (N) Opportunity
```

- Un **Pipeline** tiene `name`, `locationId` y una lista ordenada de **Stages**.
- Una **Opportunity** pertenece a un `pipelineId` + `pipelineStageId`, y puede tener `status` = `open | won | lost | abandoned`.

### Campos clave de Opportunity

| Campo | Tipo |
|---|---|
| `id` | string |
| `name` | string |
| `pipelineId` | string |
| `pipelineStageId` | string |
| `status` | `open`/`won`/`lost`/`abandoned` |
| `monetaryValue` | number |
| `contactId` | string (FK) |
| `assignedTo` | string (userId) |
| `source` | string |
| `customFields` | array |

### Endpoints

```
GET  /opportunities/pipelines?locationId=...
GET  /opportunities/search?location_id=...&pipeline_id=...&pipeline_stage_id=...
POST /opportunities/
GET  /opportunities/{opportunityId}
PUT  /opportunities/{opportunityId}
DELETE /opportunities/{opportunityId}
PUT  /opportunities/{opportunityId}/status   { "status": "won" }
```

### Ejemplo: crear oportunidad al recibir un lead

```bash
curl -X POST "https://services.leadconnectorhq.com/opportunities/" \
  -H "Authorization: Bearer $GHL_TOKEN" \
  -H "Version: 2021-07-28" \
  -H "Content-Type: application/json" \
  -d '{
    "locationId": "loc_xyz789",
    "pipelineId": "pl_abc",
    "pipelineStageId": "pls_new",
    "contactId": "ct_12345",
    "name": "Nuevo lead — Martín Kwiq",
    "monetaryValue": 1200,
    "status": "open",
    "source": "kwiq-ghl-bridge"
  }'
```

## 5. Notes y Tasks

Entidades asociadas a Contactos.

```
POST   /contacts/{contactId}/notes      { "body": "..." }
GET    /contacts/{contactId}/notes
DELETE /contacts/{contactId}/notes/{noteId}

POST   /contacts/{contactId}/tasks      { "title": "...", "dueDate": "...", "assignedTo": "..." }
PUT    /contacts/{contactId}/tasks/{taskId}
DELETE /contacts/{contactId}/tasks/{taskId}
```

## 6. Casos de uso típicos en kwiq-ghl-bridge

1. **Sync bidireccional con otro CRM**
   - External CRM → Supabase → `POST /contacts/upsert` (con dedupe por email+phone).
   - Webhook `ContactUpdate` → Supabase → sistema externo.
2. **Enriquecimiento**
   - Al llegar `ContactCreate`, llamar a API externa (Clearbit, Apollo) y `PUT` de campos custom.
3. **Auto-creación de Opportunity por tag**
   - Webhook `ContactTagUpdate` con tag `interested` → `POST /opportunities/` en pipeline definido.
4. **Reporting unificado**
   - Volcar `ContactCreate`, `OpportunityStageUpdate`, `OpportunityStatusUpdate` a `ghl_events` en Supabase y construir dashboards (Metabase, Looker Studio).

## Fuentes

- [Contacts — HighLevel API](https://marketplace.gohighlevel.com/docs/ghl/contacts/contacts/index.html)
- [Custom Fields V2 API](https://marketplace.gohighlevel.com/docs/ghl/custom-fields/custom-fields-v-2-api/index.html)
- [Get Custom Fields (Location)](https://marketplace.gohighlevel.com/docs/ghl/locations/get-custom-fields/index.html)
- [Create / Update Custom Field](https://marketplace.gohighlevel.com/docs/ghl/locations/create-custom-field/index.html)
- [Cómo crear y usar Custom Fields](https://help.gohighlevel.com/support/solutions/articles/48001161579-how-to-use-custom-fields)
- [Contact Types en HighLevel](https://help.gohighlevel.com/support/solutions/articles/155000001302-contact-type)
