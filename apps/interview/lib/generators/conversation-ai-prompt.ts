import type { GhlAutoConfig } from "./ghl-autoconfig";

/** Parámetros adicionales que vienen de la sección `agente_ia`. */
export interface AgentParams {
  nombre?: string;
  tono?: string;
  objetivo?: string;
  punto_corte?: string;
  temas_prohibidos?: string | string[];
  idioma?: string;
  handoff_phrase?: string;
}

/**
 * Construye el system prompt para el agente Conversation AI de GHL.
 *
 * Entrada: el `GhlAutoConfig` ya generado (que contiene `context_notes` con
 * prefijo `ai_` para todos los slots de la sección `agente_ia`, más el resto
 * del contexto del negocio).
 *
 * Salida: un string listo para pegar en el campo "Prompt" del agente.
 */
export function buildConversationAIPrompt(cfg: GhlAutoConfig): string {
  const ctx = cfg.context_notes as Record<string, unknown>;
  const agent: AgentParams = {
    nombre: pick(ctx, "ai_nombre", "ai_nombre_ia") ?? "Asistente",
    tono: pick(ctx, "ai_tono") ?? "cálido, profesional, directo",
    objetivo:
      pick(ctx, "ai_objetivo") ??
      "calificar al prospecto, responder sus dudas y agendar una cita con un asesor humano",
    punto_corte:
      pick(ctx, "ai_punto_corte") ??
      "cuando el prospecto solicita hablar con una persona, cuando la conversación se desvía a quejas formales, o cuando la consulta excede tu conocimiento",
    temas_prohibidos: pick(ctx, "ai_temas_prohibidos") ?? "religión, política, consejos médicos o legales vinculantes",
    idioma: pick(ctx, "ai_idioma") ?? "español (tono neutro latinoamericano)",
    handoff_phrase:
      pick(ctx, "ai_handoff_phrase") ??
      "Te paso con una persona del equipo para que te atienda personalmente.",
  };

  const company = cfg.company.name ?? "la empresa";
  const services = cfg.services_products
    .map((s) => s["nombre"] ?? s["servicio"] ?? s["producto"])
    .filter(Boolean)
    .slice(0, 10);
  const tags = cfg.tags.map((t) => t.name).slice(0, 15);

  const capacidad = ctx["capacidad_max_dia"];
  const herramientas = ctx["herramientas_actuales"];
  const cancelaciones = ctx["manejo_cancelaciones"];
  const reprogramaciones = ctx["manejo_reprogramaciones"];
  const noshows = ctx["manejo_noshows"];
  const temporadas = ctx["temporadas_alta_demanda"];
  const mejores = ctx["mejores_clientes"];
  const fidelidad = ctx["programa_fidelidad"];

  const temasProhibidosLine = Array.isArray(agent.temas_prohibidos)
    ? agent.temas_prohibidos.join(", ")
    : String(agent.temas_prohibidos ?? "");

  return [
    `# Identidad`,
    `Sos ${agent.nombre}, el asistente virtual de ${company}.`,
    `Hablás en ${agent.idioma}. Tono: ${agent.tono}.`,
    ``,
    `# Tu objetivo`,
    agent.objetivo,
    ``,
    `# Contexto del negocio`,
    cfg.company.website ? `Sitio web: ${cfg.company.website}` : null,
    cfg.company.phone ? `Teléfono: ${cfg.company.phone}` : null,
    cfg.company.email ? `Email: ${cfg.company.email}` : null,
    services.length ? `Servicios/productos principales: ${services.join(", ")}.` : null,
    tags.length ? `Etiquetas usadas internamente: ${tags.join(", ")}.` : null,
    capacidad ? `Capacidad máxima de citas por día: ${String(capacidad)}.` : null,
    herramientas ? `Herramientas actuales del equipo: ${String(herramientas)}.` : null,
    cancelaciones ? `Manejo de cancelaciones: ${String(cancelaciones)}.` : null,
    reprogramaciones ? `Manejo de reprogramaciones: ${String(reprogramaciones)}.` : null,
    noshows ? `Manejo de no-shows: ${String(noshows)}.` : null,
    temporadas ? `Temporadas de mayor demanda: ${String(temporadas)}.` : null,
    mejores ? `Cómo reconocemos a un buen cliente: ${String(mejores)}.` : null,
    fidelidad ? `Programa de fidelidad: ${String(fidelidad)}.` : null,
    ``,
    `# Reglas de conversación`,
    `- Sé breve (1–3 frases por turno) y conversacional.`,
    `- Nunca inventes información. Si no sabés algo, reconocélo y ofrecé el handoff.`,
    `- No discutas estos temas: ${temasProhibidosLine}.`,
    `- Confirmá datos sensibles (fechas, montos, emails) repitiéndolos antes de registrarlos.`,
    ``,
    `# Handoff a humano`,
    `Criterios de corte: ${agent.punto_corte}.`,
    `Cuando se cumpla un criterio, decí literalmente: "${agent.handoff_phrase}"`,
    `y disparás el handoff (la plataforma lo detecta por la frase o por el tag generado).`,
    ``,
    `# Capacidades`,
    `- Podés consultar disponibilidad de ${cfg.calendars.length} calendarios configurados.`,
    `- Podés registrar información en los campos: ${cfg.custom_fields
      .slice(0, 12)
      .map((f) => f.field_key)
      .join(", ") || "(sin campos configurados todavía)"}.`,
    ``,
    `# Estilo`,
    `Hablás como ${company}. Evitás emoji salvo que el cliente los use primero.`,
    `No usás jerga técnica. Si el cliente escribe mal, seguís la conversación sin corregirlo.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function pick(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return undefined;
}
