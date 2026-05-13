"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Modal-tutorial para el botón de micrófono.
 *
 * Aparece automáticamente la primera vez que el cliente abre la entrevista
 * (controlado por localStorage). También se puede reabrir clickeando el
 * botón "?" al lado del mic.
 *
 * El tutorial muestra una animación SVG en loop infinito que demuestra:
 *   1. Cursor sobre el botón mic.
 *   2. Click → mic se pone rojo, aparecen ondas de sonido.
 *   3. Texto se va escribiendo letra por letra.
 *   4. Click de nuevo → mic vuelve a gris.
 *   5. Texto final aparece como burbuja de chat.
 *   6. Loop.
 *
 * Toda la animación es CSS + SVG inline (sin video, sin assets externos).
 * Se carga al instante y funciona offline.
 */

const STORAGE_KEY = "kwiq.mic_tutorial_seen.v1";

export function MicTutorialModal({
  /** Si true, se abre solo (sin necesidad de pasar `open`). Usar la primera
   *  vez automáticamente. */
  autoOpenOnFirstVisit = false,
  /** Control externo para forzar apertura desde el botón "?". */
  open,
  onClose,
}: {
  autoOpenOnFirstVisit?: boolean;
  open?: boolean;
  onClose: () => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);

  // Auto-open la primera vez (chequeando localStorage).
  useEffect(() => {
    if (!autoOpenOnFirstVisit) return;
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (!seen) setInternalOpen(true);
    } catch {
      /* localStorage bloqueado — no rompemos el chat */
    }
  }, [autoOpenOnFirstVisit]);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Cómo usar el micrófono"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-kwiq-border bg-kwiq-panel p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-kwiq-text">
          Dictado por voz
        </h3>
        <p className="mt-2 text-sm text-kwiq-muted">
          También puedes responder hablando en lugar de escribir. Mira cómo
          funciona:
        </p>

        <MicTutorialAnimation />

        <ol className="mt-4 flex flex-col gap-2 text-sm text-kwiq-text">
          <li className="flex gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-kwiq-accent/40 bg-kwiq-accent/10 text-xs text-kwiq-accent">
              1
            </span>
            <span>
              Toca el ícono de <strong>micrófono</strong> al lado del campo
              de texto.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-kwiq-accent/40 bg-kwiq-accent/10 text-xs text-kwiq-accent">
              2
            </span>
            <span>
              El botón se pone <strong className="text-kwiq-err">rojo</strong>:
              está escuchando. Habla con normalidad.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-kwiq-accent/40 bg-kwiq-accent/10 text-xs text-kwiq-accent">
              3
            </span>
            <span>
              Cuando termines de hablar, toca el micrófono de nuevo. Tu
              respuesta aparece escrita en el campo lista para enviar.
            </span>
          </li>
        </ol>

        <p className="mt-4 text-xs text-kwiq-muted">
          La primera vez que uses el micrófono, el navegador te va a pedir
          permiso para acceder. Además, se descarga una vez el motor de voz
          (~80 MB). Después funciona instantáneo y sin conexión.
        </p>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg bg-kwiq-accent px-4 py-2 text-sm font-medium text-kwiq-bg hover:bg-kwiq-accentHover"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Animación SVG inline en loop infinito (~7 segundos). Sin librerías
 * externas, sin assets. Usa <animate> y <animateTransform> de SMIL —
 * soportado en todos los browsers modernos.
 *
 * Story:
 *   0.0s  Cursor llega al mic gris.
 *   1.0s  Cursor "clickea" → mic se pone rojo + ondas de sonido.
 *   1.5s  Texto empieza a tipearse en el campo.
 *   4.0s  Cursor vuelve al mic.
 *   4.5s  Click → mic gris + ondas desaparecen + texto queda en el campo.
 *   5.5s  Pausa con el texto visible.
 *   6.0s  Reset (todo se resetea al estado inicial).
 *   7.0s  Loop.
 */
function MicTutorialAnimation() {
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-kwiq-border bg-kwiq-bg/60">
      <svg
        viewBox="0 0 320 140"
        className="block w-full"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        {/* Fondo del "input" simulado */}
        <rect
          x="20"
          y="92"
          width="240"
          height="32"
          rx="8"
          fill="#0e1f1f"
          stroke="#1f3a3a"
        />

        {/* Texto que se tipea (con clip mask animado para revelar) */}
        <defs>
          <clipPath id="text-reveal">
            <rect x="32" y="98" width="0" height="20">
              <animate
                attributeName="width"
                values="0;0;0;220;220;220;0"
                keyTimes="0;0.14;0.21;0.55;0.78;0.85;1"
                dur="7s"
                repeatCount="indefinite"
                calcMode="linear"
              />
            </rect>
          </clipPath>
        </defs>
        <text
          x="32"
          y="112"
          fill="#ffffff"
          fontSize="13"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          clipPath="url(#text-reveal)"
        >
          Atendemos lunes a viernes de 9 a 18.
        </text>

        {/* MIC — círculo de fondo que cambia de color */}
        <g transform="translate(284, 108)">
          <circle r="16" fill="#0e1f1f" stroke="#1f3a3a" strokeWidth="1">
            <animate
              attributeName="fill"
              values="#0e1f1f;#0e1f1f;rgba(228,90,90,0.18);rgba(228,90,90,0.18);#0e1f1f;#0e1f1f"
              keyTimes="0;0.14;0.18;0.63;0.67;1"
              dur="7s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="stroke"
              values="#1f3a3a;#1f3a3a;#e45a5a;#e45a5a;#1f3a3a;#1f3a3a"
              keyTimes="0;0.14;0.18;0.63;0.67;1"
              dur="7s"
              repeatCount="indefinite"
            />
          </circle>

          {/* Ícono mic */}
          <g
            stroke="#8aa0a0"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          >
            <path d="M 0 -7 a 2.5 2.5 0 0 1 2.5 2.5 v 5 a 2.5 2.5 0 0 1 -5 0 v -5 a 2.5 2.5 0 0 1 2.5 -2.5 z" />
            <path d="M -4.5 -1 v 1 a 4.5 4.5 0 0 0 9 0 v -1" />
            <line x1="0" y1="3.5" x2="0" y2="6.5" />
            <line x1="-3" y1="6.5" x2="3" y2="6.5" />
            <animate
              attributeName="stroke"
              values="#8aa0a0;#8aa0a0;#e45a5a;#e45a5a;#8aa0a0;#8aa0a0"
              keyTimes="0;0.14;0.18;0.63;0.67;1"
              dur="7s"
              repeatCount="indefinite"
            />
          </g>

          {/* Ondas de sonido (3 anillos que se expanden cuando está rojo) */}
          {[0, 0.3, 0.6].map((delay) => (
            <circle
              key={delay}
              r="16"
              cx="0"
              cy="0"
              fill="none"
              stroke="#e45a5a"
              strokeWidth="1.5"
              opacity="0"
            >
              <animate
                attributeName="r"
                values="16;16;16;24;16;16;16"
                keyTimes={`0;${0.16 + delay * 0.02};${0.18 + delay * 0.02};${0.4 + delay * 0.02};${0.63};${0.67};1`}
                dur="7s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0;0;0.7;0;0;0;0"
                keyTimes={`0;${0.16 + delay * 0.02};${0.2 + delay * 0.02};${0.4 + delay * 0.02};${0.63};${0.67};1`}
                dur="7s"
                repeatCount="indefinite"
              />
            </circle>
          ))}
        </g>

        {/* CURSOR — flecha que se mueve y "clickea" */}
        <g>
          <animateTransform
            attributeName="transform"
            type="translate"
            values="60,40; 60,40; 280,100; 280,100; 280,100; 280,100; 280,100; 200,70; 60,40"
            keyTimes="0;0.05;0.14;0.18;0.55;0.63;0.7;0.85;1"
            dur="7s"
            repeatCount="indefinite"
            calcMode="spline"
            keySplines="0.25 0.1 0.25 1; 0.25 0.1 0.25 1; 0.25 0.1 0.25 1; 0.25 0.1 0.25 1; 0.25 0.1 0.25 1; 0.25 0.1 0.25 1; 0.25 0.1 0.25 1; 0.25 0.1 0.25 1"
          />
          <path
            d="M 0 0 L 0 14 L 4 11 L 7 17 L 9.5 16 L 6.5 10 L 11 10 Z"
            fill="#ffffff"
            stroke="#000000"
            strokeWidth="0.5"
          />
          {/* "Click" pulse ring */}
          <circle
            cx="2"
            cy="2"
            r="0"
            fill="none"
            stroke="#2dc4a0"
            strokeWidth="1.5"
            opacity="0"
          >
            <animate
              attributeName="r"
              values="0;0;0;12;0;0;0;12;0"
              keyTimes="0;0.13;0.135;0.18;0.19;0.62;0.625;0.67;1"
              dur="7s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0;0;0.8;0;0;0;0.8;0;0"
              keyTimes="0;0.13;0.135;0.18;0.19;0.62;0.625;0.67;1"
              dur="7s"
              repeatCount="indefinite"
            />
          </circle>
        </g>

        {/* Labels de pasos (aparecen sincronizados con la acción) */}
        <g fontFamily="ui-sans-serif, system-ui, sans-serif">
          {/* Paso 1 — "Click" */}
          <text x="160" y="30" fontSize="10" fill="#2dc4a0" textAnchor="middle" opacity="0">
            Toca el micrófono
            <animate
              attributeName="opacity"
              values="0;0;0;1;1;0;0;0;0;0"
              keyTimes="0;0.05;0.1;0.14;0.16;0.18;0.55;0.63;0.85;1"
              dur="7s"
              repeatCount="indefinite"
            />
          </text>
          {/* Paso 2 — "Habla" */}
          <text x="160" y="30" fontSize="10" fill="#e45a5a" textAnchor="middle" opacity="0">
            Escuchando… habla con normalidad
            <animate
              attributeName="opacity"
              values="0;0;0;0;1;1;0;0"
              keyTimes="0;0.18;0.2;0.22;0.24;0.55;0.63;1"
              dur="7s"
              repeatCount="indefinite"
            />
          </text>
          {/* Paso 3 — "Toca para parar" */}
          <text x="160" y="30" fontSize="10" fill="#2dc4a0" textAnchor="middle" opacity="0">
            Toca de nuevo para finalizar
            <animate
              attributeName="opacity"
              values="0;0;0;0;0;1;1;0;0"
              keyTimes="0;0.55;0.58;0.6;0.62;0.63;0.7;0.85;1"
              dur="7s"
              repeatCount="indefinite"
            />
          </text>
        </g>
      </svg>
    </div>
  );
}
