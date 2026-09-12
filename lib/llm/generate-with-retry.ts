import type { AppError } from "../errors/app-error";
import { isRetryable } from "../errors/error-classifier";
import { toolFailure, type ToolResult } from "../errors/tool-result";
import {
  computeBackoffDelayMs,
  DEFAULT_RETRY_POLICY,
  type RetryPolicyConfig,
} from "../errors/retry-policy";
import type { GenerateStructuredParams, LlmProvider } from "./provider";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reaproveita o erro da tentativa anterior como contexto explícito no prompt seguinte
 * (HU-07: "com os campos que falharam informados no retry seguinte").
 */
function withRetryFeedback<T>(
  params: GenerateStructuredParams<T>,
  previousError: AppError,
): GenerateStructuredParams<T> {
  return {
    ...params,
    prompt: `${params.prompt}

---
ATENÇÃO: a tentativa anterior de gerar "${params.schemaName}" falhou nesta validação: ${previousError.description}
Corrija exatamente esses pontos e gere a saída novamente, respeitando estritamente o schema.`,
  };
}

/**
 * Orquestra retry com backoff (§11.4) em torno de uma única chamada estrutural ao LlmProvider.
 * Só re-tenta categorias marcadas como retryable pelo classificador central — nunca decide isso
 * ad-hoc aqui (§11.3).
 */
export async function generateStructuredWithRetry<T>(
  provider: LlmProvider,
  params: GenerateStructuredParams<T>,
  policy: RetryPolicyConfig = DEFAULT_RETRY_POLICY,
): Promise<ToolResult<T>> {
  let lastError: AppError | undefined;

  for (let attempt = 0; attempt < policy.maxAttempts; attempt++) {
    const attemptParams = lastError ? withRetryFeedback(params, lastError) : params;
    const result = await provider.generateStructured(attemptParams);
    if (!result.isError) return result;

    lastError = result.error;
    const canRetry = isRetryable({ category: lastError.category }) && attempt < policy.maxAttempts - 1;
    if (!canRetry) return toolFailure(lastError);

    await sleep(computeBackoffDelayMs(attempt, policy, lastError.retryAfterMs));
  }

  return toolFailure(lastError!);
}
