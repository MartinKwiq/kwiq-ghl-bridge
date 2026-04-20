# Generación del prompt de Conversation AI

Este doc explica cómo `apps/interview` produce el artefacto que el
provisioner va a cargar en la Conversation AI del cliente. **Spoiler**: no
es un solo string — es un bundle de 3 capas.

> Ver también [`docs/ghl/conversation-ai.md`](../../../docs/ghl/conversation-ai.md)
> — la referencia técnica con fuentes oficiales de HighLevel.

## TL;DR — tres capas, tres propósitos

| Capa | Artefacto | Qué guarda | Límite |
|---|---|---|---|
| 1. **Prompt** | string | Identidad, tono, reglas, objetivo | ~1800 caracteres (Guided Form) |
| 2. **Custom Values** | array `{ key, value }` | Datos estructurados del negocio | Ilimitado; se referencian con `{{custom_values.key}}` |
| 3. **Knowledge Base** | lista de fuentes (URLs, assets, FAQs) | Docs largos, catálogos, políticas | Ilimitado; se indexa aparte |

**Regla de oro**: el prompt NO tiene que repetir nada que ya esté en las
otras dos capas. Solo dicta *cómo* el agente se comporta. Los *datos*
viven en CVs, los *conocimientos largos* viven en la KB.

## Por qué no meter todo en el prompt

- **Hard limit del Guided Form**: GHL corta a 2000 caracteres. Un prompt
  con todos los datos del negocio revienta el límite al primer servicio.
- **Mantenibilidad**: si cambia el teléfono del negocio, cambiás un CV —
  no re-generás el prompt.
- **Multi-idioma/multi-marca**: el prompt se puede versionar por
  personalidad (formal vs. cercano) sin duplicar los datos.
- **Knowledge Base crawler auto-refresca**: si el cliente publica un FAQ
  nuevo en su web, la KB se actualiza sola. No hay que reentrenar nada.

## El bundle que producimos

```ts
// apps/interview/lib/generators/conversation-ai-prompt.ts

export interface ConversationAIBundle {
  /** Capa 1 — string listo para pegar en el Guided Form. */
  prompt: string;

  /** Capa 1 metadata — estilo de respuesta que sugerimos en GHL. */
  response_style: "concise" | "balanced" | "detailed";

  /** Frase exacta que el agente usa cuando corresponde handoff. */
  handoff_phrase: string;

  /**
   * Custom Values que el prompt referencia (vía `{{custom_values.xxx}}`).
   * El provisioner se asegura de que existan antes de activar el bot.
   */
  custom_values_referenced: string[];

  /** Capa 3 — qué se carga en la Knowledge Base. */
  knowledge_base_spec: {
    urls: Array<{ url: string; mode: "domain" | "path" | "exact"; refresh?: "daily" | "weekly" | "monthly" }>;
    asset_refs: Array<{ kind: "brandbook" | "palette" | "other"; branding_asset_id?: string; note?: string }>;
    manual_faqs: Array<{ question: string; answer: string }>;
  };

  metadata: {
    name: string;                  // nombre del agente (p.ej. "Sofía")
    language: string;
    tone: string;
    character_count: number;
    within_form_bot_limit: boolean;
  };
}
```

Lo persiste `generateAndPersistOutputs()` en `derived_outputs.content` bajo
`kind = "conversation_ai_prompt"`. Para compatibilidad con clientes legacy,
el campo `content.prompt` sigue conteniendo el string puro de la capa 1.

## Cómo se decide qué va en cada capa

### Capa 1 — el prompt (string)

Producido por `buildPromptBody(cfg)`. Sólo escribe:

1. **Identidad** — nombre del agente, empresa, idioma.
2. **Objetivo** — calificar, agendar, informar, soporte, mix.
3. **Reglas duras** (6 bullets) — siempre las mismas, adaptadas al tono:
   - responder en el idioma configurado,
   - no inventar datos — si no está en KB o CVs, decilo,
   - usar SIEMPRE los custom values para nombres/teléfonos/horarios,
   - no tocar temas prohibidos (los lista desde `ia_temas_prohibidos`),
   - si el pedido sale del objetivo → handoff con la frase exacta,
   - confirmar datos antes de agendar.
4. **Handoff** — la frase literal que dispara la transferencia.
5. **Agendamiento** — solo si el objetivo lo incluye.
6. **Estilo** — 1-2 líneas de tono (formal/cercano/experto).

El string se comprime vía `enforceLimit()` en este orden:
`Estilo` → `Handoff` → smart-truncate → bajo 1800 chars.

### Capa 2 — Custom Values

Vienen del autoconfig:

- Sección `informacion_general` → `mail_de_contacto`, `telefono_de_contacto`,
  `pagina_web`, `nombre_de_la_ia`, redes sociales.
- Sección `ubicaciones` → `ubicacion_a`, `direccion_a`, `google_maps_a`…
  agrupados por letra (A, B, C, …).
- `company_name` se guarda como `company_nombre` para referenciar en prompt.

El prompt los interpola con `{{custom_values.<key>}}` — el motor de GHL
resuelve eso en runtime antes de enviar cada mensaje. `extractCustomValueRefs()`
escanea el prompt final y devuelve la lista de CVs efectivamente usados
(para que el provisioner valide que existan).

### Capa 3 — Knowledge Base

`buildKnowledgeBaseSpec(cfg)` arma:

1. **URL del sitio web** (`company.website` o CV `pagina_web`) como crawl
   de dominio completo, refresh semanal.
2. **URLs sueltas** encontradas en `context_notes` con prefijo
   `url_*`, `web_*`, `sitio_*` — como exact match.
3. **Brandbook PDF** — si el cliente subió un `branding_asset` con
   `kind=brandbook`, se agrega como `asset_ref` para que el provisioner
   descargue + convierta a KB entry.
4. **FAQs manuales** — `context_notes` con prefijo `faq_*` se convierten
   en `{ question, answer }` entries.

## Persistencia y versionado

Cada regeneración crea un **nuevo registro** en `derived_outputs` con
`version = max(version)+1`. El UI de `/admin/proyectos/[slug]` muestra
siempre la última; el histórico queda disponible para rollback futuro.

El `checksum` es FNV-1a 32-bit hex del `bundle.prompt` (solo capa 1) —
suficiente para detectar cambios significativos sin depender del orden
de keys en `custom_values`.

## Oportunidades Kwiq (upsells)

La sección `oportunidades_kwiq` del schema NO alimenta el prompt del
agente — alimenta el panel admin. Los códigos detectados
(`website_build`, `branding_build`, `domain_purchase`, `hosting_setup`,
`whatsapp_line`, `crm_onboarding`) se agregan a `ghl_autoconfig.upsells`
y se renderizan como badges en `/admin/proyectos/[slug]`. La razón:
el agente habla con end-users, no con prospectos de Kwiq — mezclar esas
audiencias es un anti-patrón.

## Cómo agregar un nuevo campo al prompt

Decidí primero: ¿es comportamiento, dato o conocimiento?

- **Comportamiento** (nueva regla de tono, nueva condición de handoff) →
  editá `buildPromptBody()` en `conversation-ai-prompt.ts`. Considerá el
  impacto en el límite de 1800 chars.
- **Dato estructurado** (horario especial, nombre de dueño, precio
  promo) → agregalo al schema con `target: "ghl_custom_value"`. El prompt
  lo va a poder referenciar con `{{custom_values.<key>}}` sin cambios.
- **Conocimiento largo** (política de devoluciones, protocolo médico,
  catálogo) → agregalo como `context_note` con prefijo `faq_*` o subilo
  como branding asset. `buildKnowledgeBaseSpec()` lo recoge.

## Testing manual

```bash
cd apps/interview
npm run dev
# completá una entrevista ficticia en /demo o /entrevista/nueva
# después en /admin/proyectos/[slug] clickeá "Ver outputs"
# → deberías ver el bundle completo con las 3 capas
```

Para verificar que tsc pasa: `npx tsc --noEmit`.
