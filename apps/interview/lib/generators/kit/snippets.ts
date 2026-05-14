/**
 * Generador de snippets cortos para WhatsApp y SMS.
 *
 * Snippets son atajos de respuesta rápida que el equipo Kwiq carga en
 * GHL → Conversations → Snippets. Texto plano corto (no HTML), con
 * variables {{contact.xxx}} y {{custom_values.xxx}}.
 *
 * En WhatsApp se usan SOLO dentro del "Customer Service Window" (24h
 * después del último mensaje del cliente). Para iniciar conversaciones
 * fuera de esa ventana hay que usar Templates aprobados por Meta, que
 * no se pueden generar vía API.
 */
import type { GhlAutoConfig } from "@/lib/generators/ghl-autoconfig";

export interface Snippet {
  /** Slug interno. */
  key: string;
  /** Nombre visible en GHL. */
  name: string;
  /** Atajo de teclado sugerido (ej. "/saludo"). */
  shortcut: string;
  /** Texto del snippet — máx ~500 chars para WhatsApp. */
  body: string;
  /** En qué canal sirve. */
  channel: "whatsapp" | "sms" | "both";
  /** Cuándo usarlo. */
  purpose: string;
}

export function buildSnippets(cfg: GhlAutoConfig): Snippet[] {
  const business = cv(cfg, "nombre_del_negocio") || cfg.company.name || "el negocio";
  const phone = cv(cfg, "telefono") || cfg.company.phone || "";
  const address = cv(cfg, "direccion") || "";
  const mapsUrl = cv(cfg, "google_maps_url") || "";
  const website = cv(cfg, "sitio_web") || cfg.company.website || "";
  const reviewUrl = cv(cfg, "resena_url") || "";

  const snippets: Snippet[] = [];

  snippets.push({
    key: "greeting",
    name: "Saludo inicial",
    shortcut: "/hola",
    body: `Hola {{contact.first_name}} 👋 ¡Gracias por escribirnos a ${business}! ¿En qué te podemos ayudar?`,
    channel: "both",
    purpose: "Respuesta inicial cuando un cliente nuevo escribe por WhatsApp/SMS.",
  });

  snippets.push({
    key: "apology_delay",
    name: "Disculpa por demora",
    shortcut: "/demora",
    body: `Disculpá la demora {{contact.first_name}}, tuvimos mucho movimiento por acá. Ya te respondo con lo que necesitas.`,
    channel: "both",
    purpose: "Cuando hubo más de 2 horas sin respuesta y el cliente esperó.",
  });

  if (address || mapsUrl) {
    snippets.push({
      key: "share_address",
      name: "Compartir dirección",
      shortcut: "/direccion",
      body: [
        address ? `📍 ${business} queda en: ${address}` : `📍 ${business}`,
        mapsUrl ? `\n\nVer en mapa: ${mapsUrl}` : "",
        phone ? `\n\nCualquier duda llamanos al ${phone}` : "",
      ].join(""),
      channel: "both",
      purpose: "Cuando el cliente pregunta dónde están / cómo llegar.",
    });
  }

  if (mapsUrl) {
    snippets.push({
      key: "directions",
      name: "Cómo llegar (link mapa)",
      shortcut: "/llegar",
      body: `Acá te dejamos el link para llegar fácil: ${mapsUrl}`,
      channel: "both",
      purpose: "Respuesta rápida cuando el cliente pide indicaciones.",
    });
  }

  snippets.push({
    key: "booking_link",
    name: "Link para agendar cita",
    shortcut: "/agendar",
    body: `Para agendar tu cita podés usar este link: {{custom_values.calendario_url}}\n\nElegí el horario que más te convenga y te llega la confirmación al correo.`,
    channel: "both",
    purpose: "Cliente quiere agendar pero la conversación está en WhatsApp/SMS — le pasamos el calendario.",
  });

  snippets.push({
    key: "cancellation_policy",
    name: "Política de cancelación",
    shortcut: "/cancelar",
    body: `Sin problema {{contact.first_name}}. Te pedimos avisarnos con al menos 24h de anticipación para liberar el espacio${phone ? ` (llamanos al ${phone} o respondé este chat)` : ""}. ¿Querés reprogramar para otro día?`,
    channel: "both",
    purpose: "Cliente quiere cancelar o reprogramar una cita.",
  });

  if (reviewUrl) {
    snippets.push({
      key: "ask_review",
      name: "Pedir reseña",
      shortcut: "/resena",
      body: `¡Gracias {{contact.first_name}}! Si te animás a dejarnos una reseña corta nos ayuda muchísimo: ${reviewUrl}`,
      channel: "both",
      purpose: "Después de un servicio bien valorado o un cliente recurrente.",
    });
  }

  snippets.push({
    key: "farewell",
    name: "Despedida",
    shortcut: "/chau",
    body: `Gracias por escribir {{contact.first_name}} 🙌 Si necesitas algo más, estamos por acá. ¡Buen día!`,
    channel: "both",
    purpose: "Cierre amable de la conversación.",
  });

  snippets.push({
    key: "handoff_to_human",
    name: "Transferencia a humano",
    shortcut: "/humano",
    body: `Un momento {{contact.first_name}}, te paso con alguien del equipo para que te atienda personalmente.`,
    channel: "both",
    purpose: "Cuando el agente IA o un staff dispara handoff manual.",
  });

  if (website) {
    snippets.push({
      key: "website_link",
      name: "Compartir web",
      shortcut: "/web",
      body: `Podés ver más info en nuestra web: ${website}`,
      channel: "both",
      purpose: "Cliente pide info adicional / catálogo / precios completos.",
    });
  }

  return snippets;
}

/* ───────────────────── Helpers ───────────────────── */

function cv(cfg: GhlAutoConfig, key: string): string {
  const found = cfg.custom_values.find((c) => c.key === key);
  if (!found) return "";
  return typeof found.value === "string" ? found.value : String(found.value ?? "");
}
