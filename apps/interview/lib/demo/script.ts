/**
 * Script de la conversación demo.
 *
 * Es un walkthrough determinístico de la primera sección (contexto_general)
 * más la transición a la segunda. Se usa en `/demo` — 100% cliente, sin
 * Gemini ni Supabase. Objetivo: que Martín vea la UX del chat en un click.
 */

export interface DemoReply {
  /** Substring que buscamos en el mensaje del usuario (case-insensitive). */
  matches?: string[];
  /** Mensaje del assistant que devolvemos. */
  assistant: string;
  /** Datos “extraídos” para mostrar en el panel de outputs (opcional). */
  extracted?: Array<{ question_id: string; value: unknown; confidence: number }>;
  /** Si es el cierre de una sección. */
  completesSection?: boolean;
  /** Si el turno avanza a la próxima sección. */
  advanceTo?: { id: string; title: string };
}

export const DEMO_WELCOME =
  "Hola, soy el asistente de Kwiq. Vamos a configurar tu negocio charlando, nada de planillas. Arrancamos por el contexto general: ¿me contás a qué se dedica tu negocio y quién atiende hoy a los clientes?";

/**
 * Guion en orden. Se recorre linealmente: cada turno del usuario consume
 * el siguiente `DemoReply` del array (ignoramos `matches` por simplicidad).
 * Al agotarse, volvemos al último (loop).
 */
export const DEMO_SCRIPT: DemoReply[] = [
  {
    assistant:
      "Buenísimo. ¿Cuál es la capacidad máxima de citas que podés manejar por día, y cuántas pueden ser en simultáneo?",
    extracted: [
      { question_id: "staff_atencion_dedicado", value: "Sí, 2 personas dedicadas a atención al cliente.", confidence: 0.9 },
    ],
  },
  {
    assistant:
      "Perfecto. ¿Qué herramientas usan hoy para gestionar citas o clientes? ¿Algo tipo Google Calendar, planillas, otro CRM?",
    extracted: [
      { question_id: "capacidad_max_dia", value: 40, confidence: 0.95 },
      { question_id: "citas_simultaneas", value: 4, confidence: 0.9 },
    ],
  },
  {
    assistant:
      "Gracias. ¿Qué porcentaje aproximado de tus clientes agenda por medios digitales y qué porcentaje es recurrente?",
    extracted: [
      { question_id: "herramientas_actuales", value: "Google Calendar + planilla de Excel compartida.", confidence: 0.95 },
    ],
  },
  {
    assistant:
      "Buenísimo, eso nos da una base. ¿Cómo manejan hoy las cancelaciones, las reprogramaciones y los no-shows?",
    extracted: [
      { question_id: "pct_digital", value: 60, confidence: 0.85 },
      { question_id: "pct_recurrentes", value: 45, confidence: 0.85 },
    ],
  },
  {
    assistant:
      "Entiendo. Una más y cerramos esta primera sección: ¿tenés temporadas de mayor demanda y algún programa de fidelidad o referidos activo?",
    extracted: [
      { question_id: "manejo_cancelaciones", value: "Reciben WhatsApp manual, reprograman sin costo.", confidence: 0.9 },
      { question_id: "manejo_reprogramaciones", value: "Hasta 24hs antes sin costo.", confidence: 0.9 },
      { question_id: "manejo_noshows", value: "Se reemite recordatorio, sin penalización.", confidence: 0.85 },
    ],
  },
  {
    assistant:
      "Listo, con eso tengo el contexto general cubierto 🎯. Pasamos a la **Información general del negocio** — necesito datos de contacto público, redes y el nombre con el que va a hablar tu agente IA. ¿Cuál es el email y el teléfono principal de contacto?",
    extracted: [
      { question_id: "temporadas_alta_demanda", value: "Verano (diciembre-febrero) y Día de la Madre.", confidence: 0.9 },
      { question_id: "programa_fidelidad", value: "10% off al cuarto servicio.", confidence: 0.85 },
    ],
    completesSection: true,
    advanceTo: { id: "informacion_general", title: "Información general del negocio" },
  },
  {
    assistant:
      "Perfecto. ¿Tienen sitio web? ¿Y cuál querés que sea el nombre del agente IA cuando hable con tus clientes?",
    extracted: [
      { question_id: "company_email", value: "hola@acmebeauty.com.ar", confidence: 0.95 },
      { question_id: "company_phone", value: "+54 11 5555 0001", confidence: 0.95 },
    ],
  },
  {
    assistant:
      "Me encanta, vamos avanzando. Si querés pausar acá y ver cómo va quedando tu configuración, tocá **Ver outputs** arriba a la derecha. Si seguimos, pasamos a cargar **ubicaciones / sucursales**.",
    extracted: [
      { question_id: "company_website", value: "https://acmebeauty.com.ar", confidence: 0.95 },
      { question_id: "ai_nombre", value: "Sofi", confidence: 0.9 },
    ],
  },
];
