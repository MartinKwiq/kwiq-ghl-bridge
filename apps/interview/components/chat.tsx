"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { BrandingUploader } from "@/components/branding-uploader";
import {
  HelperCard,
  HelperToggleButton,
} from "@/components/interview/helper-card";
import { getHelper, userIsAskingForHelp } from "@/lib/interview-helpers";

type Role = "user" | "assistant";
interface UiMessage {
  role: Role;
  content: string;
  sectionId?: string;
  status?: "in_progress" | "section_complete" | "need_clarification";
}

export function Chat({
  token,
  sectionId,
  initialMessages,
  initialSectionTitle,
}: {
  token: string;
  sectionId: string;
  initialMessages: UiMessage[];
  initialSectionTitle: string;
}) {
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [currentSection, setCurrentSection] = useState<{ id: string; title: string }>(
    { id: sectionId, title: initialSectionTitle },
  );
  const [error, setError] = useState<string | null>(null);
  /** Slot (question_id) en el que el bot está trabajando ahora. Lo setea el
   *  engine devolviendo `nextFocus` en cada turno. Sirve para elegir el helper
   *  contextual correcto. */
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null);
  const [helperOpen, setHelperOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Helper para la pregunta activa, si existe.
  const activeHelper = useMemo(
    () => (currentQuestionId ? getHelper(currentQuestionId) : undefined),
    [currentQuestionId],
  );

  // Si cambia la pregunta activa, cerramos el helper anterior.
  useEffect(() => {
    setHelperOpen(false);
  }, [currentQuestionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    // Detección proactiva: si el usuario parece estar pidiendo ayuda y ya
    // sabemos qué pregunta está activa con helper disponible, abrimos el
    // helper sin bloquear el envío. Así el bot también recibe el mensaje y
    // puede responder conversacionalmente; el drawer le da el paso a paso.
    if (activeHelper && userIsAskingForHelp(text)) {
      setHelperOpen(true);
    }

    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, message: text }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { details?: string };
        throw new Error(body.details || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        message: string;
        status: UiMessage["status"];
        sectionId: string;
        nextFocus?: string;
        sectionAdvanced?: { from: string; to: string | null };
      };
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.message, sectionId: data.sectionId, status: data.status },
      ]);
      if (data.sectionAdvanced?.to && data.sectionAdvanced.to !== currentSection.id) {
        // La API devuelve solo IDs; el título completo se recalcula en /entrevista con el schema.
        setCurrentSection({ id: data.sectionAdvanced.to, title: data.sectionAdvanced.to });
      }
      // Si el bot nos dijo sobre qué slot está trabajando, actualizamos el
      // helper contextual. Si no mandó nextFocus (ocurre raramente), dejamos
      // el previo — mejor UX que limpiarlo.
      if (data.nextFocus) {
        setCurrentQuestionId(data.nextFocus);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col">
      <header className="border-b border-kwiq-border px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" aria-label="Inicio Kwiq">
              <Logo variant="mark" size={32} />
            </Link>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.15em] text-kwiq-muted">Sección actual</p>
              <h2 className="truncate font-display text-xl font-medium uppercase tracking-wide">{currentSection.title}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/entrevista/${token}/outputs`}
              className="rounded-lg border border-kwiq-border px-3 py-1.5 text-xs hover:bg-kwiq-bg/40"
            >
              Ver configuración
            </Link>
            <code className="rounded border border-kwiq-border bg-kwiq-bg px-2 py-1 text-xs text-kwiq-muted">
              {token.slice(0, 8)}…
            </code>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="kwiq-scroll flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {messages.map((m, i) => (
            <Bubble key={i} message={m} />
          ))}
          {sending && (
            <div className="self-start rounded-2xl bubble-bot px-4 py-3">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          )}
          {currentSection.id === "branding" && (
            <BrandingUploader
              token={token}
              onUploaded={(a) => {
                setMessages((m) => [
                  ...m,
                  {
                    role: "assistant",
                    content: `Recibí tu archivo de ${a.kind === "logo" ? "logo" : a.kind === "palette" ? "paleta" : a.kind === "font" ? "tipografía" : a.kind === "brandbook" ? "brandbook" : "marca"}: ${a.original_name ?? a.file_path.split("/").pop()}. Lo guardé en el proyecto — seguimos.`,
                    sectionId: "branding",
                    status: "in_progress",
                  },
                ]);
              }}
            />
          )}
        </div>
      </div>

      {error && (
        <div className="mx-6 mb-2 rounded-md border border-kwiq-err/40 bg-kwiq-err/10 px-3 py-2 text-sm text-kwiq-err">
          {error}
        </div>
      )}

      {activeHelper && helperOpen && (
        <div className="border-t border-kwiq-border px-6 pt-3">
          <HelperCard helper={activeHelper} onClose={() => setHelperOpen(false)} />
        </div>
      )}

      <form
        className="border-t border-kwiq-border px-6 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Escribí tu respuesta…"
            className="min-h-[44px] flex-1 resize-none rounded-lg border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 text-sm outline-none focus:border-kwiq-accent"
          />
          {activeHelper && (
            <HelperToggleButton
              open={helperOpen}
              onClick={() => setHelperOpen((v) => !v)}
              disabled={sending}
            />
          )}
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className={cn(
              "h-11 rounded-lg px-4 text-sm font-medium transition",
              sending || !input.trim()
                ? "bg-kwiq-border text-kwiq-muted"
                : "bg-kwiq-accent text-kwiq-bg hover:bg-kwiq-accentHover",
            )}
          >
            Enviar
          </button>
        </div>
      </form>
    </div>
  );
}

function Bubble({ message }: { message: UiMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex animate-fade-in", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser ? "bubble-user" : "bubble-bot",
        )}
      >
        {message.content}
        {message.status === "section_complete" && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-kwiq-ok/40 bg-kwiq-ok/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-kwiq-ok">
            Sección completa
          </div>
        )}
      </div>
    </div>
  );
}
