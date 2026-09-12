import type { LlmProvider } from "../provider";
import { createOpenAiCompatibleProvider } from "./openai-compatible-provider";

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const DEFAULT_MODEL = "deepseek-chat";

export interface DeepseekProviderConfig {
  apiKey: string;
  model?: string;
}

/**
 * DeepSeek expõe o mesmo protocolo Chat Completions da OpenAI, incluindo
 * `response_format: { type: "json_object" }` — por isso reaproveita o núcleo comum em vez de um
 * adaptador próprio. `name` continua sendo "deepseek": é o que aparece em `AppError.source` e na
 * chave de idempotência de HU-33, então os dois providers nunca compartilham cache.
 */
export function createDeepseekProvider(config: DeepseekProviderConfig): LlmProvider {
  return createOpenAiCompatibleProvider({
    name: "deepseek",
    apiUrl: DEEPSEEK_API_URL,
    apiKey: config.apiKey,
    model: config.model ?? DEFAULT_MODEL,
  });
}
