import type { SectionDef, QuestionDef } from "./interview-schema";

/**
 * Construye el system prompt del entrevistador para una sección dada.
 *
 * El LLM debe:
 *  1) Conversar en español rioplatense neutro, tono Kwiq (cálido, breve, directo).
 *  2) Cubrir los `questions` de la sección, adaptando el orden y agrupando
 *     preguntas que se pueden responder juntas.
 *  3) Evitar preguntas redundantes si el cliente ya dio la info en un turno previo.
 *  4) Emitir SIEMPRE una respuesta JSON estricta con la forma indicada abajo.
 */
export function buildSectionSystemPrompt(section: SectionDef): string {
  // Separamos esenciales vs. opcionales para que el LLM entienda qué cubrir
  // sí o sí y qué saltearse por defecto. Esto baja el tiempo total de
  // entrevista de ~90 min a ~20-30 min.
  const essentials = section.questions.filter((q) => q.essential !== false);
  const optionals = section.questions.filter((q) => q.essential === false);

  const essentialsBlock = essentials.length
    ? essentials.map(describeQuestionForLLM).join("\n")
    : "(ninguna en esta sección — cerrala enseguida)";
  const optionalsBlock = optionals.length
    ? optionals.map(describeQuestionForLLM).join("\n")
    : "(ninguna)";

  return `Sos el asistente de onboarding de Kwiq.
Estás entrevistando al dueño/operador de un negocio para reunir la información necesaria
para dejar su Kwiq listo (CRM, calendarios, pipelines y agente IA). Hablás en español
rioplatense neutro, cálido, breve, sin jerga técnica, sin mencionar proveedores ni tecnologías
internas (por ejemplo: nunca digas "GoHighLevel", "CRM externo" ni nombres de APIs).
Sin emoji a menos que el usuario los use, sin saludar en cada turno.

Tu objetivo es respetar el tiempo del cliente. La entrevista debe sentirse
breve y enfocada. Apuntá a 20–30 minutos en TOTAL, no a 90.

# Sección activa
Título: ${section.title}
Intención: ${section.intent}
Descripción para el usuario: ${section.description}
${section.repeatable ? `Esta sección puede repetirse (una fila por cada ${section.repeatable.unit}).` : ""}

# Preguntas ESENCIALES (cubrí todas antes de cerrar la sección)
${essentialsBlock}

# Preguntas OPCIONALES (NO las preguntes por defecto)
Estas son contextuales o de profundización. Solo las cubrís si el cliente
explícitamente quiere profundizar o pide darnos más contexto. NO las introduzcas
proactivamente. Cuando termines las esenciales, podés cerrar la sección sin tocarlas.
${optionalsBlock}

# Reglas
- No inventes datos. Si el usuario no fue claro, pedí una aclaración puntual.
- No preguntes dos veces lo mismo. Si ya tenés un slot, pasá al siguiente.
- Agrupá hasta 3 preguntas relacionadas por turno cuando tenga sentido; sé eficiente.
- Si el usuario no sabe o no aplica, registrá "no_aplica" o null con confidence baja
  y seguí adelante. NO insistas si dijo que no sabe.
- Si el usuario se desvía, traelo amablemente de vuelta al tema.
- Cuando TODAS las ESENCIALES estén cubiertas con confidence razonable, marcá
  status="section_complete" y sugerí amablemente pasar a la siguiente sección.
  NO intentes cubrir las opcionales antes de cerrar.
- Si el cliente parece tener prisa o cansado, saltá las opcionales y avanzá rápido.

# Formato de salida (JSON estricto, sin markdown alrededor)
{
  "message": "<tu próximo turno dirigido al usuario, en español>",
  "extracted": [
    { "question_id": "<id del slot>", "value": <string|number|boolean|null>, "confidence": 0.0-1.0 }
  ],
  "status": "in_progress" | "section_complete" | "need_clarification",
  "next_focus": "<question_id opcional sobre el que estás trabajando>"
}
- "extracted" puede ir vacío si el turno del usuario no aportó información nueva.
- "message" debe ser conversacional y NO contener JSON ni instrucciones meta.
- Responde EXCLUSIVAMENTE con el JSON descrito. Nada antes, nada después.`;
}

/** Describe una pregunta en formato compacto para que el LLM la interprete. */
function describeQuestionForLLM(q: QuestionDef): string {
  const parts = [`- ${q.id} (${q.type}): ${q.label}`];
  if (q.hint) parts.push(`  hint: ${q.hint}`);
  if (q.options && q.options.length) parts.push(`  opciones: ${q.options.join(" | ")}`);
  if (q.guidance) parts.push(`  guía: ${q.guidance}`);
  if (q.required) parts.push(`  required: true`);
  return parts.join("\n");
}

/**
 * Saludo inicial (primer turno del assistant). Se emite al crear la sesión
 * para que la UI arranque con algo en pantalla sin necesidad de llamar al LLM.
 */
export function buildWelcomeMessage(companyNameGuess?: string): string {
  const lead = companyNameGuess
    ? `Hola, soy el asistente de Kwiq. Vamos a configurar ${companyNameGuess} charlando, nada de planillas.`
    : "Hola, soy el asistente de Kwiq. Vamos a configurar tu negocio charlando, nada de planillas.";

  return [
    lead,
    "Arrancamos por el contexto general: ¿me contás a qué se dedica tu negocio y quién atiende hoy a los clientes?",
  ].join(" ");
}

/**
 * Schema JSON para forzar responseSchema en Gemini (structured output).
 */
export const SECTION_TURN_JSON_SCHEMA = {
  type: "object",
  properties: {
    message: { type: "string" },
    extracted: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question_id: { type: "string" },
          value: {}, // any JSON
          confidence: { type: "number" },
        },
        required: ["question_id", "confidence"],
      },
    },
    status: { type: "string", enum: ["in_progress", "section_complete", "need_clarification"] },
    next_focus: { type: "string" },
  },
  required: ["message", "extracted", "status"],
} as const;

/**
 * Parser robusto: algunas veces el LLM escupe fences ```json ... ``` aunque le pidamos que no.
 */
export function parseSectionTurn(raw: string): {
  message: string;
  extracted: { question_id: string; value: unknown; confidence: number }[];
  status: "in_progress" | "section_complete" | "need_clarification";
  next_focus?: string;
} {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned);
  return {
    message: String(parsed.message ?? ""),
    extracted: Array.isArray(parsed.extracted)
      ? parsed.extracted.map((e: { question_id?: unknown; value?: unknown; confidence?: unknown }) => ({
          question_id: String(e.question_id ?? ""),
          value: e.value ?? null,
          confidence: typeof e.confidence === "number" ? e.confidence : 0.5,
        }))
      : [],
    status: (parsed.status as "in_progress" | "section_complete" | "need_clarification") ?? "in_progress",
    next_focus: parsed.next_focus ? String(parsed.next_focus) : undefined,
  };
}
