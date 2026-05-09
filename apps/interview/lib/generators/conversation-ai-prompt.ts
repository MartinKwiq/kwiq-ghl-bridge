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
 *            Lo produce este módulo en `prompt`.
 *
 * Regla de oro: cualquier dato que exista como CV o en KB se referencia, no
 * se copia dentro del prompt.
 *
 * **Versión 2** (mayo 2026):
 *  - Mide en PALABRAS (no caracteres). Target 1200-1400 palabras, máx 2000
 *    (límite duro de GHL Conversation AI).
 *  - Estructura por bloques siguiendo el patrón Kwiq:
 *      📌 ROL / IDENTIDAD
 *      🎯 OBJETIVO PRINCIPAL
 *      🧭 FLUJO
 *      📚 CATÁLOGO
 *      📍 SEDES / UBICACIONES
 *      📅 CALENDARIOS
 *      🟥 GUARDRAILS
 *      🏢 REGLAS ADICIONALES
 *  - Variables del cliente referenciadas vía {{custom_values.xxx}} cuando
 *    están disponibles en el autoconfig — datos largos NO se copian inline.
 *  - Reglas anti-fuga (sin placeholders, sin IDs, sin nombres técnicos).
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
  /** "tu" | "usted" — si no se setea, se infiere por idioma/rubro. */
  forma_de_trato?: "tu" | "usted";
  /** Saludo textual del primer mensaje. */
  saludo_inicial?: string;
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
  /** Capa 3 — prompt puro de comportamiento. */
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
    word_count: number;
    character_count: number;
    /** true si el prompt está dentro del límite de 2000 palabras de GHL. */
    within_ghl_limit: boolean;
    /** Bloques que componen el prompt — útil para debug y UI. */
    blocks: Array<{ name: string; words: number }>;
  };
}

/* ───────────────────── Constantes ───────────────────── */

/** Límite duro de GHL Conversation AI. */
const GHL_PROMPT_WORD_LIMIT = 2000;
/** Margen operativo para no rozar el límite. */
const SAFE_WORD_LIMIT = 1900;

/* ───────────────────── API pública ───────────────────── */

export function buildConversationAIBundle(cfg: GhlAutoConfig): ConversationAIBundle {
  const ctx = cfg.context_notes as Record<string, unknown>;

  const formaDeTrato = (pick(ctx, "ai_forma_de_trato") ?? inferFormaDeTrato(cfg)) as
    | "tu"
    | "usted";

  const agent: Required<AgentParams> = {
    nombre: pick(ctx, "ai_nombre", "ai_nombre_ia", "nombre_de_la_ia") ?? "Sof.IA",
    tono:
      pick(ctx, "ai_tono") ??
      "cálido, profesional, empático y resolutivo",
    objetivo:
      pick(ctx, "ai_objetivo") ??
      "calificar al prospecto, responder dudas frecuentes, agendar citas y transferir a un humano cuando corresponda",
    punto_corte:
      pick(ctx, "ai_punto_corte") ??
      "el prospecto pide explícitamente hablar con una persona; menciona dolor o urgencia médica/operativa; presenta un reclamo o queja; pregunta por presupuestos complejos o descuentos especiales fuera de los configurados; o hace consultas que requieren evaluación profesional",
    temas_prohibidos:
      pick(ctx, "ai_temas_prohibidos") ??
      "diagnósticos médicos o legales vinculantes, recomendación de medicamentos, política, religión, temas no relacionados con el negocio",
    idioma: pick(ctx, "ai_idioma") ?? "español neutro",
    handoff_phrase:
      pick(ctx, "ai_handoff_phrase") ??
      "Te paso con una persona del equipo para que te atienda personalmente.",
    forma_de_trato: formaDeTrato,
    saludo_inicial:
      pick(ctx, "ai_saludo_inicial") ??
      buildDefaultSaludo(
        pick(ctx, "ai_nombre", "ai_nombre_ia", "nombre_de_la_ia") ?? "Sof.IA",
        cfg.company.name ?? "el negocio",
        formaDeTrato,
      ),
  };

  const { prompt, blocks } = buildPromptBody(cfg, agent);
  const responseStyle = chooseResponseStyle(agent.tono);
  const kb = buildKnowledgeBaseSpec(cfg);
  const referencedCVs = extractCustomValueRefs(prompt);
  const wordCount = countWords(prompt);

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
      word_count: wordCount,
      character_count: prompt.length,
      within_ghl_limit: wordCount <= GHL_PROMPT_WORD_LIMIT,
      blocks,
    },
  };
}

/** Compat: devuelve sólo el string del prompt (Capa 3). */
export function buildConversationAIPrompt(cfg: GhlAutoConfig): string {
  return buildConversationAIBundle(cfg).prompt;
}

/* ───────────────────── Builder principal ───────────────────── */

interface BlockReport {
  name: string;
  words: number;
}

/**
 * Construye el prompt completo concatenando bloques con headers visuales.
 * Cada bloque puede omitirse si no aplica (ej. CATÁLOGO si el cliente no
 * tiene servicios definidos).
 */
function buildPromptBody(
  cfg: GhlAutoConfig,
  agent: Required<AgentParams>,
): { prompt: string; blocks: BlockReport[] } {
  const cv = buildCVIndex(cfg);

  const blocks: Array<{ name: string; content: string }> = [];

  blocks.push({ name: "ROL", content: buildRolBlock(cfg, agent, cv) });
  blocks.push({ name: "ESTILO", content: buildEstiloBlock(agent) });
  blocks.push({ name: "EMOJIS", content: buildEmojiBlock(cfg) });
  blocks.push({ name: "OBJETIVO", content: buildObjetivoBlock(cfg, agent) });
  blocks.push({ name: "FLUJO", content: buildFlujoBlock(cfg, agent) });

  const cat = buildCatalogoBlock(cfg, cv);
  if (cat) blocks.push({ name: "CATÁLOGO", content: cat });

  const sedes = buildSedesBlock(cfg, cv);
  if (sedes) blocks.push({ name: "SEDES", content: sedes });

  const cal = buildCalendariosBlock(cfg);
  if (cal) blocks.push({ name: "CALENDARIOS", content: cal });

  blocks.push({ name: "TRANSFERENCIA", content: buildTransferenciaBlock(agent) });
  blocks.push({ name: "GUARDRAILS", content: buildGuardrailsBlock(agent) });

  const reglasAd = buildReglasAdicionalesBlock(cfg);
  if (reglasAd) blocks.push({ name: "REGLAS ADICIONALES", content: reglasAd });

  blocks.push({ name: "CIERRE", content: buildCierreBlock(agent) });

  let draft = blocks.map((b) => b.content).join("\n\n");

  // Si nos pasamos del límite, dropear bloques opcionales en orden de
  // prioridad ascendente.
  draft = enforceWordLimit(draft, blocks);

  const finalReport: BlockReport[] = blocks.map((b) => ({
    name: b.name,
    words: countWords(b.content),
  }));

  return { prompt: draft.trim(), blocks: finalReport };
}

/* ───────────────────── Bloques individuales ───────────────────── */

function buildRolBlock(
  cfg: GhlAutoConfig,
  agent: Required<AgentParams>,
  cv: (k: string) => boolean,
): string {
  const negocio = cv("nombre_del_negocio")
    ? "{{custom_values.nombre_del_negocio}}"
    : cfg.company.name ?? "el negocio";
  const nombreIa = cv("nombre_de_la_ia")
    ? "{{custom_values.nombre_de_la_ia}}"
    : agent.nombre;

  return `📌 ROL
Sos ${nombreIa}, asistente virtual de ${negocio}.
Actuás como persona del equipo — no revelás que sos IA salvo que el usuario te pregunte directamente.
Tono: ${agent.tono}.
Saludo SOLO en el primer mensaje del cliente:
"${agent.saludo_inicial}"
Después del primer turno, NUNCA volver a saludar ni a presentarte. Tampoco usar "buenos días/tardes/noches".`;
}

function buildEstiloBlock(agent: Required<AgentParams>): string {
  const t = agent.forma_de_trato;
  if (t === "usted") {
    return `🗣️ ESTILO
- Trato de "usted" por defecto.
- Cambiar a "tú" SOLO si el usuario usa "tú/te/tuyo" o verbos en 2da persona ("¿puedes?", "tu cita"). Frases como "quiero", "necesito", "me gustaría" NO son tuteo — ante duda, mantener "usted".
- "Usted" aplica también a:
  · Imperativos: comparta, indíqueme, envíelo, proporcione (NO compártelo, dime, envíalo).
  · Pronombres átonos: le, lo, la (NO te). Ej: "le envío", "le confirmo".
  · Posesivos: su, sus (NO tu, tus). Ej: "su cita", "su correo".
- Mensajes claros, breves, resolutivos.
- Sin MAYÚSCULAS completas. Sin signos múltiples (¡¡¡ / ???).
- Cerrar con frase amable o pregunta que invite a continuar.`;
  }
  return `🗣️ ESTILO
- Trato de "tú" por defecto, en español neutro de la región.
- Tono cercano y amable sin perder profesionalismo.
- Mensajes claros, breves, resolutivos.
- Sin MAYÚSCULAS completas. Sin signos múltiples (¡¡¡ / ???).
- Cerrar con frase amable o pregunta que invite a continuar.`;
}

function buildEmojiBlock(cfg: GhlAutoConfig): string {
  // Heurística: si el cliente declaró ser cálido/casual, permitir emojis.
  const ctx = cfg.context_notes as Record<string, unknown>;
  const tono = String(ctx.ai_tono ?? "").toLowerCase();
  const minimoEmoji = /(formal|serio|sobrio|profesional)/i.test(tono) && !/cálido|cercano/i.test(tono);
  if (minimoEmoji) {
    return `😊 EMOJIS
Uso muy moderado. Máximo 1 emoji por mensaje, solo al final, y solo en cierres amables o confirmaciones (✅).
Permitidos: 😊 ✅ ℹ️ 📅 📍.
Nunca emojis en precios, direcciones, links o mensajes de error.`;
  }
  return `😊 EMOJIS — REGLA ESTRICTA
Antes de enviar cualquier respuesta, contar los emojis del mensaje. Si hay más de 2, eliminar los excedentes.
Nunca repetir el mismo emoji en un mismo mensaje.
Solo al final o destacando un dato puntual.
Nunca en precios, URLs, direcciones, códigos o mensajes de error.
Permitidos: 😊 ✅ ℹ️ 📝 ⏱️ 🕒 📅 📍 🏥 🚗 🏠`;
}

function buildObjetivoBlock(
  cfg: GhlAutoConfig,
  agent: Required<AgentParams>,
): string {
  const acciones: string[] = [];
  if (cfg.calendars.length > 0) acciones.push("✳️ Agendar citas usando la acción Appointment Booking");
  acciones.push("✳️ Calificar prospectos y recopilar datos de contacto");
  acciones.push("✳️ Responder dudas frecuentes sobre servicios, precios y políticas");
  acciones.push("✳️ Informar precios públicos configurados");
  acciones.push("✳️ Transferir a un humano cuando corresponda (ver sección TRANSFERENCIA)");
  acciones.push("✳️ Completar datos del contacto: {{contact.first_name}}, {{contact.last_name}}, {{contact.email}}, {{contact.phone}}");

  return `🎯 OBJETIVO PRINCIPAL
${agent.objetivo}.

Acciones que podés detonar:
${acciones.join("\n")}

NUNCA cierras una venta tú directamente. NUNCA inventás horarios, precios, promociones ni descuentos que no estén explícitamente configurados.`;
}

function buildFlujoBlock(
  cfg: GhlAutoConfig,
  agent: Required<AgentParams>,
): string {
  const usted = agent.forma_de_trato === "usted";
  const podes = usted ? "podría" : "podrías";
  const tu = usted ? "su" : "tu";
  const teTransfiero = usted ? "lo conecto" : "te conecto";

  const lines = [
    `🧭 FLUJO`,
    ``,
    `1️⃣ INTENCIÓN`,
    `Identificá qué necesita el cliente antes de pedir datos. Posibles intenciones: agendar cita, consultar precios, pedir información, dudas sobre servicios, urgencia, otra.`,
    `Una pregunta a la vez. No saturar.`,
    ``,
    `2️⃣ CALIFICACIÓN`,
    `Si el cliente quiere agendar, primero entendé el motivo / servicio que necesita. Después confirmá modalidad (presencial, sucursal, etc).`,
    `Si pide precios y son públicos (configurados en {{custom_values}}), darlos directo sin pedir datos primero.`,
    ``,
    `3️⃣ SOLICITUD DE DATOS`,
    `Pedí los datos UNO POR UNO, no todos juntos. Formato exacto:`,
    `${usted ? `"¿${podes} compartirme su nombre completo, por favor?"` : `"¿${podes} compartirme tu nombre completo?"`}`,
    `→ Se separa automáticamente en {{contact.first_name}} y {{contact.last_name}}.`,
    `${usted ? `"¿Cuál es ${tu} correo electrónico?"` : `"¿Cuál es ${tu} correo electrónico?"`} → {{contact.email}}`,
    `${usted ? `"¿Cuál es ${tu} número de teléfono?"` : `"¿Cuál es ${tu} número de teléfono?"`} → {{contact.phone}}`,
    ``,
    `PARSEO DEL NOMBRE COMPLETO`,
    `Convención latinoamericana — usar SIEMPRE lo que escribió el usuario, no el nombre de WhatsApp:`,
    `- 2 palabras: 1 nombre + 1 apellido (ej. "Juan Pérez").`,
    `- 3 palabras: 1 nombre + 2 apellidos (ej. "Martín Gómez Leyva" → Nombre: Martín / Apellidos: Gómez Leyva).`,
    `- 4+ palabras: las 2 últimas son apellidos paterno y materno; las anteriores son nombres.`,
    `- Apellidos con preposiciones ("de", "del", "de la", "y") cuentan como parte del apellido contiguo.`,
    `Si hay duda, preguntá para confirmar.`,
    ``,
    `4️⃣ AGENDADO (si aplica)`,
    cfg.calendars.length > 0
      ? `Disparás la acción Appointment Booking — la acción te devuelve los slots reales disponibles del calendario configurado. NUNCA inventés horarios.`
      : `Si el cliente quiere agendar, ${teTransfiero} con el equipo (la cuenta no tiene calendarios automáticos configurados todavía).`,
    `Tras elegir horario, confirmá: "${usted ? `Confirmando su cita para [Servicio] el [día y hora] en [Sede]. A nombre de [nombre], correo [email]. ✅` : `Confirmando tu cita para [Servicio] el [día y hora] en [Sede]. A nombre de [nombre], correo [email]. ✅`}"`,
    ``,
    `5️⃣ CIERRE`,
    `Agradecé y dejá la puerta abierta:`,
    `${usted ? `"Cualquier otra consulta, estoy a su disposición. 😊"` : `"Si te queda alguna duda, estoy por acá. 😊"`}`,
  ];
  return lines.join("\n");
}

function buildCatalogoBlock(
  cfg: GhlAutoConfig,
  cv: (k: string) => boolean,
): string | null {
  const services = cfg.services_products;
  if (!services || services.length === 0) return null;

  // Si hay muchos servicios o son largos, mover a custom_values.
  const totalChars = services.reduce(
    (acc, s) => acc + JSON.stringify(s).length,
    0,
  );

  if (totalChars > 1500 && cv("listado_servicios")) {
    return `📚 CATÁLOGO
Fuente única — siempre consultá {{custom_values.listado_servicios}} antes de responder sobre servicios, precios o categorías.

REGLAS DE LECTURA:
- Coincidencias exactas. Repetí el nombre, precio y duración tal como aparecen.
- Si el servicio NO existe en el catálogo, decilo claro y pedí aclaración. UNA pregunta a la vez.
- Si el servicio tiene variantes (ej. "Limpieza profunda" vs "Limpieza estándar"), preguntá cuál antes de ofrecer horarios.`;
  }

  // Catálogo inline (corto)
  const lines = ["📚 CATÁLOGO"];
  for (const s of services.slice(0, 10)) {
    const nombre = (s.nombre as string) ?? (s.name as string) ?? "";
    const precio = (s.precio_publico as string) ?? (s.precio as string) ?? "";
    const duracion = (s.duracion_min as string) ?? "";
    if (!nombre) continue;
    const partes = [`- ${nombre}`];
    if (precio) partes.push(`precio: ${precio}`);
    if (duracion) partes.push(`duración: ${duracion} min`);
    lines.push(partes.join(" · "));
  }
  lines.push(``);
  lines.push(`REGLAS DE LECTURA:`);
  lines.push(`- Repetí precio y duración como aparecen, sin redondeos.`);
  lines.push(`- Si el servicio no está en la lista, decilo claro y ofrecé conectar con una persona.`);
  return lines.join("\n");
}

function buildSedesBlock(cfg: GhlAutoConfig, cv: (k: string) => boolean): string | null {
  const tieneUbicacion = cv("ubicacion") || cv("direccion");
  const ctx = cfg.context_notes as Record<string, unknown>;
  if (!tieneUbicacion && !ctx.ubicacion && !ctx.direccion) return null;

  const lines = ["📍 SEDES"];
  lines.push(`Sede principal: ${cv("ubicacion") ? "{{custom_values.ubicacion}}" : (ctx.ubicacion as string) ?? "—"}`);
  if (cv("direccion") || ctx.direccion) {
    lines.push(`Dirección: ${cv("direccion") ? "{{custom_values.direccion}}" : (ctx.direccion as string) ?? "—"}`);
  }
  if (cv("google_maps_url")) {
    lines.push(`Mapa: {{custom_values.google_maps_url}}`);
  }
  if (cv("resena_url")) {
    lines.push(`Reseñas: {{custom_values.resena_url}}`);
  }
  lines.push(``);
  lines.push(`REGLAS DE UBICACIÓN`);
  lines.push(`- Cuando el cliente pida dirección o ubicación → entregar dirección + mapa.`);
  lines.push(`- Cuando pida indicaciones o cómo llegar → solo indicaciones + mapa.`);
  lines.push(`- Nunca mezclar dirección con indicaciones. Solo responder lo que se pidió.`);
  return lines.join("\n");
}

function buildCalendariosBlock(cfg: GhlAutoConfig): string | null {
  if (!cfg.calendars || cfg.calendars.length === 0) return null;
  const nombres = cfg.calendars.map((c) => c.name).filter(Boolean);
  return `📅 CALENDARIOS
Activos: ${nombres.join(", ")}.
Smart Calendar Matching elige el calendario correcto según el contexto del cliente.
Nunca decir "primeros del día", "primeros disponibles" ni inventar horarios. Sólo: "Estos son los horarios disponibles:" + los slots reales que te devuelve la acción.`;
}

function buildTransferenciaBlock(agent: Required<AgentParams>): string {
  return `🔁 TRANSFERENCIA A HUMANO
Disparás la acción "Human Handover" cuando ocurre alguno de estos casos:
${agent.punto_corte}

Frase exacta para transferir:
"${agent.handoff_phrase}"

Después de disparar handover, GHL pausa el bot y avisa al equipo. NO sigas conversando hasta que el equipo retome.`;
}

function buildGuardrailsBlock(agent: Required<AgentParams>): string {
  const temasProhibidosLine = Array.isArray(agent.temas_prohibidos)
    ? agent.temas_prohibidos.join(", ")
    : String(agent.temas_prohibidos ?? "");

  return `🟥 GUARDRAILS
- Responder en menos de 800 caracteres por mensaje. Si excede, resumir lo esencial.
- NUNCA enviar al usuario textos técnicos, IDs internos, identificadores de zona horaria (ej. "America/Mexico_City"), placeholders entre paréntesis o corchetes (ej. "(esperando confirmación)", "[pendiente]"). Si el bot necesita pensar, formular una pregunta natural en lugar de mostrar estado.
- NUNCA inventar precios, promociones, descuentos, horarios, sedes ni reglas que no estén en {{custom_values}} o en el catálogo.
- NUNCA dar diagnósticos, indicaciones clínicas, recomendaciones de medicamentos ni asesoramiento legal vinculante.
- NUNCA discutir: ${temasProhibidosLine}.
- Si el usuario solicita información que no sabés:
  "Esa información te la comparte mejor una persona del equipo. ¿Querés que te conecte con alguien?"
- Si el cliente dice "No me interesa", agradecé y finalizá la conversación.
- No declarar ser IA salvo pregunta directa. Sin nombres ni firmas al final.
- No corregir errores de tipeo del cliente — seguí la conversación naturalmente.
- Confirmá fechas, montos, mails o teléfonos repitiéndolos antes de registrarlos.`;
}

function buildReglasAdicionalesBlock(cfg: GhlAutoConfig): string | null {
  const ctx = cfg.context_notes as Record<string, unknown>;
  // Buscar reglas adicionales que el cliente cargó en la entrevista.
  const reglas: string[] = [];
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v !== "string") continue;
    if (!/^(regla_|rule_|policy_|politica_)/i.test(k)) continue;
    reglas.push(`- ${v.trim()}`);
  }
  if (reglas.length === 0) return null;

  return `🏢 REGLAS ADICIONALES DEL NEGOCIO
${reglas.join("\n")}`;
}

function buildCierreBlock(_agent: Required<AgentParams>): string {
  return `📏 LONGITUD Y FORMATO
- Máx 800 caracteres por mensaje.
- Mensajes completos y conversacionales, no fragmentos técnicos.
- Si la respuesta es muy larga, dividir en pasos cortos.

Recordá: el cliente no debería notar que sos un asistente. Sé natural, útil y resolutivo.`;
}

/* ───────────────────── Helpers de tono / detección ───────────────────── */

function chooseResponseStyle(tono: string): ConversationAIBundle["response_style"] {
  const t = tono.toLowerCase();
  if (/(breve|directo|conciso|corto|rápido)/.test(t)) return "concise";
  if (/(detallado|extenso|explicativo|profundo)/.test(t)) return "detailed";
  return "balanced";
}

function inferFormaDeTrato(cfg: GhlAutoConfig): "tu" | "usted" {
  // Heurística por país: México, Colombia, Perú, Centroamérica → "usted"
  // Argentina, Uruguay, España, Chile → "tu" / "vos" / "tú".
  const country = (cfg.company.address ?? "")
    .toString()
    .toLowerCase();
  if (/(méxico|mexico|monterrey|guadalajara|cdmx|colombia|bogot|perú|peru|lima|guatemala|honduras|salvador|nicaragua|panamá|panama|costa rica)/.test(country))
    return "usted";
  return "tu";
}

function buildDefaultSaludo(
  nombreIa: string,
  negocio: string,
  forma: "tu" | "usted",
): string {
  const cierre = forma === "usted" ? "¿En qué le puedo ayudar?" : "¿En qué te puedo ayudar?";
  return `Hola, soy ${nombreIa}, asistente de ${negocio}. ${cierre}`;
}

/* ───────────────────── Knowledge Base spec (sin cambios v2) ───────────────────── */

function buildKnowledgeBaseSpec(cfg: GhlAutoConfig): KnowledgeBaseSpec {
  const spec: KnowledgeBaseSpec = { urls: [], asset_refs: [], manual_faqs: [] };

  if (cfg.company.website) {
    spec.urls.push({
      url: cfg.company.website,
      mode: "domain",
      refresh: "weekly",
      note: "Sitio corporativo del cliente — base general de conocimiento.",
    });
  }

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

  spec.asset_refs.push({
    kind: "brandbook",
    note: "Subir todos los PDFs del bucket `branding` kind=brandbook asociados al proyecto.",
  });

  for (const [key, val] of Object.entries(ctx)) {
    if (!key.startsWith("faq_") || typeof val !== "string") continue;
    const q = key.replace(/^faq_/, "").replace(/_/g, " ");
    spec.manual_faqs.push({ q, a: val });
  }

  return spec;
}

function refreshForKey(key: string): KbRefresh {
  if (/(precio|tarifa|disponibilidad|stock)/i.test(key)) return "weekly";
  return "monthly";
}

/* ───────────────────── Util ───────────────────── */

function pick(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return undefined;
}

function buildCVIndex(cfg: GhlAutoConfig): (key: string) => boolean {
  const set = new Set(cfg.custom_values.map((cv) => cv.key));
  return (key: string) => set.has(key);
}

function extractCustomValueRefs(prompt: string): string[] {
  const re = /\{\{\s*custom_values\.([a-z0-9_]+)\s*\}\}/gi;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt))) {
    if (m[1]) out.add(m[1]);
  }
  return Array.from(out).sort();
}

/** Cuenta palabras (separadas por whitespace, ignorando líneas vacías). */
function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Si el draft excede el límite operativo (1900 palabras), dropea bloques
 * opcionales en orden de menor a mayor prioridad.
 *
 * Prioridad de bloques (lo que se preserva primero):
 *   1. ROL, ESTILO, OBJETIVO, FLUJO, TRANSFERENCIA, GUARDRAILS — esenciales.
 *   2. EMOJIS, CIERRE — alta prioridad.
 *   3. CATÁLOGO, SEDES, CALENDARIOS — útiles si están.
 *   4. REGLAS ADICIONALES — primero en caer.
 */
function enforceWordLimit(
  draft: string,
  blocks: Array<{ name: string; content: string }>,
): string {
  if (countWords(draft) <= SAFE_WORD_LIMIT) return draft;

  // Orden de drop (de menos crítico a más crítico).
  const dropOrder = [
    "REGLAS ADICIONALES",
    "CATÁLOGO",
    "SEDES",
    "CALENDARIOS",
    "EMOJIS",
    "CIERRE",
  ];

  let current = blocks.slice();
  for (const target of dropOrder) {
    if (countWords(current.map((b) => b.content).join("\n\n")) <= SAFE_WORD_LIMIT) break;
    current = current.filter((b) => b.name !== target);
  }
  return current.map((b) => b.content).join("\n\n");
}
