import type {
  LLMClient,
  LLMGenerateOptions,
  LLMGenerateResult,
  LLMMessage,
  LLMStreamDelta,
} from "./types";

/**
 * STUB — Cliente Anthropic Claude.
 *
 * Se prende instalando `@anthropic-ai/sdk`, seteando `ANTHROPIC_API_KEY` y
 * `LLM_PROVIDER=claude`. La integración real se completará cuando Martín
 * provea la key; el contrato ya está listo para el swap.
 */
export class ClaudeClient implements LLMClient {
  readonly provider = "claude" as const;
  readonly model: string;

  constructor(opts?: { apiKey?: string; model?: string }) {
    this.model = opts?.model ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
    // no hacemos el import real acá para que el bundle no incluya el SDK hasta
    // que se habilite el proveedor.
  }

  async generate(
    _messages: LLMMessage[],
    _opts?: LLMGenerateOptions,
  ): Promise<LLMGenerateResult> {
    throw new Error(
      "ClaudeClient no está habilitado. Instalá @anthropic-ai/sdk y completá la implementación.",
    );
  }

  async *generateStream(
    _messages: LLMMessage[],
    _opts?: LLMGenerateOptions,
  ): AsyncIterable<LLMStreamDelta> {
    throw new Error(
      "ClaudeClient no está habilitado. Instalá @anthropic-ai/sdk y completá la implementación.",
    );
    // eslint-disable-next-line no-unreachable
    yield { text: "", done: true };
  }
}
