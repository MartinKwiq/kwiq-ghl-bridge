import type {
  LLMClient,
  LLMGenerateOptions,
  LLMGenerateResult,
  LLMMessage,
  LLMStreamDelta,
} from "./types";

/**
 * STUB — Cliente OpenAI (GPT-4o / GPT-5).
 *
 * Se prende instalando `openai` (SDK oficial), seteando `OPENAI_API_KEY` y
 * `LLM_PROVIDER=openai`. La integración real se completará a demanda.
 */
export class OpenAIClient implements LLMClient {
  readonly provider = "openai" as const;
  readonly model: string;

  constructor(opts?: { apiKey?: string; model?: string }) {
    this.model = opts?.model ?? process.env.OPENAI_MODEL ?? "gpt-4o";
  }

  async generate(
    _messages: LLMMessage[],
    _opts?: LLMGenerateOptions,
  ): Promise<LLMGenerateResult> {
    throw new Error(
      "OpenAIClient no está habilitado. Instalá `openai` y completá la implementación.",
    );
  }

  async *generateStream(
    _messages: LLMMessage[],
    _opts?: LLMGenerateOptions,
  ): AsyncIterable<LLMStreamDelta> {
    throw new Error(
      "OpenAIClient no está habilitado. Instalá `openai` y completá la implementación.",
    );
    // eslint-disable-next-line no-unreachable
    yield { text: "", done: true };
  }
}
