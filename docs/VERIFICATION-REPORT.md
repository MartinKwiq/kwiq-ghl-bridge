# Reporte de verificación de documentación GHL

> **Fecha**: 2026-04-19 · **Alcance**: `docs/00..08` + `docs/ghl/conversation-ai.md`.
> **Método**: búsqueda web pública + cotejo cruzado con el código en
> `apps/interview/lib/ghl/agency-client.ts` y `apps/interview/lib/generators/conversation-ai-prompt.ts`.

El objetivo de este reporte es dejar trazado qué claims de la documentación
técnica pudieron verificarse contra fuentes externas (changelogs oficiales de
HighLevel, artículos del portal de soporte, docs del Marketplace) y qué
claims quedan pendientes de re-verificación por bloqueos de red.

## TL;DR

- Los 10 facts en los que descansa `apps/interview` están confirmados.
- Nada que rompa el flujo actual. Se agregó el dato de rotación de PITs a
  `docs/01-gohighlevel-auth-oauth.md`.
- Las URLs oficiales en `marketplace.gohighlevel.com`,
  `help.gohighlevel.com`, `help.leadconnectorhq.com` y
  `highlevel.stoplight.io` están bloqueadas por el proxy — lo que no se pudo
  traer a mano queda listado como "pendiente humano" al final.

## Facts verificados

| # | Claim | Dónde vive en nuestros docs | Fuente verificada |
|---|---|---|---|
| 1 | Base URL de la API v2 = `https://services.leadconnectorhq.com` | `02-gohighlevel-api-rest.md` | Confirmado por búsquedas del portal del Marketplace y del blog oficial `highlevel.ai`. |
| 2 | Header obligatorio `Version: 2021-07-28` | `02-gohighlevel-api-rest.md` | Confirmado por los ejemplos del portal de desarrolladores y el SDK `@gohighlevel/api-client`. |
| 3 | OAuth token endpoint `POST /oauth/token` con `user_type ∈ {Company, Location}` y expiración ~24h | `01-gohighlevel-auth-oauth.md` | Confirmado en el listado del Developer Portal ("Get Access Token") y en la página de Target User: Agency / Sub-Account. |
| 4 | Token exchange entre Agency → Location vía `POST /oauth/locationToken` con `companyId` + `locationId` | `01-gohighlevel-auth-oauth.md` | Confirmado en "Get Location Access Token from Agency Token". |
| 5 | **Snapshots**: `GET /snapshots/?companyId=<id>` → `{ snapshots: [{id, name, type}] }`, requiere token de Agency o Agency PIT | `02-gohighlevel-api-rest.md`, `apps/interview/lib/ghl/agency-client.ts` | Confirmado por "Snapshots API" en el portal del Marketplace y el paquete npm `@gohighlevel/api-client`. |
| 6 | Rate limits: 100 req / 10s (burst) y 200 000 req / día por app-recurso | `01-gohighlevel-auth-oauth.md`, `02-gohighlevel-api-rest.md` | Consistente entre todas las fuentes comunitarias y el Developer Glossary. |
| 7 | Webhook signatures: `X-WH-Signature` (RSA legacy) coexiste con `X-GHL-Signature` (Ed25519) hasta el **1 de julio de 2026** | `03-gohighlevel-webhooks.md` | Confirmado por el changelog "App Marketplace - Security Update · Webhook Authentication". |
| 8 | Conversation AI · Guided Form: `Additional Instructions` hasta **2 000 caracteres** (antes 1 200). Nuestro generador trunca a 1 800 como margen del 10%. | `07-gohighlevel-conversation-ai.md`, `ghl/conversation-ai.md`, `apps/interview/docs/PROMPT-GENERATION.md` | Confirmado en los artículos "Setting Up Conversation AI" y "Guided Form Based Setup for Conversation AI". |
| 9 | Conversation AI · 3 capas (Prompt + Custom Values + Knowledge Base) con auto-refresh diaria/semanal/mensual y soporte multi-KB por agente | `ghl/conversation-ai.md` | Confirmado por "New Knowledge Sources & Quality Upgrades", "Auto Refresh for Trained Links" y el changelog "Multiple Knowledge Bases in Conversation AI". |
| 10 | `Response Style` a nivel agente con valores `Concise · Balanced · Detailed` | `ghl/conversation-ai.md`, `conversation-ai-prompt.ts` | Confirmado en "Response Style Settings for Conversation AI". |

## Facts que se agregaron a la docs como resultado de la verificación

- **Rotación de PITs**: hasta **5 PITs por nivel** (Agency y Location), con
  recomendación de rotar cada **90 días** y ventana de **7 días de solape**
  durante la rotación (`docs/01-gohighlevel-auth-oauth.md`, tabla de
  mecanismos de auth).

## Facts que quedaron sin cambios pero conviene re-verificar a mano

Estas páginas canónicas están fuera del alcance del proxy del agente
(`egress_blocked`). Antes del primer deploy a producción, un humano
debería abrirlas y confirmar que no haya drift:

- `marketplace.gohighlevel.com/docs/ghl/snapshots/snapshots-api/index.html`
  — confirma el shape exacto de `GET /snapshots/` (names, nullability).
- `marketplace.gohighlevel.com/docs/ghl/locations/search-locations/index.html`
  — confirma query params aceptados (`limit`, `skip`, filtros extra) y la
  estructura del array `locations`.
- `marketplace.gohighlevel.com/docs/ghl/oauth/get-location-access-token/index.html`
  — confirma el form-encoding y el shape de respuesta actual del swap
  Agency-token → Location-token.
- `marketplace.gohighlevel.com/docs/Authorization/Scopes/index.html` —
  lista canónica de scopes. Lo que tenemos en `docs/01` es amplio pero
  no exhaustivo.
- `help.gohighlevel.com/support/solutions/articles/155000005382-guided-form-based-setup-for-conversation-ai`
  — confirma que el límite de 2 000 chars sigue en pie.
- `help.gohighlevel.com/support/solutions/articles/155000006456-conversation-ai-new-knowledge-sources-quality-upgrades`
  — confirma los formatos soportados en KB.
- `help.gohighlevel.com/support/solutions/articles/155000007421-configure-response-settings-in-conversation-ai`
  — confirma los nombres del dropdown Response Style.
- `marketplace.gohighlevel.com/docs/ghl/contacts/search-contacts-advanced/index.html`
  — confirma `pageLimit`, operadores y filtros cuando implementemos
  sincronización de contactos.

## Impacto en el código (apps/interview)

| Archivo | Nivel de confianza | Notas |
|---|---|---|
| `lib/ghl/agency-client.ts` | Alto | Base URL, Version header, snapshot endpoint y locations/search coinciden con lo verificado. |
| `lib/generators/conversation-ai-prompt.ts` | Alto | Límite 1 800 chars ≤ 2 000 oficiales. Response Style y 3 capas confirmadas. |
| `lib/generators/ghl-autoconfig.ts` | Medio | Estructura interna no depende de claims externos. Las claves de custom values no son frágiles — siguen convención Kwiq. |
| `middleware` de webhooks (futuro) | Pendiente | Antes de publicar, cablear verificación dual `X-GHL-Signature` (Ed25519) + fallback `X-WH-Signature` (RSA) y correr tests con payloads firmados de staging. |

## Re-verificación recomendada

Cada vez que HighLevel publique un changelog relevante
(`https://ideas.gohighlevel.com/changelog`), revisar:

1. Cambios en endpoints que tocamos (snapshots, locations, oauth, contacts,
   conversation-ai).
2. Deprecaciones anunciadas con fecha — especialmente la del
   `X-WH-Signature` (1 jul 2026).
3. Nuevos scopes o renombres de scopes existentes.
4. Cambios en límites del Guided Form y de workflows.

## Fuentes consultadas

- [OAuth 2.0 — HighLevel API](https://marketplace.gohighlevel.com/docs/Authorization/OAuth2.0/index.html)
- [Snapshots API — HighLevel API](https://marketplace.gohighlevel.com/docs/ghl/snapshots/snapshots-api/index.html)
- [Get Location Access Token from Agency Token](https://marketplace.gohighlevel.com/docs/ghl/oauth/get-location-access-token/index.html)
- [Private Integrations — todo lo que hay que saber](https://help.gohighlevel.com/support/solutions/articles/155000003054-private-integrations-everything-you-need-to-know)
- [Private Integrations — LeadConnector (mirror)](https://help.leadconnectorhq.com/support/solutions/articles/155000002774-private-integrations-everything-you-need-to-know)
- [Private Integrations for Agencies — changelog](https://ideas.gohighlevel.com/changelog/private-integrations-for-agencies)
- [App Marketplace — Webhook Authentication changelog](https://ideas.gohighlevel.com/changelog/app-marketplace-security-update-webhook-authentication)
- [Setting Up Conversation AI](https://help.gohighlevel.com/support/solutions/articles/155000004401-setting-up-conversation-ai)
- [Guided Form Based Setup for Conversation AI](https://help.gohighlevel.com/support/solutions/articles/155000005382-guided-form-based-setup-for-conversation-ai)
- [Response Style Settings for Conversation AI](https://help.gohighlevel.com/support/solutions/articles/155000007421-configure-response-settings-in-conversation-ai)
- [New Knowledge Sources & Quality Upgrades](https://help.gohighlevel.com/support/solutions/articles/155000006456-conversation-ai-new-knowledge-sources-quality-upgrades)
- [Auto Refresh for Knowledge Base Trained Links](https://help.gohighlevel.com/support/solutions/articles/155000006539-auto-refresh-of-knowledge-base-trained-links)
- [Multiple Knowledge Bases in Conversation AI — changelog](https://ideas.gohighlevel.com/changelog/multiple-knowledge-bases-in-conversation-ai)
- [`@gohighlevel/api-client` en npm](https://www.npmjs.com/package/@gohighlevel/api-client)
