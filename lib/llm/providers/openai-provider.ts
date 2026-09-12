import type { LlmProvider } from "../provider";
import { createOpenAiCompatibleProvider } from "./openai-compatible-provider";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4.1";

export interface OpenAiProviderConfig {
  apiKey: string;
  model?: string;
}

/**
 * Adaptador fino sobre a Chat Completions API da OpenAI via fetch puro (§15). A mecânica mora em
 * `openai-compatible-provider.ts`, compartilhada com o DeepSeek — aqui ficam só o host e o
 * modelo padrão.
 */
export function createOpenAiProvider(config: OpenAiProviderConfig): LlmProvider {
  return createOpenAiCompatibleProvider({
    name: "openai",
    apiUrl: OPENAI_API_URL,
    apiKey: config.apiKey,
    model: config.model ?? DEFAULT_MODEL,
  });
}
