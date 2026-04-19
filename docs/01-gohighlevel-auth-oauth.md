# 01 — Autenticación y OAuth 2.0

## Mecanismos de autenticación disponibles

| Mecanismo | Cuándo usarlo | Notas |
|---|---|---|
| **API Key v1** | Solo integraciones heredadas con API v1 | Una key por Location. **No recomendado** para nuevo desarrollo. |
| **Private Integration Token (PIT)** | Integración **interna** de una sola Agency/Location, sin distribución a terceros | Similar a un token de servicio; creado desde el panel de GHL. No requiere flujo OAuth. |
| **OAuth 2.0 v2** | Apps del **Marketplace**, multi-tenant, distribuidas a muchas Agencies/Locations | **Estándar para kwiq-ghl-bridge**. |

## Flujo OAuth 2.0 (authorization code)

### 1. Crear la app en el marketplace

En [https://marketplace.gohighlevel.com](https://marketplace.gohighlevel.com) (cuenta de developer) creas una app y configuras:

- **App name**, logo, descripción.
- **Redirect URI(s)** — ej. `https://kwiq-ghl-bridge.vercel.app/api/oauth/callback`.
- **Scopes** requeridos (ver sección abajo).
- **Distribution type**: `Private` (para una agencia) o `Marketplace` (público).
- **PKCE opcional** (recomendado para clientes públicos).

Al crear la app obtienes `client_id` y `client_secret`.

### 2. Redirigir al usuario al endpoint de autorización

```
https://marketplace.gohighlevel.com/oauth/chooselocation
  ?response_type=code
  &redirect_uri=https://kwiq-ghl-bridge.vercel.app/api/oauth/callback
  &client_id=<CLIENT_ID>
  &scope=contacts.readonly+contacts.write+conversations.write+calendars.write
```

- Si tu app es white-label, el dominio puede ser el marketplace del sub-tenant en vez de `marketplace.gohighlevel.com`.
- El usuario elige la Agency y, si corresponde, la Location a autorizar.

### 3. Intercambiar `code` por `access_token`

El callback recibe `?code=<one_time_code>&state=<state>`. Haces POST al endpoint de token:

```http
POST https://services.leadconnectorhq.com/oauth/token
Content-Type: application/x-www-form-urlencoded
Accept: application/json

client_id=<CLIENT_ID>
&client_secret=<CLIENT_SECRET>
&grant_type=authorization_code
&code=<ONE_TIME_CODE>
&user_type=Location        // o "Company" para token de agencia
&redirect_uri=https://kwiq-ghl-bridge.vercel.app/api/oauth/callback
```

**Respuesta**:

```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "Bearer",
  "expires_in": 86399,
  "refresh_token": "eyJhbGciOi...",
  "scope": "contacts.readonly contacts.write ...",
  "userType": "Location",      // o "Company"
  "companyId": "agcy_abc123",
  "locationId": "loc_xyz789",  // solo si userType=Location
  "userId": "usr_123"
}
```

### 4. Refrescar el token

- `access_token` vive ~**24 horas**.
- `refresh_token` vive **~1 año** y **rota en cada uso** (guarda siempre el nuevo).

```http
POST https://services.leadconnectorhq.com/oauth/token
Content-Type: application/x-www-form-urlencoded

client_id=<CLIENT_ID>
&client_secret=<CLIENT_SECRET>
&grant_type=refresh_token
&refresh_token=<CURRENT_REFRESH_TOKEN>
&user_type=Location
```

### 5. De Agency token a Location token

Con un `user_type=Company` puedes emitir tokens específicos de cada Location bajo la Agency:

```http
POST https://services.leadconnectorhq.com/oauth/locationToken
Authorization: Bearer <AGENCY_ACCESS_TOKEN>
Version: 2021-07-28
Content-Type: application/x-www-form-urlencoded

companyId=<AGENCY_ID>
&locationId=<LOCATION_ID>
```

Esto habilita un patrón común en middlewares: **almacenas un solo refresh de Agency** y generas tokens de Location on-demand.

## Scopes (lista relevante)

Scopes comunes para un middleware tipo bridge:

| Scope | Permite |
|---|---|
| `contacts.readonly` | Leer contactos |
| `contacts.write` | Crear/actualizar contactos |
| `conversations.readonly` | Leer mensajes y conversaciones |
| `conversations.write` | Enviar mensajes |
| `conversations/message.readonly` | Leer mensajes (granular) |
| `conversations/message.write` | Enviar mensajes (granular) |
| `calendars.readonly` | Leer calendarios y disponibilidad |
| `calendars.write` | Crear/mover/cancelar appointments |
| `calendars/events.readonly` | Leer eventos de calendario |
| `calendars/events.write` | Escribir eventos |
| `opportunities.readonly` | Leer oportunidades |
| `opportunities.write` | Escribir oportunidades |
| `workflows.readonly` | Listar workflows |
| `locations.readonly` | Leer datos de Locations |
| `locations.write` | Modificar config de Location |
| `locations/customFields.readonly` | Leer custom fields |
| `locations/customFields.write` | Crear/editar custom fields |
| `locations/tags.readonly` / `.write` | Tags |
| `users.readonly` / `.write` | Staff y usuarios |
| `forms.readonly` / `forms.write` | Forms |
| `surveys.readonly` | Encuestas |
| `medias.readonly` / `.write` | Archivos |
| `campaigns.readonly` | Campañas legacy |
| `blogs.readonly` | Blogs |
| `businesses.readonly` | Businesses asociadas |

> ⚠️ La lista canónica vive en [marketplace.gohighlevel.com/docs/Authorization/Scopes](https://marketplace.gohighlevel.com/docs/Authorization/Scopes/index.html). Añadir scopes a una app existente requiere republicar la app y **reautorización del usuario**.

**Regla**: pedir solo los scopes mínimos; extender después.

## Ejemplo end-to-end en Node/TypeScript (Vercel API Route)

```ts
// app/api/oauth/callback/route.ts  (Next.js App Router, Vercel)
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "missing_code" }, { status: 400 });

  const body = new URLSearchParams({
    client_id: process.env.GHL_CLIENT_ID!,
    client_secret: process.env.GHL_CLIENT_SECRET!,
    grant_type: "authorization_code",
    code,
    user_type: "Location", // o "Company"
    redirect_uri: process.env.GHL_REDIRECT_URI!,
  });

  const res = await fetch("https://services.leadconnectorhq.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: "token_exchange_failed", detail: err }, { status: 502 });
  }

  const token = await res.json();
  // → Persistir en Supabase: companyId, locationId, userId, access_token, refresh_token, expires_at, scope
  // → Programar refresh periódico (cron Vercel / Supabase pg_cron)
  return NextResponse.redirect(new URL("/connected", req.url));
}
```

## Rate limits y cuotas

- **Burst**: 100 requests / 10 s por app por recurso (Location o Company).
- **Diario**: 200 000 requests / día por app por recurso.
- Respuestas 429 incluyen headers con el reset — el middleware debe implementar *exponential backoff* y cola de reintentos.

## Buenas prácticas para kwiq-ghl-bridge

1. Guardar `refresh_token` cifrado en Supabase (KMS o `pgsodium`).
2. Refrescar tokens **proactivamente** ~1h antes de expirar, no en fallo.
3. Rotar siempre `refresh_token` al uso.
4. Loguear `scope` efectivo — si un usuario deniega un scope, la app debe detectarlo.
5. Separar tablas `ghl_agencies` y `ghl_locations` con `agency_id` FK.
6. Un job en Supabase Edge Functions que revoque tokens tras inactividad larga.

## Fuentes

- [OAuth 2.0 — HighLevel API](https://marketplace.gohighlevel.com/docs/Authorization/OAuth2.0/index.html)
- [Scopes — HighLevel API](https://marketplace.gohighlevel.com/docs/Authorization/Scopes/index.html)
- [Handling Access Tokens — Target User: Agency](https://marketplace.gohighlevel.com/docs/Authorization/TargetUserAgency/index.html)
- [Handling Access Tokens — Target User: Sub-Account](https://marketplace.gohighlevel.com/docs/Authorization/TargetUserSubAccount/index.html)
- [Get Location Access Token from Agency Token](https://marketplace.gohighlevel.com/docs/ghl/oauth/get-location-access-token/index.html)
- [API Security — OAuth Consent for Marketplace Apps](https://help.gohighlevel.com/support/solutions/articles/155000005002-api-security-oauth-consent-for-marketplace-apps)
- [Private Integrations — todo lo que hay que saber](https://help.gohighlevel.com/support/solutions/articles/155000003054-private-integrations-everything-you-need-to-know)
- [HighLevel API V2 OAuth2 Helper Tool](https://www.ghlapiv2.com/)
