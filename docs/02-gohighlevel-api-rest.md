# 02 — API REST v2

## Convenciones generales

| | Valor |
|---|---|
| **Base URL** | `https://services.leadconnectorhq.com` |
| **Header de versión** | `Version: 2021-07-28` (obligatorio en la mayoría de endpoints) |
| **Autorización** | `Authorization: Bearer <access_token>` |
| **Content-Type** | `application/json` en POST/PUT/PATCH |
| **Formato de respuesta** | JSON |

Todos los ejemplos asumen estos headers.

## Mapa de recursos principales

```
/oauth/…                  Auth y token exchange
/locations/…              Sub-cuentas (incluye custom fields, custom values, tags)
/users/…                  Staff y usuarios
/contacts/…               CRUD contactos, tags, notas, tareas, custom fields
/conversations/…          Threads, mensajes (inbound/outbound), providers
/calendars/…              Calendarios, slots libres, appointments
/opportunities/…          Oportunidades, pipelines, stages
/workflows/…              Listado, ejecución, suscripciones
/forms/…                  Formularios
/surveys/…                Encuestas
/campaigns/…              Campañas legacy
/products/…               Productos y precios (e-commerce/funnels)
/invoices/…               Facturación
/payments/…               Transacciones
/snapshots/…              Snapshots (solo Agency)
/social-media-posting/…   Social planner
/medias/…                 Librería de archivos
/businesses/…             Empresas asociadas a contactos
/custom-objects/…         Custom objects y relaciones
```

> La documentación canónica de cada endpoint vive en `https://marketplace.gohighlevel.com/docs/` con la ruta `/ghl/<recurso>/<acción>/index.html`.

## Paginación

Dos estilos comunes según el endpoint:

1. **`limit` + `skip`** (desplazamiento clásico)
   ```
   GET /contacts/?locationId=loc_xyz&limit=100&skip=200
   ```
2. **`limit` + `startAfterId` + `startAfter`** (cursor, recomendado para listados grandes)
   ```
   GET /conversations/search?locationId=loc_xyz&limit=50&startAfterId=cnv_123&startAfter=1737100000000
   ```

Siempre iterar hasta que la respuesta devuelva `meta.nextPageUrl` = `null` o menos items de los solicitados.

## Estructura de error

```json
{
  "statusCode": 400,
  "message": "locationId is required",
  "error": "Bad Request"
}
```

Códigos típicos: `400` (validación), `401` (token inválido/expirado), `403` (scope faltante), `404` (recurso o Location), `422` (JSON semánticamente inválido), `429` (rate limit), `5xx` (GHL).

## Rate limits

- **Burst**: 100 req / 10 s por app, por recurso (Location o Company).
- **Diario**: 200 000 req / día por app, por recurso.
- Respetar `Retry-After` en 429.

## Ejemplos de uso

### Crear un contacto

```bash
curl -X POST "https://services.leadconnectorhq.com/contacts/" \
  -H "Authorization: Bearer $GHL_TOKEN" \
  -H "Version: 2021-07-28" \
  -H "Content-Type: application/json" \
  -d '{
    "locationId": "loc_xyz789",
    "firstName": "Martín",
    "lastName": "Kwiq",
    "email": "martin@kwiq.io",
    "phone": "+573001234567",
    "tags": ["lead", "from-api"],
    "source": "kwiq-ghl-bridge",
    "customFields": [
      { "id": "cf_abc", "value": "Colombia" }
    ]
  }'
```

### Buscar contactos

```bash
curl -X POST "https://services.leadconnectorhq.com/contacts/search" \
  -H "Authorization: Bearer $GHL_TOKEN" \
  -H "Version: 2021-07-28" \
  -H "Content-Type: application/json" \
  -d '{
    "locationId": "loc_xyz789",
    "pageLimit": 100,
    "filters": [
      { "field": "email", "operator": "eq", "value": "martin@kwiq.io" }
    ]
  }'
```

### Obtener slots libres de un calendario

```bash
curl -X GET "https://services.leadconnectorhq.com/calendars/cal_123/free-slots?startDate=2026-04-20&endDate=2026-04-25&timezone=America/Bogota" \
  -H "Authorization: Bearer $GHL_TOKEN" \
  -H "Version: 2021-07-28"
```

### Enviar un SMS

```bash
curl -X POST "https://services.leadconnectorhq.com/conversations/messages" \
  -H "Authorization: Bearer $GHL_TOKEN" \
  -H "Version: 2021-07-28" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "SMS",
    "contactId": "ct_abc123",
    "message": "Hola Martín, gracias por escribir a Kwiq."
  }'
```

### Fetch helper en TypeScript

```ts
// lib/ghl.ts
export type GhlTokens = { access_token: string; refresh_token: string; expires_at: number };

export async function ghl<T>(path: string, opts: RequestInit & { token: string } ): Promise<T> {
  const res = await fetch(`https://services.leadconnectorhq.com${path}`, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${opts.token}`,
      "Version": "2021-07-28",
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GHL ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}
```

## Errores comunes al integrar

| Síntoma | Causa frecuente |
|---|---|
| `401 Invalid JWT` | `access_token` expirado; refrescar. |
| `401 Unauthorized` | Scope faltante o token de Agency usado en endpoint de Location (o viceversa). |
| `403 Forbidden` | Plan del sub-account no habilita el recurso (p.ej. IA sin add-on). |
| `422 Unprocessable` | Campo obligatorio ausente (muy común con `locationId`). |
| `429 Too Many Requests` | Burst rebasado — backoff exponencial. |
| Respuesta vacía | Faltó `Version` header. |

## Fuentes

- [HighLevel API Documentation — Developer Portal](https://marketplace.gohighlevel.com/docs/)
- [GitHub: GoHighLevel/highlevel-api-docs](https://github.com/GoHighLevel/highlevel-api-docs)
- [API reference — Revset Labs blog](https://revsetlabs.com/blog/highlevel-api-documentation/)
- [GoHighLevel API & Webhooks Developer Quick-Start](https://www.highlevel.ai/blog/gohighlevel-api-webhooks-guide)
