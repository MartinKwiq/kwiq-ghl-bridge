"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { BrandingUploader } from "@/components/branding-uploader";
import {
  HelperCard,
  HelperToggleButton,
} from "@/components/interview/helper-card";
import { getHelper, userIsAskingForHelp } from "@/lib/interview-helpers";
import { VoiceInputButton } from "@/components/interview/voice-input-button";
import { getSectionById, getQuestionById } from "@/lib/interview-schema";

type Role = "user" | "assistant";
interface UiMessage {
  role: Role;
  content: string;
  sectionId?: string;
  status?: "in_progress" | "section_complete" | "need_clarification";
}

export interface ChatSection {
  id: string;
  title: string;
  /** Orden de presentación (mismo `order` del schema). */
  order: number;
}

export function Chat({
  token,
  sectionId,
  initialMessages,
  initialSectionTitle,
  sections,
  completedSectionIds,
}: {
  token: string;
  sectionId: string;
  initialMessages: UiMessage[];
  initialSectionTitle: string;
  /** Todas las secciones del schema (ordenadas por `order`). */
  sections: ChatSection[];
  /** IDs de secciones que el cliente ya completó en esta sesión. */
  completedSectionIds: string[];
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
  /** Mantenemos en estado qué secciones completó el cliente para poder sumar
   *  en local cuando el bot marque una sección como completa — así la barra
   *  de progreso se actualiza sin recargar la página. */
  const [completed, setCompleted] = useState<Set<string>>(
    () => new Set(completedSectionIds),
  );
  const [pausing, setPausing] = useState(false);
  const [confirmPause, setConfirmPause] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Helper para la pregunta activa, si existe.
  const activeHelper = useMemo(
    () => (currentQuestionId ? getHelper(currentQuestionId) : undefined),
    [currentQuestionId],
  );

  // Sugerencias del schema para la pregunta activa (ej. nombres del agente IA).
  const activeSuggestions = useMemo(() => {
    if (!currentQuestionId) return undefined;
    const q = getQuestionById(currentQuestionId);
    return q?.suggestions;
  }, [currentQuestionId]);

  // Si cambia la pregunta activa, cerramos el helper anterior.
  useEffect(() => {
    setHelperOpen(false);
  }, [currentQuestionId]);

  // Indicador "voz activa" — solo para mostrar visualmente que estamos
  // dictando. La transcripción se va metiendo en el input directamente.
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const handleVoiceTranscript = useCallback(
    (text: string, isFinal: boolean) => {
      // Para parciales: pisamos lo "in-progress" del último dictado.
      // Para finales: acumulamos sobre lo que ya había en el textarea.
      setInput((prev) => {
        if (isFinal) return (prev ? prev + " " : "") + text.trim();
        return prev; // no actualizamos en parciales para no parpadear
      });
    },
    [],
  );

  const progressPct = useMemo(() => {
    if (sections.length === 0) return 0;
    return Math.round((completed.size / sections.length) * 100);
  }, [completed, sections.length]);

  async function pauseAndExit() {
    if (pausing) return;
    setPausing(true);
    try {
      const res = await fetch("/api/interview/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          detail?: string;
        };
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      // Redirigimos al dashboard del cliente — muestra progreso y permite retomar.
      window.location.href = "/interview?paused=1";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`No pudimos pausar la entrevista: ${msg}`);
      setPausing(false);
      setConfirmPause(false);
    }
  }

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
        // El endpoint devuelve un shape estable con `error` + `message`
        // ya redactado de forma neutra (sin filtrar detalles internos
        // del proveedor de IA, planes, cuotas, etc). Acá solo aplicamos
        // copy específico para los pocos casos en que el cliente puede
        // accionar por su cuenta (auth, sesión expirada, mensaje bloqueado).
        //
        // Importante: si el body no es JSON parseable (caso típico cuando
        // Vercel devuelve un timeout 504/503 con HTML plano del CDN),
        // `res.json()` falla y caemos al `{}`. En ese caso queremos
        // seguir mostrando el copy neutro, NO un "HTTP 503" pelado.
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
          details?: string;
        };

        if (body.error === "not_authenticated") {
          throw new Error(
            "Tu sesión expiró. Recargá la página e iniciá sesión de nuevo.",
          );
        }
        if (body.error === "forbidden" || body.error === "orphan_session") {
          throw new Error(
            "Esta entrevista no está disponible para tu cuenta. Si creés que es un error, escribinos a hola@kwiq.io.",
          );
        }

        // Para todo lo demás (llm_unavailable, llm_blocked, chat_failed,
        // db_error, timeout del CDN sin body JSON, etc.) usamos el
        // `message` del server si vino, y un copy neutro genérico si no.
        // NUNCA mostramos `details` crudo ni el HTTP code pelado — ese
        // contenido puede traer stack traces o nombres de proveedores.
        throw new Error(
          body.message ??
            "Estamos teniendo un inconveniente puntual al procesar tu respuesta. Tu progreso quedó guardado — probá enviar de nuevo en unos minutos, o pausá la entrevista y retomala más tarde, no se pierde nada.",
        );
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
        // Usamos el título del schema si existe; si no, mostramos el id como fallback.
        const nextSection = sections.find((s) => s.id === data.sectionAdvanced!.to);
        setCurrentSection({
          id: data.sectionAdvanced.to,
          title: nextSection?.title ?? data.sectionAdvanced.to,
        });

        // Mensaje narrativo: si la próxima sección tiene narrative_intro en el
        // schema, lo insertamos como un bubble del asistente ANTES del mensaje
        // real del LLM. Le explica al cliente para qué sirve la sección que
        // acaba de empezar. Si no hay narrative_intro, no mostramos nada extra.
        const nextSectionDef = getSectionById(data.sectionAdvanced.to);
        if (nextSectionDef?.narrative_intro) {
          const narrative: UiMessage = {
            role: "assistant",
            content: nextSectionDef.narrative_intro,
            sectionId: nextSectionDef.id,
            status: "in_progress",
          };
          // Insertamos el narrative DESPUÉS del último mensaje del bot.
          // El último mensaje suele ser el cierre de la sección anterior
          // ("Listo, terminamos esta sección. ¿Pasamos a la siguiente?")
          // y queremos que el cliente lea primero el cierre y después
          // la introducción de la nueva sección. La primera pregunta
          // concreta de la nueva sección viene en el siguiente turno del
          // bot, después de que el cliente responda.
          setMessages((m) => [...m, narrative]);
        }
      }
      if (data.sectionAdvanced?.from) {
        // Marcar la sección que se acaba de completar para que la barra de
        // progreso actualice el chip a "completa".
        setCompleted((prev) => {
          const next = new Set(prev);
          next.add(data.sectionAdvanced!.from);
          return next;
        });
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
              <p className="text-xs uppercase tracking-[0.15em] text-kwiq-muted">
                Sección actual · {completed.size} de {sections.length} completas ({progressPct}%)
              </p>
              <h2 className="truncate font-display text-xl font-medium uppercase tracking-wide">{currentSection.title}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmPause(true)}
              disabled={pausing}
              className="rounded-lg border border-kwiq-border px-3 py-1.5 text-xs text-kwiq-muted hover:border-kwiq-accent hover:text-kwiq-accent disabled:cursor-not-allowed disabled:opacity-50"
              title="Pausar la entrevista y retomar después"
            >
              Pausar
            </button>
            <Link
              href={`/entrevista/${token}/outputs`}
              className="rounded-lg border border-kwiq-border px-3 py-1.5 text-xs hover:bg-kwiq-bg/40"
            >
              Ver configuración
            </Link>
            <code className="hidden rounded border border-kwiq-border bg-kwiq-bg px-2 py-1 text-xs text-kwiq-muted sm:inline">
              {token.slice(0, 8)}…
            </code>
          </div>
        </div>

        <SectionProgress
          sections={sections}
          currentSectionId={currentSection.id}
          completed={completed}
        />
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

      {confirmPause && (
        <PauseConfirmModal
          onCancel={() => setConfirmPause(false)}
          onConfirm={pauseAndExit}
          pausing={pausing}
          completed={completed.size}
          total={sections.length}
        />
      )}

      {activeHelper && helperOpen && (
        <div className="border-t border-kwiq-border px-6 pt-3">
          <HelperCard helper={activeHelper} onClose={() => setHelperOpen(false)} />
        </div>
      )}

      {voiceError && (
        <div className="mx-6 mb-2 rounded-md border border-kwiq-warn/40 bg-kwiq-warn/10 px-3 py-2 text-sm text-kwiq-warn">
          {voiceError}
          <button
            type="button"
            onClick={() => setVoiceError(null)}
            className="ml-2 text-xs underline"
          >
            Cerrar
          </button>
        </div>
      )}

      {activeSuggestions && activeSuggestions.length > 0 && !sending && (
        <SuggestionStrip
          suggestions={activeSuggestions}
          onPick={(value) => setInput(value)}
        />
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
            placeholder="Escribí tu respuesta o tocá el micrófono…"
            className="min-h-[44px] flex-1 resize-none rounded-lg border border-kwiq-border bg-kwiq-bg/60 px-3 py-2 text-sm outline-none focus:border-kwiq-accent"
          />
          <VoiceInputButton
            onTranscript={handleVoiceTranscript}
            onError={setVoiceError}
            disabled={sending}
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

/**
 * Tira de chips con sugerencias preconfiguradas en el schema. Aparece arriba
 * del input cuando la pregunta activa tiene `suggestions[]` definidas.
 * Hover muestra la razón creativa; click llena el textarea (no envía solo,
 * el cliente puede editar antes).
 */
function SuggestionStrip({
  suggestions,
  onPick,
}: {
  suggestions: Array<{ value: string; why: string }>;
  onPick: (value: string) => void;
}) {
  return (
    <div className="border-t border-kwiq-border bg-kwiq-panel/30 px-6 py-3">
      <div className="mx-auto max-w-3xl">
        <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-kwiq-muted">
          Sugerencias · click para usar
        </p>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => onPick(s.value)}
              title={s.why}
              className="group relative rounded-full border border-kwiq-border bg-kwiq-bg/60 px-3 py-1 text-xs text-kwiq-text transition hover:border-kwiq-accent hover:bg-kwiq-accent/5 hover:text-kwiq-accent"
            >
              <span className="font-medium">{s.value}</span>
              <span className="ml-1.5 text-[10px] text-kwiq-muted group-hover:text-kwiq-accent/70">
                ⓘ
              </span>
              <span
                className="invisible absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-normal rounded-md border border-kwiq-border bg-kwiq-panel px-3 py-2 text-[11px] leading-snug text-kwiq-text shadow-xl group-hover:visible"
                style={{ width: "240px" }}
              >
                {s.why}
              </span>
            </button>
          ))}
        </div>
      </div>
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

/**
 * Barra de progreso por sección — renderiza un chip por cada sección del
 * schema con tres estados visuales: completa, actual, pendiente.
 *
 * Se muestra debajo del título del header. En móvil queda scrollable
 * horizontalmente para no romper la grilla.
 */
function SectionProgress({
  sections,
  currentSectionId,
  completed,
}: {
  sections: ChatSection[];
  currentSectionId: string;
  completed: Set<string>;
}) {
  return (
    <div className="kwiq-scroll mt-3 -mx-2 flex items-center gap-1.5 overflow-x-auto px-2 pb-1">
      {sections.map((s) => {
        const isCompleted = completed.has(s.id);
        const isCurrent = s.id === currentSectionId && !isCompleted;
        return (
          <span
            key={s.id}
            title={s.title}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-wider transition",
              isCompleted && "border-kwiq-ok/40 bg-kwiq-ok/10 text-kwiq-ok",
              isCurrent && "border-kwiq-accent bg-kwiq-accent/10 text-kwiq-accent",
              !isCompleted && !isCurrent &&
                "border-kwiq-border bg-kwiq-bg/40 text-kwiq-muted",
            )}
          >
            {isCompleted ? "✓ " : ""}{s.title}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Modal de confirmación antes de pausar. Remarca que no se pierde nada y
 * explica cómo retomar después.
 */
function PauseConfirmModal({
  onCancel,
  onConfirm,
  pausing,
  completed,
  total,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  pausing: boolean;
  completed: number;
  total: number;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Pausar entrevista"
    >
      <div className="w-full max-w-md rounded-2xl border border-kwiq-border bg-kwiq-panel p-6 shadow-2xl">
        <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-kwiq-text">
          Pausar la entrevista
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-kwiq-muted">
          Guardamos tu progreso hasta acá — llevás{" "}
          <strong className="text-kwiq-text">
            {completed} de {total} secciones
          </strong>{" "}
          completas. Cuando vuelvas, retomás exactamente donde quedaste.
        </p>
        <p className="mt-3 text-xs text-kwiq-muted">
          Tu cuenta se queda logueada en este navegador, así que podés volver
          entrando a tu panel desde cualquier dispositivo con el mismo email.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pausing}
            className="rounded-lg border border-kwiq-border px-3 py-1.5 text-sm text-kwiq-muted hover:text-kwiq-text disabled:opacity-50"
          >
            Seguir charlando
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pausing}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition",
              pausing
                ? "bg-kwiq-border text-kwiq-muted"
                : "bg-kwiq-accent text-kwiq-bg hover:bg-kwiq-accentHover",
            )}
          >
            {pausing ? "Pausando…" : "Pausar y salir"}
          </button>
        </div>
      </div>
    </div>
  );
}
