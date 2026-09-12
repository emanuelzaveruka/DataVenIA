import type { ToolResult } from "../errors/tool-result";
import type { CircuitBreaker } from "../errors/circuit-breaker";
import type { JurisprudenceQuery, JurisprudenceSearchResult, RawDecision } from "../schemas/search.schema";
import type { JurisprudenceProvider } from "./jurisprudence-provider";

async function callWithFallback<T>(
  breaker: CircuitBreaker,
  callPrimary: () => Promise<ToolResult<T>>,
  callFallback: () => Promise<ToolResult<T>>,
): Promise<ToolResult<T>> {
  if (!breaker.canAttempt()) {
    return callFallback();
  }

  const primaryResult = await callPrimary();
  if (!primaryResult.isError) {
    breaker.onSuccess();
    return primaryResult;
  }

  breaker.onFailure(primaryResult.error.isRetryable);
  return callFallback();
}

/**
 * Combina HU-14 (circuit breaker) e a regra de fallback de HU-12/HU-37: qualquer falha do
 * provider primário (ex.: `TjprProvider` real, quando existir — Fase 9) degrada para `fallback`
 * (`FixtureProvider`) na mesma chamada; falhas retryable também alimentam o circuit breaker, que
 * passa a pular o primário inteiramente enquanto aberto (`canAttempt() === false`). A origem real
 * de cada resposta fica sempre em `metadata.source` — nunca uma degradação silenciosa (§5, §11).
 */
export function createResilientJurisprudenceProvider(
  primary: JurisprudenceProvider,
  fallback: JurisprudenceProvider,
  breaker: CircuitBreaker,
): JurisprudenceProvider {
  return {
    name: `resilient(${primary.name}+${fallback.name})`,

    search(query: JurisprudenceQuery): Promise<ToolResult<JurisprudenceSearchResult>> {
      return callWithFallback(
        breaker,
        () => primary.search(query),
        () => fallback.search(query),
      );
    },

    fetchDecision(decisionId: string): Promise<ToolResult<RawDecision>> {
      return callWithFallback(
        breaker,
        () => primary.fetchDecision(decisionId),
        () => fallback.fetchDecision(decisionId),
      );
    },
  };
}
