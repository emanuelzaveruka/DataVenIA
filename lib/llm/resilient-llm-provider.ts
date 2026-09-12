import type { CircuitBreaker } from "../errors/circuit-breaker";
import { toolFailure, type ToolResult } from "../errors/tool-result";
import type { GenerateStructuredParams, LlmProvider } from "./provider";

/**
 * Fallback entre dois modelos, com a mesma mecânica de `createResilientJurisprudenceProvider`
 * (HU-14/§11.4): qualquer falha do primário degrada para o secundário na mesma chamada, e falhas
 * retryable alimentam o circuit breaker, que passa a pular o primário enquanto aberto.
 *
 * Uma diferença deliberada em relação ao fallback de jurisprudência: falha de **saída estruturada
 * inválida** (`STRUCTURED_OUTPUT`) NÃO troca de modelo. Essa falha é do conteúdo gerado, não da
 * disponibilidade do provider, e §11.7/HU-20 já a tratam com retry-com-contexto-do-erro no mesmo
 * modelo (`generateStructuredWithRetry`). Trocar de provider aqui jogaria fora esse contexto e
 * gastaria a cota do secundário com um problema que o primário consegue corrigir na tentativa
 * seguinte.
 */
export function createResilientLlmProvider(
  primary: LlmProvider,
  fallback: LlmProvider,
  breaker: CircuitBreaker,
): LlmProvider {
  return {
    name: `resilient(${primary.name}+${fallback.name})`,
    // A identidade do modelo primário é o que entra na chave de idempotência de HU-33. Uma
    // resposta servida pelo fallback é registrada com a identidade dele via `metadata.source`.
    model: primary.model,

    async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<ToolResult<T>> {
      if (breaker.canAttempt()) {
        const primaryResult = await primary.generateStructured(params);

        if (!primaryResult.isError) {
          breaker.onSuccess();
          return { ...primaryResult, metadata: { ...primaryResult.metadata, source: primary.name } };
        }

        if (primaryResult.error.category === "STRUCTURED_OUTPUT") return primaryResult;

        breaker.onFailure(primaryResult.error.isRetryable);
      }

      const fallbackResult = await fallback.generateStructured(params);
      if (fallbackResult.isError) return toolFailure(fallbackResult.error);

      // Nunca silencioso (§5/§11): quem consome sabe qual modelo respondeu de fato.
      return { ...fallbackResult, metadata: { ...fallbackResult.metadata, source: fallback.name } };
    },
  };
}
