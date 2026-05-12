"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Botón de dictado por micrófono UNIVERSAL.
 *
 * Por qué no usamos Web Speech API:
 *   - Chrome y Edge SÍ tienen los servidores de Google Speech embebidos.
 *   - Opera, Brave, Vivaldi: removieron esos servidores por privacidad
 *     → la API existe pero falla con `network error`.
 *   - Firefox: no implementa la API.
 *   - Safari: implementación limitada con bugs.
 *
 * Por qué usamos Whisper local (Hugging Face Transformers.js):
 *   - Es un port de OpenAI Whisper que corre 100% en el navegador del
 *     cliente usando WebAssembly + ONNX Runtime.
 *   - Cero dependencia de servidores externos: no llama a Google ni a
 *     OpenAI. El audio nunca sale del browser del cliente.
 *   - Funciona en TODOS los navegadores modernos (Firefox, Safari,
 *     Opera, Brave, Vivaldi, Chrome, Edge).
 *   - 100% gratis. No requiere API key.
 *
 * Trade-offs honestos:
 *   - Primera vez descarga el modelo (~80MB para whisper-base
 *     multilingual). El browser lo cachea para próximas veces.
 *   - Latencia: 1-2 segundos al transcribir frases cortas en CPU. Más
 *     con WebGPU (lo intentamos si está disponible). Aceptable para
 *     dictado dentro de la entrevista.
 *   - No es streaming: el cliente termina de hablar, suelta el botón,
 *     transcribimos, ponemos el texto en el input.
 *
 * Flow del usuario:
 *   1. Click en mic → pedimos permiso de mic (getUserMedia).
 *   2. MediaRecorder graba audio.
 *   3. Click de nuevo (o auto-stop al detectar silencio) → detenemos.
 *   4. Mostramos "Transcribiendo…" mientras Whisper procesa.
 *   5. Llenamos el textarea con el texto resultante.
 */

type State =
  | { kind: "idle" }
  | { kind: "loading_model"; progress?: number }
  | { kind: "recording" }
  | { kind: "transcribing" };

interface WhisperPipeline {
  (
    audio: Float32Array,
    options?: { language?: string; task?: string; chunk_length_s?: number },
  ): Promise<{ text: string } | Array<{ text: string }>>;
}

interface ProgressEvent {
  status: string;
  progress?: number;
  file?: string;
}

/**
 * Carga (o reutiliza) el pipeline de Whisper. Lo guardamos en un módulo
 * singleton para que entre navegaciones el modelo siga cargado en memoria.
 */
let pipelinePromise: Promise<WhisperPipeline> | null = null;

async function getWhisperPipeline(
  onProgress?: (pct: number) => void,
): Promise<WhisperPipeline> {
  if (pipelinePromise) return pipelinePromise;

  pipelinePromise = (async () => {
    // Import dinámico para no romper SSR (transformers usa APIs de browser).
    const { pipeline, env } = await import("@huggingface/transformers");

    // Asegurar que el modelo se descarga de Hugging Face Hub y se cachea
    // en el navegador del cliente (no en nuestro servidor).
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    // whisper-base: ~80MB, calidad muy buena para español. Si necesitamos
    // mejor calidad después, cambiar a Xenova/whisper-small (~250MB).
    const p = await pipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-base",
      {
        // Si el navegador soporta WebGPU lo usamos (Chrome 113+, Edge 113+).
        // Si no, cae a WASM automáticamente.
        device: typeof navigator !== "undefined" &&
          "gpu" in navigator
          ? "webgpu"
          : "wasm",
        progress_callback: (data: ProgressEvent) => {
          if (
            data.status === "progress" &&
            typeof data.progress === "number"
          ) {
            onProgress?.(data.progress);
          }
        },
      } as Record<string, unknown>,
    );

    return p as unknown as WhisperPipeline;
  })();

  try {
    return await pipelinePromise;
  } catch (err) {
    // Si falla la carga, resetear el singleton para reintentar después.
    pipelinePromise = null;
    throw err;
  }
}

export function VoiceInputButton({
  onTranscript,
  onError,
  disabled,
  language = "spanish",
}: {
  /** Recibe el texto transcripto final. Lo agregamos al input del chat. */
  onTranscript: (text: string, isFinal: boolean) => void;
  onError?: (msg: string) => void;
  disabled?: boolean;
  /** Idioma para Whisper. Default "spanish". También acepta "english", etc. */
  language?: string;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  /** Limpieza al desmontar. */
  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* noop */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  /**
   * Pide permiso de micrófono. Funciona en todos los browsers.
   */
  const ensureMicPermission =
    useCallback(async (): Promise<MediaStream | null> => {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        onError?.(
          "Tu navegador no permite usar el micrófono en este sitio. Prueba actualizar el navegador.",
        );
        return null;
      }
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          onError?.(
            "Bloqueaste el micrófono para este sitio. Activa los permisos del navegador (ícono de candado o cámara en la barra de URL) y prueba de nuevo.",
          );
        } else if (
          name === "NotFoundError" ||
          name === "DevicesNotFoundError"
        ) {
          onError?.(
            "No detectamos micrófono en tu dispositivo. Conecta uno y prueba de nuevo.",
          );
        } else {
          onError?.("No pudimos acceder al micrófono. Prueba de nuevo.");
        }
        return null;
      }
    }, [onError]);

  const startRecording = useCallback(async () => {
    // 1. Cargar el modelo de Whisper si no está cargado todavía.
    if (!pipelinePromise) {
      setState({ kind: "loading_model", progress: 0 });
      try {
        await getWhisperPipeline((pct) => {
          setState({ kind: "loading_model", progress: pct });
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onError?.(
          `No pudimos cargar el motor de voz: ${msg}. Prueba recargar la página, o sigue escribiendo a mano.`,
        );
        setState({ kind: "idle" });
        return;
      }
    }

    // 2. Pedir permiso de mic.
    const stream = await ensureMicPermission();
    if (!stream) {
      setState({ kind: "idle" });
      return;
    }
    streamRef.current = stream;

    // 3. Arrancar MediaRecorder.
    chunksRef.current = [];
    let mime = "audio/webm";
    if (
      typeof MediaRecorder !== "undefined" &&
      !MediaRecorder.isTypeSupported(mime)
    ) {
      // Safari usa audio/mp4
      if (MediaRecorder.isTypeSupported("audio/mp4")) mime = "audio/mp4";
      else mime = "";
    }
    const recorder = new MediaRecorder(
      stream,
      mime ? { mimeType: mime } : undefined,
    );
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      // Cerrar la stream del mic.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      chunksRef.current = [];

      if (blob.size < 1000) {
        // Audio prácticamente vacío — probablemente clickeo accidental.
        setState({ kind: "idle" });
        return;
      }

      setState({ kind: "transcribing" });
      try {
        const transcriber = await getWhisperPipeline();
        const audio = await blobToFloat32(blob);
        const result = await transcriber(audio, {
          language,
          task: "transcribe",
          chunk_length_s: 30,
        });
        const text = Array.isArray(result)
          ? result.map((r) => r.text).join(" ")
          : result.text;
        const trimmed = text.trim();
        if (trimmed) {
          onTranscript(trimmed, true);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onError?.(
          `No pudimos transcribir el audio: ${msg}. Prueba de nuevo, o sigue escribiendo a mano.`,
        );
      } finally {
        setState({ kind: "idle" });
      }
    };

    recorder.start();
    setState({ kind: "recording" });
  }, [ensureMicPermission, language, onError, onTranscript]);

  const stopRecording = useCallback(() => {
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      /* noop */
    }
  }, []);

  // Render según estado.
  const isBusy =
    state.kind === "loading_model" || state.kind === "transcribing";
  const isRecording = state.kind === "recording";
  const isDisabled = disabled || isBusy;

  // Tooltip / aria-label.
  const title =
    state.kind === "loading_model"
      ? `Cargando motor de voz… ${Math.round((state.progress ?? 0) * 100)}%`
      : state.kind === "recording"
        ? "Toca para parar el dictado"
        : state.kind === "transcribing"
          ? "Transcribiendo…"
          : "Dictar por micrófono";

  return (
    <button
      type="button"
      onClick={() => {
        if (isRecording) stopRecording();
        else if (!isBusy) void startRecording();
      }}
      disabled={isDisabled}
      title={title}
      aria-label={title}
      aria-pressed={isRecording}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-lg transition",
        isRecording &&
          "border-kwiq-err/60 bg-kwiq-err/10 text-kwiq-err animate-pulse",
        isBusy &&
          "border-kwiq-accent/40 bg-kwiq-accent/10 text-kwiq-accent",
        !isRecording &&
          !isBusy &&
          "border-kwiq-border bg-kwiq-bg/60 text-kwiq-muted hover:border-kwiq-accent hover:text-kwiq-accent",
        isDisabled && "cursor-not-allowed opacity-50",
      )}
    >
      {state.kind === "loading_model" ? (
        <span className="text-[10px] font-medium">
          {Math.round((state.progress ?? 0) * 100)}%
        </span>
      ) : state.kind === "transcribing" ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-spin"
          aria-hidden
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      ) : (
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
      )}
    </button>
  );
}

/**
 * Convierte un Blob de audio (webm/mp4/wav) a Float32Array mono a 16kHz,
 * que es el formato que espera Whisper. Decodificamos con AudioContext
 * (soportado en todos los browsers modernos).
 */
async function blobToFloat32(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext) as typeof AudioContext;
  const ctx = new AudioCtx({ sampleRate: 16000 });
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    // Mono: mezclamos canales si hay más de uno.
    if (audioBuffer.numberOfChannels === 1) {
      return audioBuffer.getChannelData(0);
    }
    const len = audioBuffer.length;
    const out = new Float32Array(len);
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    for (let i = 0; i < len; i++) {
      out[i] = (left[i]! + right[i]!) / 2;
    }
    return out;
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
