import type { GhlAutoConfig } from "./ghl-autoconfig";

/**
 * Modelo de 3 capas para el agente de Conversation AI de GHL.
 *
 * Ver docs/ghl/conversation-ai.md para el razonamiento. Resumen:
 *
 *   Capa 1 — Custom Values (scope Location): datos del negocio interpolables
 *            con {{custom_values.xxx}}. Ya los produce buildGhlAutoConfig.
 *   Capa 2 — Knowledge Base: contenido extenso (web URL, PDFs, FAQs).
 *            Lo produce este módulo en `knowledge_base_spec`.
 *   Capa 3 — Prompt / Instructions: SOLO comportamiento, tono, reglas, handoff.
 *            Lo produce este módulo en `prompt` (≤ 2 000 chars para el bot
 *            "Guided Form"; margen operativo a 1 800).
 *
 * Regla de oro: cualquier dato que exista como CV o en KB se referencia, no
 * se copia dentro del prompt.
 */

/** Parámetros del agente tomados del bucket `context_notes.ai_*` del autoconfig. */
export interface AgentParams {
  nombre?: string;
  tono?: string;
  objetivo?: string;
  punto_corte?: string;
  temas_prohibidos?: string | string[];
  idioma?: string;
  handoff_phrase?: string;
}

/** Refresco sugerido para una URL en el Knowledge Base. */
export type KbRefresh = "daily" | "weekly" | "monthly" | "never";

export interface KnowledgeBaseSpec {
  /** URLs a entrenar con el Enhanced Web Crawler. */
  urls: Array<{
    url: string;
    mode: "exact" | "path" | "domain";
    refresh: KbRefresh;
    note?: string;
  }>;
  /**
   * Refs a assets subidos en `branding_assets`. El agente de provisioning
   * los descarga y los sube al KB como documentos.
   */
  asset_refs: Array<{
    kind: "brandbook" | "logo" | "palette" | "font" | "other";
    note: string;
  }>;
  /** FAQs que se redactan a mano directamente en el rich-text editor de GHL. */
  manual_faqs: Array<{ q: string; a: string }>;
}

export interface ConversationAIBundle {
  /** Capa 3 — prompt puro de comportamiento. ≤ 2 000 chars. */
  prompt: string;
  /** "Concise" | "Balanced" | "Detailed" — dropdown nativo de GHL. */
  response_style: "concise" | "balanced" | "detailed";
  /** Frase literal que el agente dice al transferir a humano. */
  handoff_phrase: string;
  /** CVs que el prompt referencía por {{custom_values.xxx}}. */
  custom_values_referenced: string[];
  /** Contenido de Capa 2. */
  knowledge_base_spec: KnowledgeBaseSpec;
  /** Meta para validar y mostrar en la UI. */
  metadata: {
    name: string;
    language: string;
    tone: string;
    character_count: number;
    within_form_bot_limit: boolean; // true si prompt ≤ 2 000 chars
  };
}

/* ───────────────────── API pública ───────────────────── */

/**
 * Devuelve el bundle completo: prompt + response_style + handoff + KB spec.
 * Es lo que el agente de provisioning de GHL consume.
 */
export function buildConversationAIBundle(cfg: GhlAutoConfig): ConversationAIBundle {
  const ctx = cfg.context_notes as Record<string, unknown>;

  const agent: Required<AgentParams> = {
    nombre: pick(ctx, "ai_nombre", "ai_nombre_ia") ?? "Asistente",
    tono: pick(ctx, "ai_tono") ?? "cálido, profesional, directo",
    objetivo:
      pick(ctx, "ai_objetivo") ??
      "calificar al prospecto, responder sus dudas y, si aplica, agendar una cita con un asesor humano",
    punto_corte:
      pick(ctx, "ai_punto_corte") ??
      "el prospecto pide hablar con una persona, la conversación se desvía a quejas formales, o la consulta excede tu conocimiento",
    temas_prohibidos:
      pick(ctx, "ai_temas_prohibidos") ??
      "religión, política, consejos médicos o legales vinculantes",
    idioma: pick(ctx, "ai_idioma") ?? "español (tono neutro latinoamericano)",
    handoff_phrase:
      pick(ctx, "ai_handoff_phrase") ??
      "Te paso con una persona del equipo para que te atienda personalmente.",
  };

  const prompt = buildPromptBody(cfg, agent);
  const responseStyle = chooseResponseStyle(agent.tono);
  const kb = buildKnowledgeBaseSpec(cfg);
  const referencedCVs = extractCustomValueRefs(prompt);

  return {
    prompt,
    response_style: responseStyle,
    handoff_phrase: agent.handoff_phrase,
    custom_values_referenced: referencedCVs,
    knowledge_base_spec: kb,
    metadata: {
      name: agent.nombre,
      language: agent.idioma,
      tone: agent.tono,
      character_count: prompt.length,
      within_form_bot_limit: prompt.length <= 2000,
    },
  };
}

/**
 * Compat: devuelve sólo el string del prompt (Capa 3).
 * Se mantiene porque hay consumidores actuales que persisten sólo el texto.
 */
export function buildConversationAIPrompt(cfg: GhlAutoConfig): string {
  return buildConversationAIBundle(cfg).prompt;
}

/* ───────────────────── Generadores internos ───────────────────── */

/**
 * Construye sólo la capa 3 (comportamiento). Hace referencia a custom values
 * por nombre estable — NO inline de datos del negocio.
 */
function buildPromptBody(cfg: GhlAutoConfig, agent: Required<AgentParams>): string {
  const hasCV = buildCVIndex(cfg);

  // Referencia a la empresa: CV si existe, caso contrario nombre literal.
  const companyRef = hasCV("company_nombre")
    ? "{{custom_values.company_nombre}}"
    : cfg.company.name ?? "la empresa";

  const canBook = cfg.calendars.length > 0;
  const canHandoff = true; // siempre — es acción nativa.

  const temasProhibidosLine = Array.isArray(agent.temas_prohibidos)
    ? agent.temas_prohibidos.join(", ")
    : String(agent.temas_prohibidos ?? "");

  const lines: Array<string | null> = [
    `Sos ${agent.nombre}, asistente virtual de ${companyRef}.`,
    `Hablás en ${agent.idioma}. Tono: ${agent.tono}.`,
    ``,
    `# Objetivo`,
    agent.objetivo,
    ``,
    `# Reglas`,
    `- Respondé en 1 a 3 frases, conversacional y directo.`,
    `- Nunca inventes datos. Si no sabés algo, reconocélo y ofrecé conectar con una persona.`,
    `- Cuando haya datos del negocio, usalos tal como vienen en los custom values y en la base de conocimiento; no los repitas si no te los preguntan.`,
    `- No discutas: ${temasProhibidosLine}.`,
    `- Confirmá fechas, montos o emails repitiéndolos antes de registrarlos.`,
    `- Si el cliente escribe mal, seguí la conversación sin corregir.`,
    ``,
    `# Handoff a humano`,
    `Transferís a humano cuando: ${agent.punto_corte}.`,
    `Frase exacta para transferir: "${agent.handoff_phrase}"`,
    canHandoff ? `Disparás la acción "Human Handover" — GHL se encarga de pausar el bot y avisar al equipo.` : null,
    ``,
    canBook ? `# Agendamiento` : null,
    canBook
      ? `Tenés acceso a ${cfg.calendars.length} calendario(s). Para agendar, usá la acción "Appointment Booking" — no inventes horarios: la acción te devuelve los slots reales disponibles.`
      : null,
    ``,
    `# Estilo`,
    `Hablás como la voz de ${companyRef}. Evitás emoji salvo que el cliente los use primero. No usás jerga técnica salvo que el cliente la use.`,
  ];

  const draft = lines.filter((l) => l !== null).join("\n").trim();

  // Si nos pasamos del margen operativo (1 800), aplicamos compresión conservadora.
  return enforceLimit(draft, 1800);
}

/**
 * Selector heurístico de response_style a partir del tono descrito en la
 * entrevista. Si el cliente usa palabras como "detallado" o "extenso", elegimos
 * "detailed"; si usa "directo" / "breve", "concise"; el default es "balanced".
 */
function chooseResponseStyle(
  tono: string,
): ConversationAIBundle["response_style"] {
  const t = tono.toLowerCase();
  if (/(breve|directo|conciso|corto|rápido)/.test(t)) return "concise";
  if (/(detallado|extenso|explicativo|profundo)/.test(t)) return "detailed";
  return "balanced";
}

/**
 * Spec del Knowledge Base — qué URLs entrenar, qué PDFs mover desde Storage,
 * y qué FAQs pegar manualmente.
 */
function buildKnowledgeBaseSpec(cfg: GhlAutoConfig): KnowledgeBaseSpec {
  const spec: KnowledgeBaseSpec = { urls: [], asset_refs: [], manual_faqs: [] };

  // 1. Sitio web del cliente.
  if (cfg.company.website) {
    spec.urls.push({
      url: cfg.company.website,
      mode: "domain",
      refresh: "weekly",
      note: "Sitio corporativo del cliente — base general de conocimiento.",
    });
  }

  // 2. URLs específicas que vengan en context_notes (p. ej. 'url_catalogo', 'url_precios').
  const ctx = cfg.context_notes as Record<string, unknown>;
  for (const [key, val] of Object.entries(ctx)) {
    if (typeof val !== "string") continue;
    if (!/^(url_|web_|sitio_)/.test(key)) continue;
    if (!/^https?:\/\//.test(val)) continue;
    if (spec.urls.some((u) => u.url === val)) continue;
    spec.urls.push({
      url: val,
      mode: "path",
      refresh: refreshForKey(key),
      note: `Clave de entrevista: ${key}`,
    });
  }

  // 3. Assets binarios marcados como brandbook (los otros no son útiles para KB).
  //    El agente de provisioning lee `branding_assets` en runtime y sube sólo
  //    los mime application/pdf asociados.
  spec.asset_refs.push({
    kind: "brandbook",
    note: "Subir todos los PDFs del bucket `branding` kind=brandbook asociados al proyecto.",
  });

  // 4. FAQs rápidas deducidas de la entrevista (si existen).
  for (const [key, val] of Object.entries(ctx)) {
    if (!key.startsWith("faq_") || typeof val !== "string") continue;
    const q = key.replace(/^faq_/, "").replace(/_/g, " ");
    spec.manual_faqs.push({ q, a: val });
  }

  return spec;
}

function refreshForKey(key: string): KbRefresh {
  // Precios/disponibilidad cambian seguido → mensual no alcanza; semanal sí.
  if (/(precio|tarifa|disponibilidad|stock)/i.test(key)) return "weekly";
  return "monthly";
}

/* ───────────────────── Helpers ───────────────────── */

function pick(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return undefined;
}

/**
 * Devuelve una función que indica si una CV ya está definida en el autoconfig,
 * para decidir si en el prompt podemos usar {{custom_values.xxx}} o hay que
 * fallback al literal.
 */
function buildCVIndex(cfg: GhlAutoConfig): (key: string) => boolean {
  const set = new Set(cfg.custom_values.map((cv) => cv.key));
  return (key: string) => set.has(key);
}

/** Extrae todos los nombres de custom values referenciados por {{custom_values.xxx}}. */
function extractCustomValueRefs(prompt: string): string[] {
  const re = /\{\{\s*custom_values\.([a-z0-9_]+)\s*\}\}/gi;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt))) {
    if (m[1]) out.add(m[1]);
  }
  return Array.from(out).sort();
}

/**
 * Si el draft excede el límite, recortamos secciones opcionales (Estilo,
 * luego Handoff verbose) hasta encajar.
 */
function enforceLimit(draft: string, maxChars: number): string {
  if (draft.length <= maxChars) return draft;

  // Strategy: eliminar líneas de la sección "# Estilo" primero.
  let trimmed = dropSection(draft, "# Estilo");
  if (trimmed.length <= maxChars) return trimmed;

  // Luego comprimir handoff a su mínimo.
  trimmed = trimmed.replace(
    /GHL se encarga de pausar el bot y avisar al equipo\./,
    "GHL maneja el handoff.",
  );
  if (trimmed.length <= maxChars) return trimmed;

  // Fallback duro: truncar preservando oraciones.
  return truncateSmart(trimmed, maxChars);
}

function dropSection(s: string, heading: string): string {
  const idx = s.indexOf(heading);
  if (idx === -1) return s;
  const nextHeading = s.slice(idx + heading.length).search(/^#\s/m);
  if (nextHeading === -1) return s.slice(0, idx).trimEnd();
  return (s.slice(0, idx) + s.slice(idx + heading.length + nextHeading)).trim();
}

function truncateSmart(s: string, max: number): string {
  if (s.length <= max) return s;
  const slice = s.slice(0, max);
  const lastDot = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf(".\n"));
  return (lastDot > max * 0.7 ? slice.slice(0, lastDot + 1) : slice).trim();
}
