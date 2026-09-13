import { LLM_CALL_TIMEOUT_MS } from "../../config/limits";
import { createAppError, type AppError } from "../../errors/app-error";

/**
 * Aborta a chamada por tempo de parede sem perder o cancelamento do usuário: os dois motivos
 * chegam ao `fetch` como um sinal só e são separados de novo no erro.
 */
export function callSignal(userSignal: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(LLM_CALL_TIMEOUT_MS);
  return userSignal ? AbortSignal.any([userSignal, timeout]) : timeout;
}

/**
 * Um `fetch` abortado tem dois significados opostos e, até aqui, um código só: `LLM_NETWORK_ERROR`
 * retryable. Cancelamento do usuário (aba fechada, botão de cancelar) retryable significava gastar
 * mais duas tentativas de modelo por uma resposta que ninguém vai ler; estouro de tempo, ao
 * contrário, é exatamente o caso em que tentar de novo faz sentido.
 */
export function abortAwareError(
  name: string,
  userSignal: AbortSignal | undefined,
  cause: unknown,
): AppError {
  const message = cause instanceof Error ? cause.message : String(cause);

  if (userSignal?.aborted) {
    return createAppError({
      code: "LLM_CALL_CANCELLED",
      category: "INTERNAL",
      severity: "INFO",
      description: `${name} call was cancelled by the caller: ${message}`,
      isRetryable: false,
      source: name,
      operation: "generateStructured",
    });
  }

  if (cause instanceof Error && cause.name === "TimeoutError") {
    return createAppError({
      code: "LLM_CALL_TIMEOUT",
      category: "TIMEOUT",
      severity: "ERROR",
      description: `${name} call exceeded ${LLM_CALL_TIMEOUT_MS}ms without a response`,
      userMessage: "Uma chamada ao modelo demorou mais do que o limite e foi interrompida.",
      isRetryable: true,
      source: name,
      operation: "generateStructured",
      metadata: { timeoutMs: LLM_CALL_TIMEOUT_MS },
    });
  }

  return createAppError({
    code: "LLM_NETWORK_ERROR",
    category: "NETWORK",
    severity: "ERROR",
    description: `Failed to reach ${name} API: ${message}`,
    isRetryable: true,
    source: name,
    operation: "generateStructured",
  });
}
