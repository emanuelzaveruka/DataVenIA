import { createCircuitBreaker } from "../errors/circuit-breaker";
import type { LlmProvider } from "./provider";
import { createAnthropicProvider } from "./providers/anthropic-provider";
import { createDeepseekProvider } from "./providers/deepseek-provider";
import { createOpenAiProvider } from "./providers/openai-provider";
import { createResilientLlmProvider } from "./resilient-llm-provider";

export const LLM_PROVIDER_NAMES = ["openai", "deepseek", "anthropic"] as const;
export type LlmProviderName = (typeof LLM_PROVIDER_NAMES)[number];

interface ProviderSlot {
  name: LlmProviderName;
  create: (env: NodeJS.ProcessEnv) => LlmProvider;
  isConfigured: (env: NodeJS.ProcessEnv) => boolean;
}

/**
 * Ordem de preferência quando nada é forçado por variável de ambiente. A lista também define quem
 * é o fallback de quem: o primeiro configurado é o primário, o segundo é o reserva.
 */
const PROVIDER_SLOTS: ProviderSlot[] = [
  {
    name: "openai",
    isConfigured: (env) => Boolean(env.OPENAI_API_KEY),
    create: (env) => createOpenAiProvider({ apiKey: env.OPENAI_API_KEY!, model: env.OPENAI_MODEL }),
  },
  {
    name: "deepseek",
    isConfigured: (env) => Boolean(env.DEEPSEEK_API_KEY),
    create: (env) => createDeepseekProvider({ apiKey: env.DEEPSEEK_API_KEY!, model: env.DEEPSEEK_MODEL }),
  },
  {
    name: "anthropic",
    isConfigured: (env) => Boolean(env.ANTHROPIC_API_KEY),
    create: (env) => createAnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY!, model: env.ANTHROPIC_MODEL }),
  },
];

function slotFor(name: LlmProviderName): ProviderSlot {
  return PROVIDER_SLOTS.find((slot) => slot.name === name)!;
}

function isProviderName(value: string | undefined): value is LlmProviderName {
  return LLM_PROVIDER_NAMES.includes(value as LlmProviderName);
}

/**
 * Único ponto de seleção de provider de LLM (§15).
 *
 * `LLM_PROVIDER` escolhe o primário e `LLM_FALLBACK_PROVIDER` o reserva; sem elas, a ordem de
 * `PROVIDER_SLOTS` decide entre os que tiverem chave configurada. Com dois providers disponíveis,
 * o retorno é um `createResilientLlmProvider` — indisponibilidade de um modelo não derruba a
 * análise, e a origem real de cada resposta fica em `metadata.source`, nunca silenciosa.
 *
 * Um provider nomeado explicitamente sem a chave correspondente é erro, não degradação: preferir
 * outro modelo em silêncio esconderia exatamente o problema que a pessoa quer ver.
 */
export function getLlmProvider(env: NodeJS.ProcessEnv = process.env): LlmProvider {
  const explicitPrimary = env.LLM_PROVIDER?.trim();
  const explicitFallback = env.LLM_FALLBACK_PROVIDER?.trim();

  for (const [variable, value] of [
    ["LLM_PROVIDER", explicitPrimary],
    ["LLM_FALLBACK_PROVIDER", explicitFallback],
  ] as const) {
    if (!value) continue;
    if (!isProviderName(value)) {
      throw new Error(`${variable}="${value}" é inválido. Valores aceitos: ${LLM_PROVIDER_NAMES.join(", ")}.`);
    }
    if (!slotFor(value).isConfigured(env)) {
      throw new Error(`${variable}=${value} requer a API key correspondente configurada.`);
    }
  }

  const available = PROVIDER_SLOTS.filter((slot) => slot.isConfigured(env));

  const primarySlot = isProviderName(explicitPrimary) ? slotFor(explicitPrimary) : available[0];
  if (!primarySlot) {
    throw new Error(
      `Nenhum provider de LLM configurado. Defina a API key de um destes: ${LLM_PROVIDER_NAMES.join(", ")}.`,
    );
  }

  const fallbackSlot = isProviderName(explicitFallback)
    ? slotFor(explicitFallback)
    : available.find((slot) => slot.name !== primarySlot.name);

  const primary = primarySlot.create(env);
  if (!fallbackSlot || fallbackSlot.name === primarySlot.name) return primary;

  return createResilientLlmProvider(primary, fallbackSlot.create(env), createCircuitBreaker());
}
