# Autenticación con GoHighLevel — Guía oficial Kwiq

Este documento explica **cómo Kwiq se autentica contra GoHighLevel (GHL)** y
por qué se necesitan **dos tipos de tokens distintos**. Si vas a tocar el
provisioner, leé esto primero.

> Última actualización: 8 de mayo de 2026
> Fuentes oficiales:
> - https://help.gohighlevel.com/support/solutions/articles/155000003054-private-integrations-everything-you-need-to-know
> - https://marketplace.gohighlevel.com/docs/Authorization/PrivateIntegrationsToken/
> - https://marketplace.gohighlevel.com/docs/ghl/oauth/get-location-access-token/

---

## TL;DR

GHL tiene dos tipos de **Private Integration Token (PIT)**:

1. **Agency PIT** — generado en `Settings → Private Integrations` de la
   agencia. Sirve para operaciones a **nivel agencia**.
2. **Sub-account PIT** — generado en `Settings → Private Integrations`
   **dentro de cada sub-cuenta**. Sirve para escribir adentro de esa
   sub-cuenta específica.

**Para Kwiq, ambos son obligatorios.** El Agency PIT crea la sub-cuenta;
el Sub-account PIT configura todo lo que va adentro.

---

## Por qué dos PITs

GoHighLevel separa los permisos en dos capas:

| Operación | Funciona con Agency PIT | Funciona con Sub-account PIT |
|---|---|---|
| `POST /locations/` (crear sub-cuenta) | ✅ | ❌ (no aplica) |
| `POST /users/` (crear users) | ✅ | ✅ |
| `GET /locations/search?companyId=` | ✅ | ❌ |
| `GET /snapshots/?companyId=` | ✅ | ❌ |
| `POST /locations/{id}/tags` | ❌ → 401 | ✅ |
| `POST /locations/{id}/customFields` | ❌ → 401 | ✅ |
| `POST /locations/{id}/customValues` | ❌ → 401 | ✅ |
| `POST /opportunities/pipelines` | ❌ → 401 | ✅ |
| `POST /calendars/` | ❌ → 401 | ✅ |
| `POST /medias/upload-file` | ❌ → 401 | ✅ |

El error que devuelve GHL cuando se intenta usar Agency PIT para escribir
en una sub-cuenta es:

```
401 Unauthorized
{ "message": "The token is not authorized for this scope." }
```

Es engañoso — el Agency PIT puede tener los 22 scopes posibles y aún así
fallar. La razón es que esos scopes son a **nivel agencia**, no aplican
al contexto de la sub-cuenta.

> **Nota técnica**: GHL documenta un endpoint `POST /oauth/locationToken`
> que canjea un "Agency Access Token" por un "Location Access Token". La
> doc oficial usa la palabra "Access Token", **no PIT**. La práctica
> muestra que ese endpoint solo funciona con tokens OAuth2 propios
> (obtenidos vía marketplace app + flow de authorization code), no con
> PITs estáticos. Por eso Kwiq usa Sub-account PITs en lugar de canjear.

---

## Flow Kwiq · onboarding completo

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Admin Kwiq carga datos del cliente y aprieta "Crear proyecto"│
│    └─→ POST /locations/        usando Agency PIT  ✅            │
│        ↓ Devuelve location_id                                   │
│    └─→ POST /users/            usando Agency PIT  ✅            │
│        ↓ Crea Lucía (admin) en la sub-cuenta                    │
│        ↓ Lucía recibe correo de bienvenida de GHL              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 2. Admin Kwiq genera el SUB-ACCOUNT PIT (manual, una vez)       │
│    1. Loguearse a app.gohighlevel.com como Lucía (o agencia)    │
│    2. Entrar a la sub-cuenta de Sonrisa Andina                  │
│    3. Settings → Private Integrations → Create new Integration  │
│    4. Marcar TODOS los scopes (lista en sección abajo)          │
│    5. Save → copiar el token                                    │
│    6. Pegarlo en /admin/proyectos/sonrisa-andina → "Cargar PIT" │
│    7. Kwiq lo cifra y guarda en kwiq_projects.ghl_location_pit  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 3. Lucía recibe correo de Kwiq y hace la entrevista IA          │
│    └─→ Conversa con Sof.IA durante 25-30 minutos               │
│    └─→ Al terminar, Kwiq genera ghl_autoconfig_json + prompt    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 4. Admin Kwiq aprieta "Provisionar" — el provisioner aplica:    │
│    └─→ POST /locations/{id}/tags          usando Sub-PIT  ✅    │
│    └─→ POST /locations/{id}/customFields  usando Sub-PIT  ✅    │
│    └─→ POST /locations/{id}/customValues  usando Sub-PIT  ✅    │
│    └─→ POST /opportunities/pipelines      usando Sub-PIT  ✅    │
│    └─→ POST /calendars/                   usando Sub-PIT  ✅    │
│    └─→ POST /medias/upload-file           usando Sub-PIT  ✅    │
│    └─→ AI Agent: pendiente (API no pública aún)                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Scopes mínimos del Sub-account PIT

Cuando crees el PIT en `Settings → Private Integrations` de la
sub-cuenta, marcá **al menos** estos scopes:

### Lectura (`*.readonly`)
- `locations.readonly`
- `locations/tags.readonly`
- `locations/customFields.readonly`
- `locations/customValues.readonly`
- `opportunities.readonly`
- `calendars.readonly`
- `users.readonly`
- `contacts.readonly`
- `medias.readonly`

### Escritura (`*.write`)
- `locations/tags.write`
- `locations/customFields.write`
- `locations/customValues.write`
- `opportunities.write`
- `calendars.write`
- `users.write` (para que Kwiq pueda crear miembros del equipo después)
- `medias.write`

> **Atajo seguro**: marcá los **22 scopes**. El PIT vive solo dentro de
> esta sub-cuenta, no compromete el resto de la agencia.

---

## Almacenamiento en Kwiq

| Campo | Dónde vive | Cifrado |
|---|---|---|
| Agency PIT | `kwiq_settings.ghl.agency_pit` (cifrado con `value_enc`) | ✅ AES-256-GCM con `kwiq.encryption_key` |
| Agency Company ID | `kwiq_settings.ghl.agency_company_id` (plano) | ❌ no es secreto |
| **Sub-account PIT** | `kwiq_projects.ghl_location_pit_enc` (cifrado) | ✅ misma key |

El cifrado se aplica con la función `encryptSecret()` de
`lib/settings.ts`. La key de cifrado vive en
`process.env.KWIQ_SETTINGS_ENCRYPTION_KEY` (Vercel env var).

---

## Casos de error frecuentes

### `401 The token is not authorized for this scope`

**Causa**: estás usando Agency PIT para una operación que necesita
Sub-account PIT.

**Fix**: revisá `lib/provisioner/location-client.ts` — todas las llamadas
del provisioner deben leer el Sub-account PIT desde
`kwiq_projects.ghl_location_pit_enc`, no el Agency PIT.

### `401 Invalid token`

**Causa**: el PIT fue rotado o eliminado en GHL pero Kwiq tiene la versión
vieja cacheada.

**Fix**: regenerar PIT en GHL → cargar el nuevo en Kwiq desde el panel
del proyecto.

### `403 Insufficient permissions`

**Causa**: el PIT no tiene el scope necesario para esa operación
específica.

**Fix**: editar el PIT en GHL (`Settings → Private Integrations → Edit`)
y agregar el scope faltante. **No requiere rotar el token** — el mismo
token sigue funcionando con los nuevos scopes.

### Sub-account PIT no aparece como opción

**Causa**: feature de Private Integrations no habilitada en Labs de la
sub-cuenta.

**Fix**: dentro de la sub-cuenta → Labs → habilitar "Private
Integrations" → reload.

---

## Por qué no usamos OAuth2 marketplace flow (de momento)

Sería el flow más limpio: una sola app marketplace de Kwiq, los clientes
la "instalan" en su sub-cuenta, y Kwiq recibe un OAuth access token que
canjea por Location Access Tokens.

**Razones para postergarlo**:
1. Requiere publicar Kwiq en GHL Marketplace (proceso de revisión).
2. Requiere mantener un OAuth callback público con CSRF, refresh, etc.
3. La curva de instalación para el cliente es más alta (requiere que
   apruebe la app, scopes, etc).

Mientras Kwiq esté en fase piloto con clientes elegidos a mano, el flow
de PIT manual es más simple y suficiente. Cuando escalemos a self-service,
migramos a OAuth marketplace.

---

## Checklist para nuevos proyectos

- [ ] Agency PIT cargado en `/admin/ajustes` (una sola vez por instalación
      de Kwiq, persiste para todos los proyectos).
- [ ] Agency Company ID cargado en `/admin/ajustes`.
- [ ] Para cada nuevo proyecto:
  - [ ] Crear sub-cuenta desde `/admin/proyectos/nuevo` (usa Agency PIT).
  - [ ] Loguearse a la sub-cuenta en GHL y generar Sub-account PIT.
  - [ ] Pegar el Sub-account PIT en `/admin/proyectos/[slug]` → card "GHL
        Location PIT" → Cargar.
  - [ ] (Opcional) probar con Dry-run antes de aplicar.
  - [ ] Apretar "Aplicar a GHL".
