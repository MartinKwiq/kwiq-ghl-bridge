"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type {
  KitBundle,
  EmailTemplate,
  Snippet,
  KbFaq,
  WorkflowEdit,
} from "@/lib/generators/kit";
import type { DiffItem } from "@/lib/provisioner/diff";

/**
 * Componente cliente del Kit de Configuración Manual.
 *
 * 4 tabs:
 *   - Plantillas de email
 *   - Snippets (WhatsApp/SMS)
 *   - FAQs (Knowledge Base)
 *   - Workflows (instrucciones de edición)
 *
 * Por cada item:
 *   - Badge de status (existe / falta / desactualizado) cuando hay diff.
 *   - Contenido visible (subject + body, body de snippet, etc).
 *   - Botón "Copiar al portapapeles" con feedback.
 */

type Tab = "email" | "snippets" | "faqs" | "workflows";

export function KitView({ kit }: { kit: KitBundle }) {
  const [tab, setTab] = useState<Tab>("email");

  const counts = {
    email: kit.email_templates.items.length,
    snippets: kit.snippets.items.length,
    faqs: kit.kb_faqs.items.length,
    workflows: kit.workflow_edits.items.length,
  };

  return (
    <section className="rounded-2xl border border-kwiq-border bg-kwiq-panel/40 p-6">
      <div className="mb-4 flex flex-wrap gap-1">
        <TabBtn active={tab === "email"} onClick={() => setTab("email")} label={`Plantillas de email · ${counts.email}`} />
        <TabBtn active={tab === "snippets"} onClick={() => setTab("snippets")} label={`Snippets WhatsApp/SMS · ${counts.snippets}`} />
        <TabBtn active={tab === "faqs"} onClick={() => setTab("faqs")} label={`FAQs Knowledge Base · ${counts.faqs}`} />
        <TabBtn active={tab === "workflows"} onClick={() => setTab("workflows")} label={`Workflows · ${counts.workflows}`} />
      </div>

      {tab === "email" && <EmailSection kit={kit} />}
      {tab === "snippets" && <SnippetsSection items={kit.snippets.items} />}
      {tab === "faqs" && <FaqsSection items={kit.kb_faqs.items} />}
      {tab === "workflows" && <WorkflowsSection kit={kit} />}
    </section>
  );
}

function TabBtn({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-xs uppercase tracking-widest transition",
        active
          ? "border-kwiq-accent bg-kwiq-accent/10 text-kwiq-accent"
          : "border-kwiq-border bg-kwiq-bg/40 text-kwiq-muted hover:border-kwiq-accent/60 hover:text-kwiq-text",
      )}
    >
      {label}
    </button>
  );
}

/* ───────────────────── Email Templates ───────────────────── */

function EmailSection({ kit }: { kit: KitBundle }) {
  const items = kit.email_templates.items;
  const diff = kit.email_templates.diff;

  // Index del diff por key local para buscar status fácil.
  const diffByKey = new Map<string, DiffItem<EmailTemplate>>();
  if (diff) {
    for (const d of diff.items) diffByKey.set(d.local.key, d);
  }

  return (
    <div className="flex flex-col gap-3">
      {diff && (
        <DiffSummary counts={diff.counts} orphanCount={diff.orphanRemotes.length} />
      )}
      {items.map((t) => {
        const d = diffByKey.get(t.key);
        return (
          <EmailCard key={t.key} template={t} diff={d ?? null} />
        );
      })}
    </div>
  );
}

function EmailCard({
  template,
  diff,
}: {
  template: EmailTemplate;
  diff: DiffItem<EmailTemplate> | null;
}) {
  return (
    <div className="rounded-xl border border-kwiq-border bg-kwiq-bg/40 p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-kwiq-text">{template.name}</h3>
          <StatusBadge diff={diff} />
        </div>
        <CopyButton label="Copiar HTML" text={template.body_html} />
      </div>
      <p className="mb-3 text-xs text-kwiq-muted">{template.purpose}</p>
      <div className="rounded-md border border-kwiq-border bg-kwiq-panel/60 p-3 text-xs">
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <span className="text-kwiq-muted">Asunto:</span>
          <span className="font-medium text-kwiq-text">{template.subject}</span>
          <CopyButton small label="copiar" text={template.subject} />
        </div>
        <pre className="kwiq-scroll max-h-[260px] overflow-auto whitespace-pre-wrap rounded bg-kwiq-bg/60 p-2 font-mono text-[11px] leading-relaxed text-kwiq-text">
          {template.body_html}
        </pre>
      </div>
      {diff && diff.status === "outdated" && diff.diffFields.length > 0 && (
        <p className="mt-2 text-xs text-kwiq-warn">
          <strong>Diferencias con GHL:</strong> {diff.diffFields.join(", ")}.
          Reemplazá el contenido del template existente con el de arriba.
        </p>
      )}
    </div>
  );
}

/* ───────────────────── Snippets ───────────────────── */

function SnippetsSection({ items }: { items: Snippet[] }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((s) => (
        <div
          key={s.key}
          className="flex flex-col gap-2 rounded-xl border border-kwiq-border bg-kwiq-bg/40 p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-kwiq-text">{s.name}</h3>
              <code className="rounded bg-kwiq-bg/60 px-1.5 py-0.5 font-mono text-[11px] text-kwiq-accent">
                {s.shortcut}
              </code>
              <ChannelBadge channel={s.channel} />
            </div>
            <CopyButton label="Copiar" text={s.body} />
          </div>
          <p className="text-xs text-kwiq-muted">{s.purpose}</p>
          <pre className="kwiq-scroll whitespace-pre-wrap rounded bg-kwiq-bg/60 p-3 font-mono text-[12px] leading-relaxed text-kwiq-text">
            {s.body}
          </pre>
        </div>
      ))}
    </div>
  );
}

function ChannelBadge({ channel }: { channel: Snippet["channel"] }) {
  const map = {
    whatsapp: { label: "WhatsApp", cls: "border-kwiq-ok/40 bg-kwiq-ok/10 text-kwiq-ok" },
    sms: { label: "SMS", cls: "border-kwiq-accent/40 bg-kwiq-accent/10 text-kwiq-accent" },
    both: { label: "WhatsApp + SMS", cls: "border-kwiq-border bg-kwiq-bg/40 text-kwiq-muted" },
  };
  const m = map[channel];
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest", m.cls)}>
      {m.label}
    </span>
  );
}

/* ───────────────────── FAQs ───────────────────── */

function FaqsSection({ items }: { items: KbFaq[] }) {
  // Agrupar por categoría.
  const byCategory = new Map<string, KbFaq[]>();
  for (const f of items) {
    if (!byCategory.has(f.category)) byCategory.set(f.category, []);
    byCategory.get(f.category)!.push(f);
  }

  return (
    <div className="flex flex-col gap-5">
      <CopyAllFaqs items={items} />
      {[...byCategory.entries()].map(([cat, faqs]) => (
        <div key={cat}>
          <h3 className="mb-2 text-xs uppercase tracking-[0.18em] text-kwiq-muted">
            {cat}
          </h3>
          <div className="flex flex-col gap-2">
            {faqs.map((f) => (
              <div
                key={f.key}
                className="rounded-xl border border-kwiq-border bg-kwiq-bg/40 p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="font-medium text-kwiq-text">{f.question}</h4>
                  <CopyButton small label="copiar" text={`P: ${f.question}\nR: ${f.answer}`} />
                </div>
                <p className="mt-2 text-sm text-kwiq-text">{f.answer}</p>
                {f.answer.includes("[HANDOFF]") && (
                  <p className="mt-2 text-xs text-kwiq-accent">
                    ⓘ Marker [HANDOFF]: si querés que el agente IA dispare la
                    acción de handoff automáticamente, dejá el marker. Si
                    preferís que solo conteste con el texto, sacalo antes de
                    pegarlo en GHL.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CopyAllFaqs({ items }: { items: KbFaq[] }) {
  const blob = items
    .map((f) => `P: ${f.question}\nR: ${f.answer}`)
    .join("\n\n---\n\n");
  return (
    <div className="rounded-xl border border-kwiq-accent/30 bg-kwiq-accent/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-kwiq-muted">
          Copiar TODAS las FAQs como bloque (formato P:/R: separado por ---).
        </p>
        <CopyButton label="Copiar todo" text={blob} />
      </div>
    </div>
  );
}

/* ───────────────────── Workflows ───────────────────── */

function WorkflowsSection({ kit }: { kit: KitBundle }) {
  const items = kit.workflow_edits.items;
  const diff = kit.workflow_edits.diff;

  const diffByKey = new Map<string, DiffItem<WorkflowEdit>>();
  if (diff) {
    for (const d of diff.items) diffByKey.set(d.local.key, d);
  }

  return (
    <div className="flex flex-col gap-3">
      {diff && (
        <DiffSummary counts={diff.counts} orphanCount={diff.orphanRemotes.length} />
      )}
      {items.map((w) => {
        const d = diffByKey.get(w.key);
        return <WorkflowCard key={w.key} edit={w} diff={d ?? null} />;
      })}
    </div>
  );
}

function WorkflowCard({
  edit,
  diff,
}: {
  edit: WorkflowEdit;
  diff: DiffItem<WorkflowEdit> | null;
}) {
  return (
    <div className="rounded-xl border border-kwiq-border bg-kwiq-bg/40 p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-kwiq-text">{edit.workflow_name}</h3>
          <StatusBadge diff={diff} />
        </div>
      </div>
      <p className="mb-3 text-xs text-kwiq-muted">{edit.description}</p>
      <div className="flex flex-col gap-2">
        {edit.actions.map((a, i) => (
          <div
            key={i}
            className="rounded-lg border border-kwiq-border/60 bg-kwiq-panel/40 p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-center gap-2">
                <ActionTypeBadge type={a.action_type} />
                <span className="text-sm font-medium text-kwiq-text">
                  {a.action_label}
                </span>
              </div>
              {a.content?.body && (
                <CopyButton small label="copiar contenido" text={a.content.body} />
              )}
            </div>
            {a.note && (
              <p className="mt-2 text-xs italic text-kwiq-muted">ⓘ {a.note}</p>
            )}
            {a.content?.subject && (
              <div className="mt-2 text-xs">
                <span className="text-kwiq-muted">Asunto:</span>{" "}
                <span className="text-kwiq-text">{a.content.subject}</span>
              </div>
            )}
            {a.content?.body && (
              <pre className="kwiq-scroll mt-2 max-h-[200px] overflow-auto whitespace-pre-wrap rounded bg-kwiq-bg/60 p-2 font-mono text-[11px] leading-relaxed text-kwiq-text">
                {a.content.body}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionTypeBadge({ type }: { type: WorkflowEdit["actions"][0]["action_type"] }) {
  const map: Record<string, { label: string; cls: string }> = {
    send_email: { label: "Email", cls: "border-kwiq-accent/40 bg-kwiq-accent/10 text-kwiq-accent" },
    send_sms: { label: "SMS", cls: "border-kwiq-accent2/40 bg-kwiq-accent2/10 text-kwiq-text" },
    send_whatsapp: { label: "WhatsApp", cls: "border-kwiq-ok/40 bg-kwiq-ok/10 text-kwiq-ok" },
    add_tag: { label: "Tag", cls: "border-kwiq-warn/40 bg-kwiq-warn/10 text-kwiq-warn" },
    wait: { label: "Esperar", cls: "border-kwiq-border bg-kwiq-bg/40 text-kwiq-muted" },
    if_else: { label: "Si/Sino", cls: "border-kwiq-border bg-kwiq-bg/40 text-kwiq-muted" },
  };
  const m = map[type] ?? { label: type, cls: "border-kwiq-border bg-kwiq-bg/40 text-kwiq-muted" };
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest", m.cls)}>
      {m.label}
    </span>
  );
}

/* ───────────────────── Shared ───────────────────── */

function StatusBadge({ diff }: { diff: DiffItem<unknown> | null }) {
  if (!diff) return null;
  if (diff.status === "missing") {
    return (
      <span className="rounded-full border border-kwiq-warn/40 bg-kwiq-warn/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-kwiq-warn">
        ✗ Falta crear
      </span>
    );
  }
  if (diff.status === "matches") {
    return (
      <span className="rounded-full border border-kwiq-ok/40 bg-kwiq-ok/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-kwiq-ok">
        ✓ Ya existe
      </span>
    );
  }
  return (
    <span className="rounded-full border border-kwiq-accent/40 bg-kwiq-accent/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-kwiq-accent">
      ⚠ Editar existente
    </span>
  );
}

function DiffSummary({
  counts,
  orphanCount,
}: {
  counts: { total: number; missing: number; matches: number; outdated: number };
  orphanCount: number;
}) {
  return (
    <div className="rounded-xl border border-kwiq-border bg-kwiq-panel/60 px-4 py-3 text-xs text-kwiq-muted">
      <div className="flex flex-wrap gap-3">
        <span>
          <strong className="text-kwiq-text">{counts.total}</strong> items totales
        </span>
        <span className="text-kwiq-ok">
          ✓ {counts.matches} ya existen
        </span>
        <span className="text-kwiq-accent">
          ⚠ {counts.outdated} hay que editar
        </span>
        <span className="text-kwiq-warn">
          ✗ {counts.missing} hay que crear
        </span>
        {orphanCount > 0 && (
          <span>
            🟦 {orphanCount} extras en GHL (revisar si conservar o borrar)
          </span>
        )}
      </div>
    </div>
  );
}

function CopyButton({
  text,
  label,
  small,
}: {
  text: string;
  label: string;
  small?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={cn(
        "rounded-md border border-kwiq-border bg-kwiq-bg/60 text-xs text-kwiq-muted hover:border-kwiq-accent hover:text-kwiq-accent",
        small ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1",
      )}
    >
      {copied ? "✓ Copiado" : label}
    </button>
  );
}
