import type { LlmProvider } from "../provider";
import { createOpenAiCompatibleProvider } from "./openai-compatible-provider";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";

export interface OpenAiProviderConfig {
  apiKey: string;
  model?: string;
  /**
   * Só chega à API em modelos de reasoning. O default `"minimal"` serve às etapas simples; etapas
   * com saída estruturada difícil (o cross-file, §3.8) pedem mais explicitamente.
   */
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
}

/**
 * Adaptador fino sobre a Chat Completions API da OpenAI via fetch puro (§15). A mecânica mora em
 * `openai-compatible-provider.ts`, compartilhada com o DeepSeek — aqui ficam só o host e o
 * modelo padrão.
 */
export function createOpenAiProvider(config: OpenAiProviderConfig): LlmProvider {
  const model = config.model ?? DEFAULT_MODEL;
  const isReasoningModel = model.startsWith("o1") || model.startsWith("o3") || model.startsWith("gpt-5");

  return createOpenAiCompatibleProvider({
    name: "openai",
    apiUrl: OPENAI_API_URL,
    apiKey: config.apiKey,
    model,
    maxTokensParameter: isReasoningModel ? "max_completion_tokens" : "max_tokens",
    reasoningEffort: isReasoningModel ? (config.reasoningEffort ?? "minimal") : undefined,
    // A OpenAI impõe o schema durante a geração; o DeepSeek, que compartilha este núcleo, não tem
    // o modo estrito e por isso fica no default `json_object`.
    structuredOutputMode: "json_schema",
  });
}
