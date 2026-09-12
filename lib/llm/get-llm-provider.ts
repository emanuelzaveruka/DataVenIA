import type { LlmProvider } from "./provider";
import { createAnthropicProvider } from "./providers/anthropic-provider";
import { createOpenAiProvider } from "./providers/openai-provider";

export type LlmProviderName = "anthropic" | "openai";

/**
 * Único ponto de seleção de provider de LLM (§15). `LLM_PROVIDER` força a escolha; na ausência,
 * cai para o primeiro provider cuja API key esteja configurada.
 */
export function getLlmProvider(env: NodeJS.ProcessEnv = process.env): LlmProvider {
  const explicit = env.LLM_PROVIDER as LlmProviderName | undefined;
  const providerName: LlmProviderName | undefined =
    explicit ?? (env.ANTHROPIC_API_KEY ? "anthropic" : env.OPENAI_API_KEY ? "openai" : undefined);

  if (providerName === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error("LLM_PROVIDER=anthropic requer ANTHROPIC_API_KEY configurada.");
    }
    return createAnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL });
  }

  if (providerName === "openai") {
    if (!env.OPENAI_API_KEY) {
      throw new Error("LLM_PROVIDER=openai requer OPENAI_API_KEY configurada.");
    }
    return createOpenAiProvider({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL });
  }

  throw new Error(
    "Nenhum provider de LLM configurado. Defina ANTHROPIC_API_KEY ou OPENAI_API_KEY (e, opcionalmente, LLM_PROVIDER).",
  );
}
