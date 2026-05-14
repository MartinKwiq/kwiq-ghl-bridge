/**
 * Generador de FAQs para el Knowledge Base del agente de Conversation AI.
 *
 * Las FAQs son la fuente de verdad que el agente consulta antes de
 * responder cualquier pregunta del cliente. Se cargan en:
 *   GHL → Conversation AI → Knowledge Base → Manual FAQs
 *
 * Cada FAQ tiene una pregunta y una respuesta corta, en el tono del
 * negocio. La respuesta usa información concreta de la entrevista
 * (horarios, dirección, métodos de pago, etc.) — no es texto genérico.
 *
 * Diseño:
 *  - Solo emitimos FAQs cuyas respuestas tenemos datos para llenar.
 *    Si el cliente no respondió "métodos de pago" en la entrevista, NO
 *    generamos esa FAQ con un placeholder vacío — la omitimos.
 *  - Las respuestas son neutras (sin voseo) y breves (1-3 oraciones).
 *  - Si una respuesta requiere acción del bot (ej. "te paso con alguien"),
 *    incluimos un marker [HANDOFF] que el admin puede dejar o quitar.
 */
import type { GhlAutoConfig } from "@/lib/generators/ghl-autoconfig";

export interface KbFaq {
  /** Slug interno. */
  key: string;
  /** Pregunta exacta (como la haría un cliente). */
  question: string;
  /** Respuesta lista para cargar al KB. */
  answer: string;
  /** Categoría sugerida para organizar el KB en GHL. */
  category:
    | "ubicacion"
    | "horarios"
    | "servicios"
    | "precios"
    | "pago"
    | "cancelaciones"
    | "agendar"
    | "contacto"
    | "general";
}

export function buildKbFaqs(cfg: GhlAutoConfig): KbFaq[] {
  const ctx = (cfg.context_notes ?? {}) as Record<string, unknown>;
  const business = cv(cfg, "nombre_del_negocio") || cfg.company.name || "el negocio";
  const phone = cv(cfg, "telefono") || cfg.company.phone || "";
  const email = cfg.company.email || cv(cfg, "email") || "";
  const address = cv(cfg, "direccion") || "";
  const mapsUrl = cv(cfg, "google_maps_url") || "";
  const website = cv(cfg, "sitio_web") || cfg.company.website || "";

  const faqs: KbFaq[] = [];

  // ── Ubicación ──────────────────────────────────────────────
  if (address || mapsUrl) {
    faqs.push({
      key: "address",
      question: "¿Cuál es la dirección? / ¿Dónde están ubicados?",
      answer: [
        address ? `${business} queda en ${address}.` : `${business} atiende presencialmente.`,
        mapsUrl ? `Aquí está el link de Google Maps para llegar fácil: ${mapsUrl}` : "",
      ]
        .filter(Boolean)
        .join(" "),
      category: "ubicacion",
    });
  }

  if (mapsUrl) {
    faqs.push({
      key: "directions",
      question: "¿Cómo llego? / ¿Tienen ubicación en el mapa?",
      answer: `Puedes ver cómo llegar acá: ${mapsUrl}. Cualquier duda específica con el recorrido, indícamela y te ayudo.`,
      category: "ubicacion",
    });
  }

  // ── Horarios ───────────────────────────────────────────────
  const horarios = pickContext(ctx, [
    "horarios",
    "faq_horario",
    "horario_atencion",
    "horarios_atencion",
  ]);
  if (horarios) {
    faqs.push({
      key: "hours",
      question: "¿Qué horarios atienden?",
      answer: `Nuestros horarios son: ${horarios}`,
      category: "horarios",
    });
  }

  // ── Métodos de pago ────────────────────────────────────────
  const metodosPago = pickContext(ctx, [
    "metodos_pago",
    "formas_pago",
    "faq_pago",
    "pago_metodos",
  ]);
  if (metodosPago) {
    faqs.push({
      key: "payment_methods",
      question: "¿Qué métodos de pago aceptan?",
      answer: `Aceptamos: ${metodosPago}.`,
      category: "pago",
    });
  }

  // ── Política de cancelación ────────────────────────────────
  const cancelacion = pickContext(ctx, [
    "manejo_cancelaciones",
    "politica_cancelacion",
    "policy_cancelacion",
    "faq_cancelacion",
  ]);
  if (cancelacion) {
    faqs.push({
      key: "cancellation",
      question: "¿Cómo puedo cancelar o reprogramar mi cita?",
      answer: cancelacion,
      category: "cancelaciones",
    });
  }

  // ── Cómo agendar ───────────────────────────────────────────
  if (cfg.calendars.length > 0) {
    faqs.push({
      key: "how_to_book",
      question: "¿Cómo agendo una cita?",
      answer: `Puedo agendarla por ti acá mismo. Solo necesito saber qué servicio quieres, qué día y horario te conviene, y un par de datos tuyos. ¿Empezamos?`,
      category: "agendar",
    });
  }

  // ── Servicios ofrecidos ────────────────────────────────────
  if (cfg.services_products.length > 0) {
    const lista = cfg.services_products
      .slice(0, 8)
      .map((s) => {
        const name = (s.nombre as string) ?? (s.name as string) ?? "";
        return name.trim();
      })
      .filter(Boolean)
      .join(", ");
    if (lista) {
      faqs.push({
        key: "services",
        question: "¿Qué servicios ofrecen?",
        answer: `Ofrecemos: ${lista}. ¿Quieres más detalles de alguno en particular?`,
        category: "servicios",
      });
    }
  }

  // ── Contacto / dudas urgentes ──────────────────────────────
  if (phone || email) {
    const partes = [];
    if (phone) partes.push(`puedes llamarnos al ${phone}`);
    if (email) partes.push(`escribirnos a ${email}`);
    faqs.push({
      key: "contact",
      question: "¿Cómo me contacto con alguien del equipo?",
      answer: `Para hablar con una persona ${partes.join(" o ")}. También puedes seguir esta conversación y te conecto con alguien del equipo. [HANDOFF]`,
      category: "contacto",
    });
  }

  // ── Web / catálogo ─────────────────────────────────────────
  if (website) {
    faqs.push({
      key: "website",
      question: "¿Tienen sitio web?",
      answer: `Sí, puedes ver más información en ${website}.`,
      category: "general",
    });
  }

  // ── Reseñas ────────────────────────────────────────────────
  const reviewUrl = cv(cfg, "resena_url");
  if (reviewUrl) {
    faqs.push({
      key: "reviews",
      question: "¿Dónde puedo dejar una reseña?",
      answer: `Nos ayudaría muchísimo si nos dejas tu opinión acá: ${reviewUrl}`,
      category: "general",
    });
  }

  // ── Reglas extra del negocio (regla_*, policy_*) ───────────
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v !== "string") continue;
    if (!/^(regla_|policy_|politica_)/i.test(k)) continue;
    const slug = k.replace(/^(regla_|policy_|politica_)/i, "").replace(/_/g, " ");
    faqs.push({
      key: `policy_${k}`,
      question: `¿Cuál es la política de ${slug}?`,
      answer: v.trim(),
      category: "general",
    });
  }

  return faqs;
}

/* ───────────────────── Helpers ───────────────────── */

function cv(cfg: GhlAutoConfig, key: string): string {
  const found = cfg.custom_values.find((c) => c.key === key);
  if (!found) return "";
  return typeof found.value === "string" ? found.value : String(found.value ?? "");
}

function pickContext(
  ctx: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = ctx[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}
