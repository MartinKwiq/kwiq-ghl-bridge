/**
 * Entrypoint del Kit de Configuración Manual.
 *
 * Combina los 4 generadores (email templates, snippets, FAQs, workflow
 * edits) en un único objeto que la página del Kit consume.
 *
 * También computa el "diff inteligente" contra el inventario remoto:
 * para email_templates y workflows, comparamos por nombre normalizado
 * para indicar si el item ya está en GHL o falta crear.
 */
import { buildEmailTemplates, type EmailTemplate } from "./email-templates";
import { buildSnippets, type Snippet } from "./snippets";
import { buildKbFaqs, type KbFaq } from "./kb-faqs";
import { buildWorkflowEdits, type WorkflowEdit } from "./workflow-edits";
import { computeDiff, type DiffReport } from "@/lib/provisioner/diff";
import type { GhlAutoConfig } from "@/lib/generators/ghl-autoconfig";
import type { InventoryReport } from "@/lib/provisioner/inventory";

export interface KitBundle {
  email_templates: {
    items: EmailTemplate[];
    diff: DiffReport<EmailTemplate> | null;
  };
  snippets: {
    items: Snippet[];
  };
  kb_faqs: {
    items: KbFaq[];
  };
  workflow_edits: {
    items: WorkflowEdit[];
    diff: DiffReport<WorkflowEdit> | null;
  };
  /** Metadata para la UI. */
  generated_at: string;
  has_inventory: boolean;
}

export function buildKit(
  cfg: GhlAutoConfig,
  inventory: InventoryReport | null,
): KitBundle {
  const emailTemplates = buildEmailTemplates(cfg);
  const snippets = buildSnippets(cfg);
  const kbFaqs = buildKbFaqs(cfg);
  const workflowEdits = buildWorkflowEdits(cfg);

  // Diff vs inventory remoto.
  const emailDiff =
    inventory?.email_templates && inventory.email_templates.fetched
      ? computeDiff(
          emailTemplates,
          inventory.email_templates.items,
          (t) => t.name,
          ["name"],
          [
            {
              label: "subject",
              fromLocal: (t) => t.subject,
              fromRemote: (r) => r.subject,
            },
          ],
        )
      : null;

  const workflowDiff =
    inventory?.workflows && inventory.workflows.fetched
      ? computeDiff(
          workflowEdits,
          inventory.workflows.items,
          (w) => w.workflow_name,
          ["name"],
          [
            // Para workflows solo nos importa que existan — los contenidos
            // están dentro de los nodos del workflow, no en el listado.
            // Por eso no comparamos campos: si el nombre matchea →
            // status = "matches".
          ],
        )
      : null;

  return {
    email_templates: { items: emailTemplates, diff: emailDiff },
    snippets: { items: snippets },
    kb_faqs: { items: kbFaqs },
    workflow_edits: { items: workflowEdits, diff: workflowDiff },
    generated_at: new Date().toISOString(),
    has_inventory: !!inventory,
  };
}

export type { EmailTemplate, Snippet, KbFaq, WorkflowEdit };
