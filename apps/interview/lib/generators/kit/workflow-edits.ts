/**
 * Generador de "instrucciones de edición" para los workflows que vienen
 * en el snapshot Kwiq base.
 *
 * Como la API de GHL no permite crear workflows completos vía
 * POST/PUT, el snapshot los trae pre-armados pero con texto GENÉRICO
 * (placeholder). El equipo Kwiq tiene que entrar a cada workflow y
 * editar el contenido específico del cliente.
 *
 * Este módulo genera un checklist de "para cada workflow del snapshot,
 * editá estos campos con este contenido". El admin lo abre, copia y
 * pega en GHL.
 *
 * Cada instrucción identifica:
 *   - workflow_name → nombre del workflow en GHL
 *   - actions[] → qué acción editar y con qué contenido
 *
 * La lista de workflows típicos es heurística — asume que el snapshot
 * Kwiq base trae los más comunes. Si el snapshot real es distinto, el
 * admin ignora los que no aplican.
 */
import type { GhlAutoConfig } from "@/lib/generators/ghl-autoconfig";
import { buildEmailTemplates } from "./email-templates";
import { buildSnippets } from "./snippets";

export interface WorkflowAction {
  /** Tipo de acción dentro del workflow (Send Email, Send SMS, Send WA, etc). */
  action_type: "send_email" | "send_sms" | "send_whatsapp" | "add_tag" | "wait" | "if_else";
  /** Cómo identifica el admin la acción en GHL (label visible). */
  action_label: string;
  /** Contenido sugerido. Para emails: { subject, body }; para SMS/WA: { body }. */
  content?: {
    subject?: string;
    body?: string;
  };
  /** Notas adicionales (ej. "asegurate de que el tag X exista"). */
  note?: string;
}

export interface WorkflowEdit {
  /** Slug interno. */
  key: string;
  /** Nombre del workflow en GHL (matchea contra inventory.workflows). */
  workflow_name: string;
  /** Resumen de qué hace el workflow. */
  description: string;
  /** Acciones a editar/configurar dentro del workflow. */
  actions: WorkflowAction[];
}

export function buildWorkflowEdits(cfg: GhlAutoConfig): WorkflowEdit[] {
  const emails = buildEmailTemplates(cfg);
  const snippets = buildSnippets(cfg);

  const findEmail = (key: string) => emails.find((e) => e.key === key);
  const findSnippet = (key: string) => snippets.find((s) => s.key === key);

  const edits: WorkflowEdit[] = [];

  // ── 1. Confirmación de cita ───────────────────────────────
  const confirmEmail = findEmail("appointment_confirmation");
  edits.push({
    key: "appointment_confirmation",
    workflow_name: "Confirmación de cita",
    description:
      "Se dispara cuando un cliente agenda una cita. Envía email + SMS (y WhatsApp si está configurado) con los datos de la cita.",
    actions: [
      ...(confirmEmail
        ? [
            {
              action_type: "send_email" as const,
              action_label: "Enviar email de confirmación",
              content: {
                subject: confirmEmail.subject,
                body: confirmEmail.body_html,
              },
              note: "Vincular el template 'Confirmación de cita' o pegar contenido directo.",
            },
          ]
        : []),
      {
        action_type: "send_sms" as const,
        action_label: "Enviar SMS de confirmación",
        content: {
          body: `Hola {{contact.first_name}}, tu cita en ${cv(cfg, "nombre_del_negocio") || cfg.company.name || ""} fue confirmada para {{appointment.start_time}}. ${cv(cfg, "telefono") ? `Cualquier consulta: ${cv(cfg, "telefono")}` : ""}`.trim(),
        },
      },
    ],
  });

  // ── 2. Recordatorio 24h antes ─────────────────────────────
  const rem24 = findEmail("appointment_reminder_24h");
  edits.push({
    key: "appointment_reminder_24h",
    workflow_name: "Recordatorio 24h antes",
    description:
      "Trigger: appointment_status = 'confirmed' AND start_time = tomorrow. Envía recordatorio para que el cliente no falte.",
    actions: [
      ...(rem24
        ? [
            {
              action_type: "send_email" as const,
              action_label: "Enviar email de recordatorio",
              content: {
                subject: rem24.subject,
                body: rem24.body_html,
              },
            },
          ]
        : []),
      {
        action_type: "send_sms" as const,
        action_label: "Enviar SMS de recordatorio",
        content: {
          body: `Recordatorio: tu cita en ${cv(cfg, "nombre_del_negocio") || cfg.company.name || ""} es mañana {{appointment.start_time}}. Si no podés asistir, avísanos.`,
        },
      },
    ],
  });

  // ── 3. Recordatorio 2h antes ──────────────────────────────
  const rem2 = findEmail("appointment_reminder_2h");
  edits.push({
    key: "appointment_reminder_2h",
    workflow_name: "Recordatorio 2h antes",
    description:
      "Trigger: 2h antes del start_time. Útil para servicios presenciales — disminuye no-shows.",
    actions: [
      ...(rem2
        ? [
            {
              action_type: "send_email" as const,
              action_label: "Enviar email recordatorio 2h",
              content: { subject: rem2.subject, body: rem2.body_html },
            },
          ]
        : []),
      {
        action_type: "send_sms" as const,
        action_label: "Enviar SMS recordatorio 2h",
        content: {
          body: `{{contact.first_name}}, te esperamos en 2 horas en ${cv(cfg, "nombre_del_negocio") || cfg.company.name || ""}. ${cv(cfg, "direccion") ? `Dirección: ${cv(cfg, "direccion")}` : ""}`.trim(),
        },
      },
    ],
  });

  // ── 4. Bienvenida post-primera-cita ───────────────────────
  const welcome = findEmail("post_first_visit");
  if (welcome) {
    edits.push({
      key: "post_first_visit",
      workflow_name: "Bienvenida post primera visita",
      description:
        "Trigger: appointment_completed AND es la primera cita del contacto. Envía email de agradecimiento 1-2 días después.",
      actions: [
        {
          action_type: "wait",
          action_label: "Esperar 1-2 días",
          note: "Configurá el delay en la acción Wait del workflow.",
        },
        {
          action_type: "send_email",
          action_label: "Enviar email de bienvenida",
          content: { subject: welcome.subject, body: welcome.body_html },
        },
      ],
    });
  }

  // ── 5. Reactivación ──────────────────────────────────────
  const reactivation = findEmail("reactivation");
  if (reactivation) {
    edits.push({
      key: "reactivation",
      workflow_name: "Reactivación · cliente inactivo",
      description:
        "Trigger: contact sin appointment en los últimos N días (definir según industria). Intenta traer al cliente de vuelta.",
      actions: [
        {
          action_type: "send_email",
          action_label: "Enviar email de reactivación",
          content: { subject: reactivation.subject, body: reactivation.body_html },
        },
        {
          action_type: "add_tag",
          action_label: "Agregar tag 'reactivacion-intentada'",
          note: "Para no spamear al cliente con el mismo mensaje varias veces.",
        },
      ],
    });
  }

  // ── 6. Encuesta post-servicio ─────────────────────────────
  const survey = findEmail("post_service_survey");
  if (survey) {
    edits.push({
      key: "post_service_survey",
      workflow_name: "Encuesta post-servicio",
      description:
        "Trigger: appointment_completed. Pide feedback / reseña al cliente.",
      actions: [
        {
          action_type: "wait",
          action_label: "Esperar 2-4 horas después de la cita",
        },
        {
          action_type: "send_email",
          action_label: "Enviar encuesta",
          content: { subject: survey.subject, body: survey.body_html },
        },
      ],
    });
  }

  // ── 7. Handoff a humano (workflow disparado por el agente IA) ─
  const handoffSnippet = findSnippet("handoff_to_human");
  edits.push({
    key: "human_handoff",
    workflow_name: "Human Handover · transferencia desde el agente IA",
    description:
      "Trigger: el agente Conversation AI ejecuta la acción Human Handover. Pausa el bot y notifica al equipo.",
    actions: [
      {
        action_type: "add_tag",
        action_label: "Agregar tag 'agente-paused'",
        note: "El agente IA respeta este tag para no responder más sobre este contacto.",
      },
      ...(handoffSnippet
        ? [
            {
              action_type: "send_whatsapp" as const,
              action_label: "Enviar mensaje al cliente con la frase de handoff",
              content: { body: handoffSnippet.body },
              note: "Si la conversación va por WhatsApp. Si va por SMS, replicá el contenido.",
            },
          ]
        : []),
      {
        action_type: "send_sms",
        action_label: "Notificar al equipo (SMS interno)",
        content: {
          body: `🔔 Handoff: el agente IA pasó a humano a {{contact.first_name}} {{contact.last_name}} ({{contact.phone}}). Revisá la conversación.`,
        },
        note: "Configurá el destinatario como el usuario de guardia.",
      },
    ],
  });

  return edits;
}

/* ───────────────────── Helpers ───────────────────── */

function cv(cfg: GhlAutoConfig, key: string): string {
  const found = cfg.custom_values.find((c) => c.key === key);
  if (!found) return "";
  return typeof found.value === "string" ? found.value : String(found.value ?? "");
}
