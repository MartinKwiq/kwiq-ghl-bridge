"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Botón de dictado por micrófono usando la Web Speech API nativa del navegador.
 *
 *  - Soportado en Chrome, Edge y Safari. No en Firefox.
 *  - Cero costos extra (no usa Whisper/OpenAI). Latencia muy baja porque
 *    corre en el navegador.
 *  - Idioma fijo en español ("es-ES" funciona bien para todas las variantes
 *    de español latinoamericano).
 *
 * UX:
 *  - Click → empieza a escuchar. La transcripción va apareciendo en vivo
 *    en el textarea vía `onTranscript`.
 *  - Click de nuevo → para de escuchar.
 *  - Si el navegador no soporta SpeechRecognition, el botón se oculta
 *    (en vez de mostrar un botón roto).
 *  - Si el user no da permisos de mic, mostramos un tooltip-error pero
 *    el chat sigue funcionando con teclado.
 */

// Tipos mínimos del browser API que no vienen en los .d.ts default de TS.
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function VoiceInputButton({
  onTranscript,
  onError,
  disabled,
  language = "es-ES",
}: {
  /** Cada vez que llega texto nuevo (parcial o final), se llama acá. El
   *  parent acumula y actualiza el textarea. */
  onTranscript: (text: string, isFinal: boolean) => void;
  onError?: (msg: string) => void;
  disabled?: boolean;
  /** Por default español genérico ("es-ES" sirve para todas las variantes). */
  language?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const Ctor = getSpeechRecognitionCtor();
    setSupported(!!Ctor);
  }, []);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* noop */
    }
  }, []);

  /**
   * Pide permiso de micrófono explícitamente vía getUserMedia ANTES de
   * arrancar SpeechRecognition. Sin este paso, algunos navegadores
   * Chromium no-Chrome (Opera, Brave, Vivaldi) no muestran el prompt
   * nativo de permisos cuando SpeechRecognition.start() pide acceso al
   * mic, y el dictado falla silencioso.
   *
   * Chrome / Edge funcionan sin este paso porque ellos sí piden el
   * permiso automáticamente al llamar a start(). Pero pedirlo dos veces
   * no rompe nada — el browser sólo muestra el prompt la primera vez.
   */
  const ensureMicPermission = useCallback(async (): Promise<boolean> => {
    // navigator.mediaDevices puede no existir en HTTP (solo HTTPS o localhost).
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      onError?.(
        "Tu navegador no permite usar el micrófono en este sitio. Probá con Chrome o Edge, o accedé desde un dominio con HTTPS.",
      );
      return false;
    }
    try {
      // Solo necesitamos la stream para disparar el prompt — la cerramos
      // inmediatamente y dejamos que SpeechRecognition use su propio canal.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        onError?.(
          "Bloqueaste el micrófono para este sitio. Activá los permisos del navegador (ícono de candado o cámara en la barra de URL) y probá de nuevo.",
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        onError?.(
          "No detectamos micrófono en tu dispositivo. Conectá uno y probá de nuevo.",
        );
      } else {
        onError?.(
          "No pudimos acceder al micrófono. Verificá los permisos del navegador y probá de nuevo.",
        );
      }
      return false;
    }
  }, [onError]);

  const start = useCallback(async () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    // Forzar el prompt de permisos antes de SpeechRecognition.start().
    // Es lo que destraba el flow en Opera/Brave/Vivaldi.
    const granted = await ensureMicPermission();
    if (!granted) return;

    const recog = new Ctor();
    recog.lang = language;
    recog.continuous = true; // sigue escuchando hasta que el user clickee stop
    recog.interimResults = true;
    recog.maxAlternatives = 1;

    recog.onstart = () => setListening(true);
    recog.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recog.onerror = (ev) => {
      setListening(false);
      const code = ev.error || "unknown";
      // Mapeo a copy amable. Los códigos vienen del spec W3C.
      const msg =
        code === "not-allowed" || code === "service-not-allowed"
          ? "No diste permiso al micrófono. Activá los permisos del navegador y probá de nuevo."
          : code === "no-speech"
            ? "No te escuché. Probá de nuevo más cerca del micrófono."
            : code === "audio-capture"
              ? "No pude usar el micrófono. ¿Hay otro programa usándolo?"
              : code === "network"
                ? "El dictado por voz necesita conexión a los servidores de Google y algo lo está bloqueando. Probables causas: VPN activo, escudos del navegador (Brave Shields), o bloqueo de DNS. Probá desactivar el VPN/escudos, o usar Chrome puro. Mientras tanto podés seguir escribiendo a mano."
                : "El dictado se cortó. Probá de nuevo o seguí escribiendo.";
      onError?.(msg);
    };
    recog.onresult = (ev) => {
      // Concatenamos todo lo que viene desde resultIndex para el turno
      // actual. La librería emite parciales y, cuando hay pausa, marca
      // isFinal=true en el último result.
      let finalText = "";
      let interimText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (!r) continue;
        const txt = r[0]?.transcript ?? "";
        if (r.isFinal) finalText += txt;
        else interimText += txt;
      }
      if (finalText) onTranscript(finalText, true);
      if (interimText) onTranscript(interimText, false);
    };

    recognitionRef.current = recog;
    try {
      recog.start();
    } catch {
      // Si se llama start() dos veces rápido (doble click), el browser
      // lanza InvalidStateError. Lo ignoramos — el ciclo onstart/onend
      // ya está activo.
    }
  }, [language, onTranscript, onError]);

  useEffect(() => {
    return () => {
      // Cleanup al desmontar: cancelamos cualquier sesión activa.
      try {
        recognitionRef.current?.abort();
      } catch {
        /* noop */
      }
    };
  }, []);

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={() => {
        if (listening) {
          stop();
        } else {
          void start();
        }
      }}
      disabled={disabled}
      title={
        listening
          ? "Tocá para parar el dictado"
          : "Dictar por micrófono (en español)"
      }
      aria-label={listening ? "Detener dictado" : "Iniciar dictado por voz"}
      aria-pressed={listening}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-lg transition",
        listening
          ? "border-kwiq-err/60 bg-kwiq-err/10 text-kwiq-err animate-pulse"
          : "border-kwiq-border bg-kwiq-bg/60 text-kwiq-muted hover:border-kwiq-accent hover:text-kwiq-accent",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {/* Ícono mic — SVG inline para no agregar dependencia */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    </button>
  );
}
