"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Tutorial onboarding del cliente para la entrevista completa.
 *
 * Wizard de 5 slides con animaciones SVG inline (sin video, sin assets
 * externos). Aparece automáticamente la primera vez que el cliente entra
 * al chat de entrevista. También se puede reabrir desde el botón "?" en
 * el header del chat.
 *
 * Misma técnica que MicTutorialModal — SVG + clipPath + animate SMIL.
 *
 * Slides:
 *   1. Bienvenida: cómo va a ser la conversación.
 *   2. Responder: teclado o micrófono.
 *   3. Progreso por secciones: barra que avanza.
 *   4. Pausar y retomar: guardado automático.
 *   5. Cierre: qué pasa cuando termina la entrevista.
 */

const STORAGE_KEY = "kwiq.onboarding_tutorial_seen.v1";

export function OnboardingTutorialModal({
  autoOpenOnFirstVisit = false,
  open,
  onClose,
}: {
  autoOpenOnFirstVisit?: boolean;
  open?: boolean;
  onClose: () => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (!autoOpenOnFirstVisit) return;
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (!seen) {
        setInternalOpen(true);
        setSlide(0);
      }
    } catch {
      /* noop */
    }
  }, [autoOpenOnFirstVisit]);

  // Resetear al slide 0 cada vez que se abre.
  useEffect(() => {
    if (open) setSlide(0);
  }, [open]);

  const isOpen = open ?? internalOpen;

  function handleClose() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* noop */
    }
    setInternalOpen(false);
    onClose();
  }

  if (!isOpen) return null;

  const slides = [
    {
      title: "Bienvenido a tu entrevista Kwiq",
      body: "Vamos a configurar tu negocio conversando, no llenando formularios. Te voy a hacer preguntas y tú me cuentas como si fuera una charla normal.",
      anim: <SlideChat />,
    },
    {
      title: "Responde como prefieras",
      body: "Puedes escribir con el teclado o tocar el micrófono para dictar tu respuesta. Funciona en cualquier navegador y no usa internet — la voz se procesa localmente.",
      anim: <SlideInput />,
    },
    {
      title: "Avanzamos por secciones",
      body: "La entrevista está dividida en 15 secciones cortas. Antes de cada una te explico qué vamos a configurar y para qué sirve. Te toma entre 20 y 30 minutos en total.",
      anim: <SlideSections />,
    },
    {
      title: "Pausa cuando quieras",
      body: "Si necesitas cortar, toca 'Pausar' arriba a la derecha. Guardamos todo automáticamente. Cuando vuelvas, retomas exactamente donde quedaste.",
      anim: <SlidePause />,
    },
    {
      title: "Al terminar, nosotros nos encargamos",
      body: "Cuando completes la entrevista, nuestro equipo recibe toda la información y configura tu cuenta automáticamente. Te avisamos cuando esté lista para usar.",
      anim: <SlideDone />,
    },
  ];

  const current = slides[slide]!;
  const isLast = slide === slides.length - 1;
  const isFirst = slide === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Cómo funciona la entrevista"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-kwiq-border bg-kwiq-panel p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-kwiq-muted">
            Tutorial · paso {slide + 1} de {slides.length}
          </p>
          <button
            type="button"
            onClick={handleClose}
            className="text-xs text-kwiq-muted hover:text-kwiq-text"
            aria-label="Saltar tutorial"
          >
            Saltar
          </button>
        </div>

        <h3 className="font-display text-2xl font-semibold uppercase tracking-wide text-kwiq-text">
          {current.title}
        </h3>
        <p className="mt-2 text-sm text-kwiq-muted">{current.body}</p>

        <div className="mt-4">{current.anim}</div>

        {/* Dots de progreso */}
        <div className="mt-5 flex items-center justify-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSlide(i)}
              aria-label={`Ir al paso ${i + 1}`}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === slide
                  ? "w-6 bg-kwiq-accent"
                  : "w-1.5 bg-kwiq-border hover:bg-kwiq-muted",
              )}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setSlide((s) => Math.max(0, s - 1))}
            disabled={isFirst}
            className="rounded-lg border border-kwiq-border px-3 py-1.5 text-sm text-kwiq-muted hover:text-kwiq-text disabled:opacity-30"
          >
            ← Anterior
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg bg-kwiq-accent px-4 py-2 text-sm font-medium text-kwiq-bg hover:bg-kwiq-accentHover"
            >
              ¡Empezar entrevista!
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSlide((s) => s + 1)}
              className="rounded-lg bg-kwiq-accent px-4 py-2 text-sm font-medium text-kwiq-bg hover:bg-kwiq-accentHover"
            >
              Siguiente →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────── */
/* SLIDES — cada una es una animación SVG inline en loop infinito.    */
/* Mismo estilo: viewBox 320x140, fondo bg-kwiq-bg/60.                */
/* ────────────────────────────────────────────────────────────────── */

function SlideContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-kwiq-border bg-kwiq-bg/60">
      <svg
        viewBox="0 0 320 140"
        className="block w-full"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        {children}
      </svg>
    </div>
  );
}

/** Slide 1 — Chat: burbujas alternándose. */
function SlideChat() {
  return (
    <SlideContainer>
      {/* Burbuja bot izquierda (aparece de 0-1s, persiste) */}
      <g opacity="0">
        <rect x="20" y="22" width="180" height="32" rx="10" fill="#0e1f1f" stroke="#1f3a3a" />
        <text x="30" y="42" fontSize="11" fill="#ffffff" fontFamily="ui-sans-serif, system-ui">
          ¿A qué se dedica tu negocio?
        </text>
        <animate
          attributeName="opacity"
          values="0;0;1;1;1;1"
          keyTimes="0;0.05;0.15;0.6;0.9;1"
          dur="6s"
          repeatCount="indefinite"
        />
      </g>
      {/* Burbuja usuario derecha (aparece de 2-3s, persiste) */}
      <g opacity="0">
        <rect x="120" y="62" width="180" height="32" rx="10" fill="#2dc4a0" />
        <text x="130" y="82" fontSize="11" fill="#0a0a0a" fontFamily="ui-sans-serif, system-ui">
          Soy dentista, atiendo en CDMX
        </text>
        <animate
          attributeName="opacity"
          values="0;0;0;1;1;1"
          keyTimes="0;0.3;0.4;0.5;0.9;1"
          dur="6s"
          repeatCount="indefinite"
        />
      </g>
      {/* Burbuja bot izquierda 2 (aparece de 4s en adelante) */}
      <g opacity="0">
        <rect x="20" y="102" width="200" height="32" rx="10" fill="#0e1f1f" stroke="#1f3a3a" />
        <text x="30" y="122" fontSize="11" fill="#ffffff" fontFamily="ui-sans-serif, system-ui">
          ¡Excelente! Cuéntame de tu equipo…
        </text>
        <animate
          attributeName="opacity"
          values="0;0;0;0;0;1;1"
          keyTimes="0;0.5;0.6;0.7;0.75;0.85;1"
          dur="6s"
          repeatCount="indefinite"
        />
      </g>
    </SlideContainer>
  );
}

/** Slide 2 — Input: teclado y mic, alternancia. */
function SlideInput() {
  return (
    <SlideContainer>
      {/* Input simulado */}
      <rect x="20" y="55" width="240" height="32" rx="8" fill="#0e1f1f" stroke="#1f3a3a" />
      {/* Texto que se tipea via clipPath */}
      <defs>
        <clipPath id="onboard-text-reveal">
          <rect x="32" y="62" width="0" height="20">
            <animate
              attributeName="width"
              values="0;0;180;180;0;0"
              keyTimes="0;0.1;0.4;0.55;0.6;1"
              dur="6s"
              repeatCount="indefinite"
            />
          </rect>
        </clipPath>
      </defs>
      <text
        x="32"
        y="76"
        fill="#ffffff"
        fontSize="13"
        fontFamily="ui-sans-serif, system-ui"
        clipPath="url(#onboard-text-reveal)"
      >
        Atendemos lunes a viernes
      </text>

      {/* Botón mic */}
      <g transform="translate(284, 71)">
        <circle r="16" fill="#0e1f1f" stroke="#1f3a3a">
          <animate
            attributeName="stroke"
            values="#1f3a3a;#1f3a3a;#1f3a3a;#1f3a3a;#e45a5a;#e45a5a;#1f3a3a"
            keyTimes="0;0.55;0.6;0.65;0.7;0.95;1"
            dur="6s"
            repeatCount="indefinite"
          />
        </circle>
        <g stroke="#8aa0a0" strokeWidth="1.6" strokeLinecap="round" fill="none">
          <path d="M 0 -7 a 2.5 2.5 0 0 1 2.5 2.5 v 5 a 2.5 2.5 0 0 1 -5 0 v -5 a 2.5 2.5 0 0 1 2.5 -2.5 z" />
          <path d="M -4.5 -1 v 1 a 4.5 4.5 0 0 0 9 0 v -1" />
          <line x1="0" y1="3.5" x2="0" y2="6.5" />
          <line x1="-3" y1="6.5" x2="3" y2="6.5" />
          <animate
            attributeName="stroke"
            values="#8aa0a0;#8aa0a0;#8aa0a0;#8aa0a0;#e45a5a;#e45a5a;#8aa0a0"
            keyTimes="0;0.55;0.6;0.65;0.7;0.95;1"
            dur="6s"
            repeatCount="indefinite"
          />
        </g>
        {/* Ondas sonido cuando el mic está activo */}
        <circle r="16" fill="none" stroke="#e45a5a" strokeWidth="1.5" opacity="0">
          <animate
            attributeName="r"
            values="16;16;16;16;16;24;16"
            keyTimes="0;0.55;0.6;0.65;0.7;0.85;1"
            dur="6s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0;0;0;0;0.7;0;0"
            keyTimes="0;0.55;0.6;0.7;0.75;0.85;1"
            dur="6s"
            repeatCount="indefinite"
          />
        </circle>
      </g>

      {/* Labels alternantes arriba */}
      <text x="100" y="35" fontSize="10" fill="#2dc4a0" textAnchor="middle" opacity="0">
        Escribiendo con el teclado
        <animate
          attributeName="opacity"
          values="0;1;1;0;0"
          keyTimes="0;0.15;0.5;0.55;1"
          dur="6s"
          repeatCount="indefinite"
        />
      </text>
      <text x="220" y="35" fontSize="10" fill="#e45a5a" textAnchor="middle" opacity="0">
        Dictando por voz
        <animate
          attributeName="opacity"
          values="0;0;0;0;1;1;0"
          keyTimes="0;0.55;0.65;0.68;0.7;0.95;1"
          dur="6s"
          repeatCount="indefinite"
        />
      </text>
    </SlideContainer>
  );
}

/** Slide 3 — Secciones: chips que se van marcando como completas. */
function SlideSections() {
  const sections = [
    { x: 20, label: "Contexto" },
    { x: 90, label: "Negocio" },
    { x: 160, label: "Branding" },
    { x: 230, label: "Servicios" },
  ];
  return (
    <SlideContainer>
      {/* Barra de progreso visual de fondo */}
      <rect x="20" y="40" width="280" height="2" fill="#1f3a3a" />
      <rect x="20" y="40" width="0" height="2" fill="#2dc4a0">
        <animate
          attributeName="width"
          values="0;0;70;140;210;280;280"
          keyTimes="0;0.1;0.3;0.5;0.7;0.85;1"
          dur="7s"
          repeatCount="indefinite"
        />
      </rect>

      {sections.map((s, i) => {
        const fillTime = 0.15 + i * 0.18; // cuándo cada chip se marca como completo
        return (
          <g key={s.label} transform={`translate(${s.x}, 28)`}>
            <circle
              cx="25"
              cy="14"
              r="10"
              fill="#0e1f1f"
              stroke="#1f3a3a"
              strokeWidth="1.5"
            >
              <animate
                attributeName="fill"
                values={`#0e1f1f;#0e1f1f;${"#0e1f1f;".repeat(Math.floor(fillTime * 10))}#2dc4a0;#2dc4a0`}
                keyTimes={`0;${fillTime - 0.02};${fillTime};${fillTime + 0.02};1`
                  .split(";")
                  .slice(0, 5)
                  .join(";")}
                dur="7s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="stroke"
                values={`#1f3a3a;#1f3a3a;#2dc4a0;#2dc4a0`}
                keyTimes={`0;${fillTime - 0.02};${fillTime + 0.02};1`}
                dur="7s"
                repeatCount="indefinite"
              />
            </circle>
            {/* Checkmark dentro del círculo (aparece cuando se completa) */}
            <path
              d="M 20 14 L 24 18 L 30 11"
              fill="none"
              stroke="#0a0a0a"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0"
            >
              <animate
                attributeName="opacity"
                values={`0;0;1;1`}
                keyTimes={`0;${fillTime};${fillTime + 0.02};1`}
                dur="7s"
                repeatCount="indefinite"
              />
            </path>
            <text
              x="25"
              y="50"
              fontSize="9"
              fill="#8aa0a0"
              textAnchor="middle"
              fontFamily="ui-sans-serif, system-ui"
            >
              {s.label}
            </text>
          </g>
        );
      })}

      {/* Label resumen */}
      <text
        x="160"
        y="105"
        fontSize="11"
        fill="#2dc4a0"
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui"
        opacity="0.9"
      >
        15 secciones · 20-30 minutos
      </text>
    </SlideContainer>
  );
}

/** Slide 4 — Pausar: botón pausa → guardado → reanudar. */
function SlidePause() {
  return (
    <SlideContainer>
      {/* Botón "Pausar" simulado (centro) */}
      <g transform="translate(120, 30)">
        <rect width="80" height="28" rx="8" fill="#0e1f1f" stroke="#1f3a3a">
          <animate
            attributeName="stroke"
            values="#1f3a3a;#1f3a3a;#2dc4a0;#2dc4a0;#1f3a3a"
            keyTimes="0;0.15;0.2;0.4;0.5"
            dur="6s"
            repeatCount="indefinite"
          />
        </rect>
        <text x="40" y="18" fontSize="11" fill="#ffffff" textAnchor="middle" fontFamily="ui-sans-serif, system-ui">
          ⏸ Pausar
        </text>
        {/* Click pulse */}
        <circle cx="40" cy="14" r="0" fill="none" stroke="#2dc4a0" strokeWidth="1.5" opacity="0">
          <animate attributeName="r" values="0;0;20;0;0" keyTimes="0;0.15;0.25;0.3;1" dur="6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0;0.8;0;0" keyTimes="0;0.15;0.18;0.3;1" dur="6s" repeatCount="indefinite" />
        </circle>
      </g>

      {/* Mensaje "Progreso guardado ✓" (aparece después del click) */}
      <g opacity="0">
        <rect x="60" y="70" width="200" height="28" rx="8" fill="#2dc4a0" opacity="0.15" stroke="#2dc4a0" />
        <text x="160" y="88" fontSize="11" fill="#2dc4a0" textAnchor="middle" fontFamily="ui-sans-serif, system-ui">
          ✓ Progreso guardado
        </text>
        <animate
          attributeName="opacity"
          values="0;0;0;1;1;0;0"
          keyTimes="0;0.3;0.35;0.45;0.7;0.8;1"
          dur="6s"
          repeatCount="indefinite"
        />
      </g>

      {/* Mensaje "Volvé cuando quieras" (al final) */}
      <text
        x="160"
        y="118"
        fontSize="11"
        fill="#8aa0a0"
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui"
        opacity="0"
      >
        Vuelve cuando quieras
        <animate
          attributeName="opacity"
          values="0;0;0;0;1;1;1"
          keyTimes="0;0.5;0.6;0.65;0.7;0.95;1"
          dur="6s"
          repeatCount="indefinite"
        />
      </text>
    </SlideContainer>
  );
}

/** Slide 5 — Cierre: checkmark grande + mensaje. */
function SlideDone() {
  return (
    <SlideContainer>
      {/* Círculo verde con checkmark animado */}
      <g transform="translate(160, 65)">
        <circle r="0" fill="#2dc4a0" opacity="0.2">
          <animate attributeName="r" values="0;30;30;30" keyTimes="0;0.3;0.95;1" dur="4s" repeatCount="indefinite" />
        </circle>
        <circle r="0" fill="none" stroke="#2dc4a0" strokeWidth="2">
          <animate attributeName="r" values="0;25;25;25" keyTimes="0;0.3;0.95;1" dur="4s" repeatCount="indefinite" />
        </circle>
        {/* Checkmark con stroke-dasharray para "dibujarse" */}
        <path
          d="M -10 0 L -3 8 L 12 -8"
          fill="none"
          stroke="#2dc4a0"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="40"
          strokeDashoffset="40"
        >
          <animate
            attributeName="stroke-dashoffset"
            values="40;40;0;0"
            keyTimes="0;0.35;0.55;1"
            dur="4s"
            repeatCount="indefinite"
          />
        </path>
      </g>

      {/* Mensaje */}
      <text
        x="160"
        y="120"
        fontSize="12"
        fill="#2dc4a0"
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui"
        fontWeight="bold"
        opacity="0"
      >
        ¡Entrevista completada!
        <animate
          attributeName="opacity"
          values="0;0;0;1;1;1"
          keyTimes="0;0.4;0.55;0.7;0.95;1"
          dur="4s"
          repeatCount="indefinite"
        />
      </text>
    </SlideContainer>
  );
}
