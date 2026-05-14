/**
 * Generador de email templates para el Kit de Configuración Manual.
 *
 * Toma el GhlAutoConfig producido por la entrevista y devuelve un array
 * de plantillas de email listas para subir al panel de GHL (o aplicar
 * vía API en un sprint futuro).
 *
 * Las plantillas usan variables nativas de GHL:
 *   {{contact.first_name}}    → nombre del cliente
 *   {{contact.email}}         → email del cliente
 *   {{appointment.start_time}}→ inicio de la próxima cita
 *   {{custom_values.xxx}}     → custom values cargados por el provisioner
 *
 * Si una variable apunta a un custom_value que el autoconfig NO definió,
 * se referencia igual — el agente puede crearlo después.
 */
import type { GhlAutoConfig } from "@/lib/generators/ghl-autoconfig";

export interface EmailTemplate {
  /** Slug interno estable, para matchear contra inventario remoto. */
  key: string;
  /** Nombre visible. Es lo que GHL muestra en el panel y lo que matcheamos. */
  name: string;
  /** Asunto del email (60-80 chars idealmente). */
  subject: string;
  /** HTML del cuerpo. Usa entidades estándar — GHL las renderiza bien. */
  body_html: string;
  /** Breve descripción para que el admin sepa cuándo se usa. */
  purpose: string;
  /** Si está en duda, el admin puede ver qué campos son críticos. */
  critical_variables: string[];
}

export function buildEmailTemplates(cfg: GhlAutoConfig): EmailTemplate[] {
  const business = cv(cfg, "nombre_del_negocio") || cfg.company.name || "tu negocio";
  const phone = cv(cfg, "telefono") || cfg.company.phone || "";
  const address = cv(cfg, "direccion") || "";
  const mapsUrl = cv(cfg, "google_maps_url") || "";
  const website = cv(cfg, "sitio_web") || cfg.company.website || "";
  const reviewUrl = cv(cfg, "resena_url") || "";

  const templates: EmailTemplate[] = [];

  // 1. Confirmación de cita
  templates.push({
    key: "appointment_confirmation",
    name: "Confirmación de cita",
    subject: `Confirmación de tu cita en ${business}`,
    body_html: html(`
      <p>Hola {{contact.first_name}},</p>
      <p>Tu cita en <strong>${business}</strong> fue confirmada para el <strong>{{appointment.start_time}}</strong>.</p>
      ${address ? `<p><strong>Dirección:</strong> ${address}</p>` : ""}
      ${mapsUrl ? `<p><a href="${mapsUrl}">Ver en Google Maps</a></p>` : ""}
      <p>Si necesitas reprogramar o cancelar, respondé a este correo o llamanos${phone ? ` al ${phone}` : ""}.</p>
      <p>Te esperamos.<br/>Equipo de ${business}</p>
    `),
    purpose: "Se envía al cliente apenas confirma una cita.",
    critical_variables: ["contact.first_name", "appointment.start_time"],
  });

  // 2. Recordatorio 24h antes
  templates.push({
    key: "appointment_reminder_24h",
    name: "Recordatorio de cita · 24h antes",
    subject: `Mañana te esperamos en ${business}`,
    body_html: html(`
      <p>Hola {{contact.first_name}},</p>
      <p>Te recordamos que mañana tienes una cita en <strong>${business}</strong>.</p>
      <p><strong>Cuándo:</strong> {{appointment.start_time}}<br/>
      ${address ? `<strong>Dónde:</strong> ${address}<br/>` : ""}
      ${mapsUrl ? `<a href="${mapsUrl}">Ver mapa</a>` : ""}</p>
      <p>Si no podés asistir, te pedimos avisarnos cuanto antes${phone ? ` al ${phone}` : ""} para liberar el espacio.</p>
      <p>Gracias.<br/>${business}</p>
    `),
    purpose: "Recordatorio automático 24 horas antes de la cita programada.",
    critical_variables: ["contact.first_name", "appointment.start_time"],
  });

  // 3. Recordatorio 2h antes
  templates.push({
    key: "appointment_reminder_2h",
    name: "Recordatorio de cita · 2h antes",
    subject: `Tu cita en ${business} es en 2 horas`,
    body_html: html(`
      <p>{{contact.first_name}}, te esperamos en <strong>2 horas</strong> en ${business}.</p>
      ${address ? `<p><strong>Dirección:</strong> ${address}</p>` : ""}
      ${mapsUrl ? `<p><a href="${mapsUrl}">Cómo llegar</a></p>` : ""}
      ${phone ? `<p>Cualquier consulta: ${phone}</p>` : ""}
    `),
    purpose: "Recordatorio corto 2 horas antes — útil para servicios presenciales.",
    critical_variables: ["contact.first_name"],
  });

  // 4. Bienvenida post-primera-cita
  templates.push({
    key: "post_first_visit",
    name: "Bienvenida post primera visita",
    subject: `Gracias por tu visita a ${business}`,
    body_html: html(`
      <p>Hola {{contact.first_name}},</p>
      <p>Gracias por elegirnos. Esperamos que tu experiencia haya sido excelente.</p>
      <p>Si tienes alguna duda o necesitas algo más, estamos a tu disposición${phone ? ` por teléfono al ${phone}` : ""}${website ? ` o en <a href="${website}">${website.replace(/^https?:\/\//, "")}</a>` : ""}.</p>
      ${reviewUrl ? `<p>¿Te tomas un minuto para dejarnos una <a href="${reviewUrl}">reseña</a>? Nos ayuda mucho.</p>` : ""}
      <p>Te esperamos pronto.<br/>${business}</p>
    `),
    purpose: "Se envía 1-2 días después de la primera visita del cliente.",
    critical_variables: ["contact.first_name"],
  });

  // 5. Reactivación (cliente inactivo)
  templates.push({
    key: "reactivation",
    name: "Reactivación · cliente inactivo",
    subject: `Te extrañamos en ${business}`,
    body_html: html(`
      <p>Hola {{contact.first_name}},</p>
      <p>Hace un tiempo que no te vemos por <strong>${business}</strong>. Queríamos saber si está todo bien y recordarte que seguimos a tu disposición.</p>
      <p>Si quieres agendar una cita, respondé este correo${phone ? ` o escribinos al ${phone}` : ""} y te ayudamos a encontrar un horario que te funcione.</p>
      <p>Saludos.<br/>${business}</p>
    `),
    purpose: "Se envía a clientes que no han vuelto en X días/meses (configurable).",
    critical_variables: ["contact.first_name"],
  });

  // 6. Encuesta post-servicio
  templates.push({
    key: "post_service_survey",
    name: "Encuesta de satisfacción",
    subject: `¿Cómo fue tu experiencia en ${business}?`,
    body_html: html(`
      <p>Hola {{contact.first_name}},</p>
      <p>Nos gustaría conocer tu opinión sobre la atención que recibiste. Tu feedback nos ayuda a mejorar.</p>
      <p>Solo te toma 1 minuto:</p>
      <p style="margin: 16px 0;">
        <a href="{{custom_values.encuesta_url}}" style="background:#2dc4a0;color:#0a0a0a;padding:10px 20px;text-decoration:none;border-radius:6px;font-weight:bold;">Responder encuesta</a>
      </p>
      ${reviewUrl ? `<p>O si prefieres, podés dejarnos una <a href="${reviewUrl}">reseña en Google</a>.</p>` : ""}
      <p>Gracias por confiar en nosotros.<br/>${business}</p>
    `),
    purpose: "Encuesta NPS / satisfacción enviada después de cada servicio completado.",
    critical_variables: ["contact.first_name", "custom_values.encuesta_url"],
  });

  return templates;
}

/* ───────────────────── Helpers ───────────────────── */

/** Limpia el HTML: trim, colapsa líneas vacías múltiples. */
function html(raw: string): string {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();
}

/** Lee un custom_value del autoconfig por key, o "". */
function cv(cfg: GhlAutoConfig, key: string): string {
  const found = cfg.custom_values.find((c) => c.key === key);
  if (!found) return "";
  return typeof found.value === "string" ? found.value : String(found.value ?? "");
}
