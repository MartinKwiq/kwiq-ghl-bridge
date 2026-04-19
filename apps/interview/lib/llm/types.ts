/**
 * Tipos compartidos de la capa LLM.
 *
 * Esta capa es intencionalmente agnóstica del proveedor. `GeminiClient` es la
 * implementación inicial; `ClaudeClient` y `OpenAIClient` existen como stubs y
 * se prenden cambiando `LLM_PROVIDER` en el env (sin tocar el código de la app).
 */

/** Roles soportados en un turno de conversación. */
export type LLMRole = "system" | "user" | "assistant";

/** Un turno canónico (compatible con OpenAI/Anthropic/Gemini). */
export interface LLMMessage {
  role: LLMRole;
  content: string;
}

/** Opciones de generación. Subset intencional — todo lo que 3 proveedores soportan. */
export interface LLMGenerateOptions {
  /** Instrucciones de sistema (se mapean a `systemInstruction` en Gemini, `system` en Anthropic, role:"system" en OpenAI). */
  system?: string;
  /** Temperatura 0-1. */
  temperature?: number;
  /** Máximo de tokens en la respuesta. */
  maxOutputTokens?: number;
  /** Si está true, el provider debe emitir JSON válido parseable con JSON.parse. */
  jsonMode?: boolean;
  /** Schema JSON opcional para JSON structured output (Gemini `responseSchema`, Anthropic/OpenAI tool-use). */
  jsonSchema?: Record<string, unknown>;
  /** Señal de cancelación. */
  signal?: AbortSignal;
}

/** Resultado de una generación no-streaming. */
export interface LLMGenerateResult {
  text: string;
  /** Métricas opcionales (pueden venir null si el proveedor no las reporta). */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  /** Cadena de razón de terminación (stop | length | safety | tool_use | etc.). */
  finishReason?: string;
  /** Nombre lógico del modelo usado. */
  model: string;
}

/** Token emitido por el stream. */
export interface LLMStreamDelta {
  text: string;
  done: boolean;
  usage?: LLMGenerateResult["usage"];
  finishReason?: string;
}

/** Contrato del cliente LLM. */
export interface LLMClient {
  /** Nombre del proveedor (para logs/telemetría). */
  readonly provider: "gemini" | "claude" | "openai";
  /** Nombre del modelo configurado. */
  readonly model: string;

  /** Generación completa (espera fin de respuesta). */
  generate(messages: LLMMessage[], opts?: LLMGenerateOptions): Promise<LLMGenerateResult>;

  /** Generación en streaming (async iterator de deltas). */
  generateStream(
    messages: LLMMessage[],
    opts?: LLMGenerateOptions,
  ): AsyncIterable<LLMStreamDelta>;
}
