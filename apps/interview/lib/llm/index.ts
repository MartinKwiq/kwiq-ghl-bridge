import { ClaudeClient } from "./claude";
import { GeminiClient } from "./gemini";
import { OpenAIClient } from "./openai";
import type { LLMClient } from "./types";
import { getSetting } from "@/lib/settings";

export * from "./types";
export { GeminiClient, ClaudeClient, OpenAIClient };

/**
 * Factory sincrónica. Solo env vars / override.
 * Mantenida para callers legacy; preferí `getLLMClientAsync()`.
 */
export function getLLMClient(providerOverride?: string): LLMClient {
  const raw = (providerOverride ?? process.env.LLM_PROVIDER ?? "gemini").toLowerCase();
  switch (raw) {
    case "gemini":
      return new GeminiClient();
    case "claude":
    case "anthropic":
      return new ClaudeClient();
    case "openai":
    case "gpt":
      return new OpenAIClient();
    default:
      throw new Error(
        `LLM_PROVIDER="${raw}" no soportado. Valores válidos: gemini | claude | openai`,
      );
  }
}

/**
 * Factory async — resuelve provider + API key + modelo desde kwiq_settings
 * (configurable sin tocar código), con fallback a env vars.
 *
 * Orden de resolución:
 *   provider   → kwiq_settings.llm.provider → env.LLM_PROVIDER → "gemini"
 *   modelo     → kwiq_settings.llm.model    → env.GEMINI_MODEL → "gemini-2.5-flash"
 *   apiKey     → kwiq_settings.llm.gemini_api_key (si provider=gemini) →
 *                env.GEMINI_API_KEY
 */
export async function getLLMClientAsync(
  providerOverride?: string,
): Promise<LLMClient> {
  const providerFromDb = await getSetting("llm.provider");
  const raw = (
    providerOverride ??
    providerFromDb ??
    process.env.LLM_PROVIDER ??
    "gemini"
  ).toLowerCase();

  const modelFromDb = await getSetting("llm.model");

  switch (raw) {
    case "gemini": {
      const apiKey =
        (await getSetting("llm.gemini_api_key")) ?? process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error(
          "Falta la API key de Gemini. Cargala en /admin/ajustes → Gemini · API key.",
        );
      }
      const model = modelFromDb ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
      return new GeminiClient({ apiKey, model });
    }
    case "claude":
    case "anthropic":
      return new ClaudeClient();
    case "openai":
    case "gpt":
      return new OpenAIClient();
    default:
      throw new Error(
        `LLM_PROVIDER="${raw}" no soportado. Valores válidos: gemini | claude | openai`,
      );
  }
}
