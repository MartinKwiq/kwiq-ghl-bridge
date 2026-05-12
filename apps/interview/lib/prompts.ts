import type { SectionDef, QuestionDef } from "./interview-schema";

/**
 * Construye el system prompt del entrevistador para una sección dada.
 *
 * El LLM debe:
 *  1) Conversar en español neutro / latinoamericano, tono Kwiq (cálido,
 *     breve, directo). Sin voseo rioplatense ("vos/sos/podés/querés").
 *  2) Cubrir los `questions` de la sección, adaptando el orden y agrupando
 *     preguntas que se pueden responder juntas.
 *  3) Evitar preguntas redundantes si el cliente ya dio la info en un turno previo.
 *  4) Emitir SIEMPRE una respuesta JSON estricta con la forma indicada abajo.
 */
export function buildSectionSystemPrompt(section: SectionDef): string {
  const essentials = section.questions.filter((q) => q.essential !== false);
  const optionals = section.questions.filter((q) => q.essential === false);

  const essentialsBlock = essentials.length
    ? essentials.map(describeQuestionForLLM).join("\n")
    : "(ninguna en esta sección — ciérrala enseguida)";
  const optionalsBlock = optionals.length
    ? optionals.map(describeQuestionForLLM).join("\n")
    : "(ninguna)";

  return `Eres el asistente de onboarding de Kwiq.
Estás entrevistando al dueño u operador de un negocio para reunir la información
necesaria para dejar su Kwiq listo (CRM, calendarios, pipelines y agente IA).
Hablas en español neutro / latinoamericano, cálido, breve, sin jerga técnica,
sin mencionar proveedores ni tecnologías internas (por ejemplo: nunca digas
"GoHighLevel", "CRM externo" ni nombres de APIs). Sin emojis a menos que el
usuario los use, sin saludar en cada turno.

REGLA DE TONO IMPORTANTE: NO uses voseo rioplatense bajo ninguna circunstancia.
Usa "tú" (o "usted" si el cliente lo usa primero), nunca "vos". Verbos en
formas neutras: "puedes" en lugar de "podés", "tienes" en lugar de "tenés",
"quieres" en lugar de "querés", "configura" en lugar de "configurá", "cuéntame"
en lugar de "contame". Léxico neutro: "computadora" no "compu", "celular" no
"celu", "perfecto" o "listo" no "dale".

Tu objetivo es respetar el tiempo del cliente. La entrevista debe sentirse
breve y enfocada. Apunta a 20–30 minutos en TOTAL, no a 90.

# Sección activa
Título: ${section.title}
Intención: ${section.intent}
Descripción para el usuario: ${section.description}
${section.repeatable ? `Esta sección puede repetirse (una fila por cada ${section.repeatable.unit}).` : ""}

# Preguntas ESENCIALES (cubre todas antes de cerrar la sección)
${essentialsBlock}

# Preguntas OPCIONALES (NO las preguntes por defecto)
Estas son contextuales o de profundización. Solo las cubres si el cliente
explícitamente quiere profundizar o pide darnos más contexto. NO las introduzcas
proactivamente. Cuando termines las esenciales, puedes cerrar la sección sin tocarlas.
${optionalsBlock}

# Reglas
- No inventes datos. Si el usuario no fue claro, pide una aclaración puntual.
- No preguntes dos veces lo mismo. Si ya tienes un slot, pasa al siguiente.
- Agrupa hasta 3 preguntas relacionadas por turno cuando tenga sentido; sé eficiente.
- Si el usuario no sabe o no aplica, registra "no_aplica" o null con confidence baja
  y sigue adelante. NO insistas si dijo que no sabe.
- Si el usuario se desvía, tráelo amablemente de vuelta al tema.
- Cuando TODAS las ESENCIALES estén cubiertas con confidence razonable, marca
  status="section_complete" y sugiere amablemente pasar a la siguiente sección.
  NO intentes cubrir las opcionales antes de cerrar.
- Si el cliente parece tener prisa o cansado, salta las opcionales y avanza rápido.

# Formato de salida (JSON estricto, sin markdown alrededor)
{
  "message": "<tu próximo turno dirigido al usuario, en español neutro>",
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
    ? `Hola, soy el asistente de Kwiq. Vamos a configurar ${companyNameGuess} conversando, sin planillas.`
    : "Hola, soy el asistente de Kwiq. Vamos a configurar tu negocio conversando, sin planillas.";

  return [
    lead,
    "Empezamos por el contexto general: ¿me cuentas a qué se dedica tu negocio y quién atiende hoy a los clientes?",
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
 * Parser robusto del turno de sección.
 *
 * Aunque pedimos `responseMimeType=application/json` con `responseSchema`,
 * Gemini ocasionalmente devuelve JSON malformado — más típico:
 *  - fences markdown ```json … ``` aunque pedimos que no.
 *  - comillas dobles dentro de un string sin escapar (rompe JSON.parse con
 *    "Unterminated string in JSON …").
 *  - trailing commas antes de `}` o `]`.
 *
 * Este parser intenta tres pases:
 *   1. JSON.parse directo del payload limpio (caso ~95%).
 *   2. Reparaciones simples (trailing commas) y reintento.
 *   3. Extracción tolerante por regex de los campos esenciales (`message`,
 *      `status`, `next_focus`). En este caso `extracted` queda vacío — se
 *      pierde la captura de slots de ese turno, pero la conversación sigue
 *      en lugar de cortarse, y el LLM puede volver a preguntar lo mismo
 *      en un turno siguiente.
 *
 * Si los tres pases fallan, lanza un error con copy estable que la capa
 * `/api/chat` traduce a `llm_unavailable` — el cliente ve un mensaje
 * humano y puede reintentar.
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

  let parsed: unknown;

  // Pase 1: directo.
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Pase 2: reparaciones simples.
    const repaired = cleaned
      // trailing commas antes de } o ]
      .replace(/,\s*([}\]])/g, "$1");
    try {
      parsed = JSON.parse(repaired);
    } catch {
      // Pase 3: extracción tolerante por regex. Si encontramos al menos
      // `message`, devolvemos un turno mínimo válido para no cortar la UX.
      const fallback = extractTurnFromMalformedJson(cleaned);
      if (fallback) {
        return fallback;
      }
      // Sin fallback: lanzamos error para que /api/chat lo clasifique.
      throw new Error(
        "llm_response_malformed: el LLM devolvió un payload que no se pudo parsear ni reparar.",
      );
    }
  }

  const obj = parsed as Record<string, unknown>;
  return {
    message: String(obj.message ?? ""),
    extracted: Array.isArray(obj.extracted)
      ? (obj.extracted as Array<Record<string, unknown>>).map((e) => ({
          question_id: String(e.question_id ?? ""),
          value: e.value ?? null,
          confidence: typeof e.confidence === "number" ? e.confidence : 0.5,
        }))
      : [],
    status:
      (obj.status as "in_progress" | "section_complete" | "need_clarification") ??
      "in_progress",
    next_focus: obj.next_focus ? String(obj.next_focus) : undefined,
  };
}

/**
 * Extrae los campos esenciales (`message`, `status`, `next_focus`) de un
 * payload JSON malformado usando regex tolerantes.
 *
 * Diseñado para sobrevivir el caso más típico: comillas dobles sin escapar
 * dentro del valor de `message`, que rompe JSON.parse con "Unterminated
 * string". En ese caso, capturamos lo que haya entre `"message":"…"` hasta
 * el próximo `","status"` (que es la siguiente clave del schema).
 *
 * `extracted` se descarta — preferimos perder los slots de ESE turno y
 * mantener la conversación viva, antes que mostrar un error rojo.
 *
 * Devuelve `null` si ni siquiera puede sacar un `message` mínimo.
 */
function extractTurnFromMalformedJson(raw: string): {
  message: string;
  extracted: { question_id: string; value: unknown; confidence: number }[];
  status: "in_progress" | "section_complete" | "need_clarification";
  next_focus?: string;
} | null {
  // "message" puede llevar caracteres especiales y comillas internas. Nos
  // anclamos al delimitador siguiente del schema (`"extracted"` o
  // `"status"`) para saber dónde termina el campo.
  const msgMatch =
    raw.match(/"message"\s*:\s*"([\s\S]*?)"\s*,\s*"(?:extracted|status|next_focus)"/) ??
    raw.match(/"message"\s*:\s*"([\s\S]*?)"\s*[},]/);

  if (!msgMatch || !msgMatch[1]) return null;

  const statusMatch = raw.match(
    /"status"\s*:\s*"(in_progress|section_complete|need_clarification)"/,
  );
  const nextFocusMatch = raw.match(/"next_focus"\s*:\s*"([^"\\]+)"/);

  return {
    message: msgMatch[1],
    extracted: [], // se pierden los slots del turno — aceptamos el costo
    status:
      (statusMatch?.[1] as "in_progress" | "section_complete" | "need_clarification") ??
      "in_progress",
    next_focus: nextFocusMatch?.[1],
  };
}
