"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DEMO_SCRIPT, DEMO_WELCOME } from "@/lib/demo/script";
import { Logo } from "@/components/logo";

/**
 * Chat de demo 100% cliente.
 *
 * - No llama ni a `/api/chat` ni a Gemini ni a Supabase.
 * - Recorre `DEMO_SCRIPT` linealmente: cada turno del usuario consume el
 *   próximo `DemoReply` del array; al agotarse, vuelve a mostrar el último.
 * - Muestra en el panel lateral los datos "extraídos" para que se vea el
 *   slot-filling en acción.
 *
 * Pensado para que Martín pueda probar la UX apenas levanta `npm run dev`,
 * sin configurar credenciales.
 */

type Role = "user" | "assistant";

interface UiMessage {
  role: Role;
  content: string;
  status?: "in_progress" | "section_complete";
}

interface ExtractedRow {
  question_id: string;
  value: unknown;
  confidence: number;
  sectionId: string;
}

const INITIAL_SECTION = { id: "contexto_general", title: "Contexto general" };

export function ChatDemo() {
  const [messages, setMessages] = useState<UiMessage[]>([
    { role: "assistant", content: DEMO_WELCOME },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [currentSection, setCurrentSection] =
    useState<{ id: string; title: string }>(INITIAL_SECTION);
  const [extracted, setExtracted] = useState<ExtractedRow[]>([]);
  const [step, setStep] = useState(0); // índice del próximo DemoReply a consumir
  const [showPanel, setShowPanel] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setSending(true);

    // Simulamos "pensando…" para que la UX se sienta viva.
    await new Promise((r) => setTimeout(r, 750 + Math.random() * 500));

    const idx = Math.min(step, DEMO_SCRIPT.length - 1);
    const reply = DEMO_SCRIPT[idx]!;
    const sectionBefore = currentSection;

    // Actualizar sección (si avanza)
    let sectionAfter = sectionBefore;
    if (reply.advanceTo) sectionAfter = reply.advanceTo;

    // Mostrar mensaje del assistant
    setMessages((m) => [
      ...m,
      {
        role: "assistant",
        content: reply.assistant,
        status: reply.completesSection ? "section_complete" : "in_progress",
      },
    ]);

    // Sumar extracciones al panel
    if (reply.extracted?.length) {
      setExtracted((prev) => [
        ...prev,
        ...reply.extracted!.map((e) => ({
          question_id: e.question_id,
          value: e.value,
          confidence: e.confidence,
          sectionId: sectionBefore.id,
        })),
      ]);
    }

    // Avanzar sección
    if (reply.advanceTo) setCurrentSection(reply.advanceTo);
    setStep((s) => s + 1);
    setSending(false);
  }

  function reset() {
    setMessages([{ role: "assistant", content: DEMO_WELCOME }]);
    setInput("");
    setCurrentSection(INITIAL_SECTION);
    setExtracted([]);
    setStep(0);
  }

  const suggestion = getSuggestion(step);

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-kwiq-border px-6 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/" aria-label="Inicio Kwiq">
                <Logo variant="mark" size={32} />
              </Link>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.15em] text-kwiq-muted">
                  Demo · sección actual
                </p>
                <h2 className="truncate font-display text-xl font-medium uppercase tracking-wide">{currentSection.title}</h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPanel((v) => !v)}
                className="rounded-lg border border-kwiq-border px-3 py-1.5 text-xs hover:bg-kwiq-bg/40"
              >
                {showPanel ? "Ocultar configuración" : "Ver configuración"}
              </button>
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-kwiq-border px-3 py-1.5 text-xs hover:bg-kwiq-bg/40"
              >
                Reiniciar
              </button>
              <Link
                href="/"
                className="rounded-lg border border-kwiq-border px-3 py-1.5 text-xs hover:bg-kwiq-bg/40"
              >
                Volver
              </Link>
            </div>
          </div>
        </header>

        <div ref={scrollRef} className="kwiq-scroll flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            <div className="self-start rounded-xl border border-kwiq-accent/30 bg-kwiq-accent/10 px-3 py-2 text-xs text-kwiq-text">
              Estás en el modo demo de Kwiq. Las respuestas son fijas, pero la
              UX refleja cómo se siente la entrevista real. Para hacer la
              entrevista real necesitás un link de invitación de Kwiq —
              escribinos a <code className="font-mono">hola@kwiq.io</code>.
            </div>
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
          </div>
        </div>

        <form
          className="border-t border-kwiq-border px-6 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            {suggestion && !sending && (
              <button
                type="button"
                onClick={() => setInput(suggestion)}
                className="self-start rounded-full border border-kwiq-border bg-kwiq-bg/40 px-3 py-1 text-xs text-kwiq-muted hover:text-kwiq-text"
                title="Cargar una respuesta sugerida"
              >
                Sugerencia: {suggestion.slice(0, 60)}
                {suggestion.length > 60 ? "…" : ""}
              </button>
            )}
            <div className="flex items-end gap-2">
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
                placeholder="Escribí tu respuesta… (o tocá la sugerencia)"
                className="min-h-[44px] flex-1 resize-none rounded-lg border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 text-sm outline-none focus:border-kwiq-accent"
              />
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
          </div>
        </form>
      </div>

      {showPanel && (
        <aside className="kwiq-scroll hidden w-96 shrink-0 overflow-y-auto border-l border-kwiq-border bg-kwiq-panel/40 px-4 py-4 lg:block">
          <p className="text-xs uppercase tracking-[0.15em] text-kwiq-muted">
            Datos capturados
          </p>
          <h3 className="mt-1 text-sm font-medium">
            Lo que se aplicará a tu Kwiq
          </h3>
          {extracted.length === 0 ? (
            <p className="mt-4 rounded-lg border border-kwiq-border bg-kwiq-bg/30 p-3 text-xs text-kwiq-muted">
              Todavía no extraje nada. A medida que respondés, vas a ver acá los
              slots que se llenan con su nivel de confianza.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {extracted.map((row, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-kwiq-border bg-kwiq-bg/40 p-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <code className="font-mono text-[11px] text-kwiq-accent">
                      {row.question_id}
                    </code>
                    <span className="text-[10px] text-kwiq-muted">
                      {(row.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap break-words text-kwiq-text">
                    {formatValue(row.value)}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-widest text-kwiq-muted">
                    {row.sectionId}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}
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

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

/**
 * Sugerencias de respuesta por turno. Así Martín puede avanzar con 1 click
 * si solo quiere ver el flujo sin tipear.
 */
function getSuggestion(step: number): string | null {
  const suggestions: string[] = [
    "Tenemos un centro de estética; hoy 2 personas atienden a las clientas.",
    "Manejamos hasta 40 citas por día, con 4 simultáneas máximo.",
    "Usamos Google Calendar y una planilla compartida en Excel.",
    "Más o menos 60% agenda por WhatsApp o web, y 45% son recurrentes.",
    "Cancelan por WhatsApp, reprograman sin costo hasta 24hs antes; los no-shows los reemitimos.",
    "Verano y Día de la Madre son los picos. Tenemos 10% off al cuarto servicio.",
    "El email es hola@acmebeauty.com.ar y el teléfono +54 11 5555 0001.",
    "Sitio web: acmebeauty.com.ar. El agente IA se llama Sofi.",
    "Perfecto, sigamos.",
  ];
  return suggestions[step] ?? null;
}
