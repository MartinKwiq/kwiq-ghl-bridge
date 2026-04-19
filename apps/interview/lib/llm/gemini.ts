import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
  type Content,
  type GenerationConfig,
  type GenerativeModel,
  type Part,
} from "@google/generative-ai";
import type {
  LLMClient,
  LLMGenerateOptions,
  LLMGenerateResult,
  LLMMessage,
  LLMStreamDelta,
} from "./types";

/**
 * Implementación del contrato LLMClient para Google Gemini.
 *
 * - Usa `@google/generative-ai` (SDK oficial).
 * - Modelo por defecto: `gemini-2.5-flash` (rápido y barato para slot-filling).
 * - `jsonMode` + `jsonSchema` se mapean a `responseMimeType="application/json"`
 *   y `responseSchema` respectivamente.
 * - Los filtros de safety se bajan a BLOCK_NONE porque la entrevista puede
 *   tocar industria/productos “controversiales” (inmobiliaria, legal, salud).
 *   Seguimos sin generar contenido peligroso — es para no bloquear nombres
 *   de productos o descripciones de negocio por falsos positivos.
 */
export class GeminiClient implements LLMClient {
  readonly provider = "gemini" as const;
  readonly model: string;
  private client: GoogleGenerativeAI;

  constructor(opts?: { apiKey?: string; model?: string }) {
    const apiKey = opts?.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY no está definida. Agregala a .env.local (ver .env.local.example).",
      );
    }
    this.model = opts?.model ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generate(
    messages: LLMMessage[],
    opts?: LLMGenerateOptions,
  ): Promise<LLMGenerateResult> {
    const { model, contents } = this.buildRequest(messages, opts);
    const res = await model.generateContent({ contents });
    const candidate = res.response;
    const text = candidate.text();
    const usage = candidate.usageMetadata;
    return {
      text,
      model: this.model,
      finishReason: candidate.candidates?.[0]?.finishReason,
      usage: {
        inputTokens: usage?.promptTokenCount,
        outputTokens: usage?.candidatesTokenCount,
      },
    };
  }

  async *generateStream(
    messages: LLMMessage[],
    opts?: LLMGenerateOptions,
  ): AsyncIterable<LLMStreamDelta> {
    const { model, contents } = this.buildRequest(messages, opts);
    const stream = await model.generateContentStream({ contents });
    let finalFinish: string | undefined;
    let finalUsage: LLMGenerateResult["usage"] | undefined;

    for await (const chunk of stream.stream) {
      const text = chunk.text();
      if (text) {
        yield { text, done: false };
      }
      const fr = chunk.candidates?.[0]?.finishReason;
      if (fr) finalFinish = fr;
      if (chunk.usageMetadata) {
        finalUsage = {
          inputTokens: chunk.usageMetadata.promptTokenCount,
          outputTokens: chunk.usageMetadata.candidatesTokenCount,
        };
      }
    }

    // Aggregated response por si el loop anterior no lo capturó (Gemini suele
    // emitir `usageMetadata` sólo en el último chunk).
    const aggregated = await stream.response;
    const agUsage = aggregated.usageMetadata;
    if (agUsage) {
      finalUsage = {
        inputTokens: agUsage.promptTokenCount,
        outputTokens: agUsage.candidatesTokenCount,
      };
    }
    if (!finalFinish) {
      finalFinish = aggregated.candidates?.[0]?.finishReason;
    }

    yield { text: "", done: true, usage: finalUsage, finishReason: finalFinish };
  }

  /** Arma el request uniforme para generate/generateStream. */
  private buildRequest(
    messages: LLMMessage[],
    opts?: LLMGenerateOptions,
  ): { model: GenerativeModel; contents: Content[] } {
    const { system, contents } = toGeminiContents(messages, opts?.system);

    const generationConfig: GenerationConfig = {
      temperature: opts?.temperature ?? 0.6,
      maxOutputTokens: opts?.maxOutputTokens ?? 2048,
      ...(opts?.jsonMode
        ? {
            responseMimeType: "application/json",
            ...(opts.jsonSchema
              ? { responseSchema: opts.jsonSchema as unknown as GenerationConfig["responseSchema"] }
              : {}),
          }
        : {}),
    };

    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: system ? { role: "system", parts: [{ text: system }] } : undefined,
      generationConfig,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    });

    return { model, contents };
  }
}

/**
 * Convierte los mensajes canónicos al formato de Gemini:
 * - `system` se extrae y va aparte a `systemInstruction`.
 * - `user`/`assistant` se mapean a Content[] con roles "user"/"model".
 * - Se coalescen `system` múltiples en uno (Gemini sólo acepta uno).
 */
function toGeminiContents(
  messages: LLMMessage[],
  extraSystem?: string,
): { system?: string; contents: Content[] } {
  const systems: string[] = [];
  const contents: Content[] = [];
  if (extraSystem) systems.push(extraSystem);

  for (const m of messages) {
    if (m.role === "system") {
      systems.push(m.content);
      continue;
    }
    const role = m.role === "assistant" ? "model" : "user";
    const parts: Part[] = [{ text: m.content }];
    // Gemini exige alternancia estricta user↔model. Si el último tiene el mismo rol,
    // fusionamos el texto.
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts.push(...parts);
    } else {
      contents.push({ role, parts });
    }
  }

  // Si no hay mensajes (edge case), agregamos un user vacío para evitar error.
  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: "" }] });
  }

  return {
    system: systems.length ? systems.join("\n\n") : undefined,
    contents,
  };
}
