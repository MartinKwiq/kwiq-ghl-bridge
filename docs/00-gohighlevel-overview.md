# 00 — GoHighLevel: visión general de la plataforma

## ¿Qué es GoHighLevel?

**GoHighLevel** (GHL), también conocido como **HighLevel** y facturado a través de su marca técnica **LeadConnector**, es una plataforma **CRM + automatización de marketing all-in-one** orientada a agencias. Un mismo tenant puede contener CRM, email marketing, SMS, WhatsApp, funnels, sitios web, membresías, calendarios de citas, pipelines de ventas, pagos, IA conversacional y telefonía.

Su particularidad es que no se vende al cliente final: se vende a **agencias** que revenden el producto como **SaaS white-label** a sus propios clientes (sub-cuentas).

## Modelo multi-tenant: Agency ↔ Location

GHL tiene una jerarquía de dos niveles:

| Nivel | Nombre interno en API | Significado |
|---|---|---|
| **Agency** | `Company` | La cuenta raíz que contiene y administra sub-cuentas. Tiene usuarios, planes y permisos globales. |
| **Location** | `Location` (a.k.a. Sub-Account) | Una cuenta individual del cliente final, dentro de una Agency. Contiene contactos, pipelines, calendarios, workflows propios. |

En la API v2 esto se traduce en **dos tipos de tokens**:

- **Agency-level Access Token** (a.k.a. *Company token*): opera sobre recursos de agencia y puede generar tokens de cada Location.
- **Location-level Access Token** (a.k.a. *Sub-Account token*): opera sobre una sola Location — es el que usarás para la mayoría de operaciones CRM.

Un middleware típico recibe el token de Agency durante el OAuth, y luego llama al endpoint `Get Location Access Token from Agency Token` para obtener un token específico por Location antes de operar sobre sus datos.

## Planes y capacidades

Las capacidades API y de marketplace dependen del plan:

| Plan | API Keys | OAuth/Marketplace | Notas |
|---|---|---|---|
| **Starter** | Location API Key | Limitado | Solo una Location |
| **Unlimited** | Location API Key | Sí (marketplace apps consumibles) | Multi-location |
| **SaaS Pro / Agency Pro** | **Agency + Location API Keys** | Sí, publicación de apps | White-label completo |

> ⚠️ Los nombres y precios exactos cambian con frecuencia; verifica en [highlevel.com/pricing](https://www.gohighlevel.com/pricing) al momento de construir.

## Ecosistema y marca técnica

- **Dominio de marketing**: `gohighlevel.com` / `highlevel.com`.
- **Dominio técnico (API, webhooks, CDN)**: `leadconnectorhq.com`.
  - API base: `https://services.leadconnectorhq.com`
  - Marketplace de desarrolladores: `https://marketplace.gohighlevel.com`
  - Portal de ayuda: `https://help.gohighlevel.com` y `https://help.leadconnectorhq.com` (mismos artículos).
- **White-label**: cada agencia puede apuntar su propio dominio al marketplace y al panel, por eso el middleware debe ser flexible con el `marketplace domain` durante OAuth.

## Glosario operativo

| Término | Definición |
|---|---|
| **Agency / Company** | Cuenta raíz multi-tenant. |
| **Location / Sub-Account** | Cuenta del cliente final dentro de una Agency. |
| **User** | Persona con login (staff, admin, agente). |
| **Contact** | Lead o cliente (registro CRM). |
| **Opportunity** | Negocio/oportunidad comercial dentro de un Pipeline. |
| **Pipeline** | Embudo de ventas compuesto por Stages. |
| **Stage** | Etapa del pipeline (Nuevo → Contactado → Cerrado, etc.). |
| **Workflow** | Automatización visual: Trigger → Actions → Branches. |
| **Trigger** | Evento que inicia un workflow (ContactCreate, tag added, webhook, etc.). |
| **Conversation** | Hilo unificado que reúne SMS, email, WhatsApp, FB/IG y más contra un mismo contacto. |
| **Calendar** | Configuración de disponibilidad para agendar citas. |
| **Appointment** | Cita concreta agendada en un calendar. |
| **Custom Field** | Campo personalizado en contactos u oportunidades. |
| **Custom Value** | Variable reutilizable a nivel de Location (tipo "placeholder" en templates). |
| **Snapshot** | Plantilla exportable de una Location (workflows, calendarios, funnels, pipelines…). |
| **Conversation AI** | Producto de IA conversacional nativo de GHL (distinto a Content AI, Voice AI, Reviews AI). |

## API v1 vs API v2

| | **API v1 (legacy)** | **API v2 (actual)** |
|---|---|---|
| Base URL | `https://rest.gohighlevel.com/v1/` | `https://services.leadconnectorhq.com/` |
| Auth | **API Key** (una por Location) | **OAuth 2.0** (authorization code + refresh) o **Private Integration Token (PIT)** |
| Versionado | — | Header `Version: 2021-07-28` |
| Estado | Mantenimiento, sin features nuevas | Plataforma de desarrollo activa, requerida para marketplace apps |
| Marketplace | No soportado | Obligatorio para publicar apps |
| Rate limits | Menor | 100 req / 10s burst, 200 000 req / día por app por recurso |

**Regla para kwiq-ghl-bridge**: usamos **API v2 con OAuth 2.0** siempre, excepto si por compatibilidad puntual tuviéramos que tocar un endpoint que no esté migrado (en cuyo caso se documenta con `⚠️ verificar`).

## Fuentes

- [HighLevel API Documentation — Developer Portal](https://marketplace.gohighlevel.com/docs/)
- [HighLevel API Documentation — Support article](https://help.gohighlevel.com/support/solutions/articles/48001060529-highlevel-api-documentation)
- [Cómo empezar con Developer's Marketplace](https://help.gohighlevel.com/support/solutions/articles/155000000136-how-to-get-started-with-the-developer-s-marketplace)
- [GitHub: GoHighLevel/highlevel-api-docs (v2)](https://github.com/GoHighLevel/highlevel-api-docs)
- [Private Integrations: todo lo que necesitas saber](https://help.gohighlevel.com/support/solutions/articles/155000003054-private-integrations-everything-you-need-to-know)
