import type { ErrorCategory } from "./app-error";

const RETRYABLE_HTTP_STATUS = new Set([429, 502, 503, 504]);
const NON_RETRYABLE_HTTP_STATUS = new Set([400, 401, 403]);

const RETRYABLE_CATEGORIES: ReadonlySet<ErrorCategory> = new Set([
  "TIMEOUT",
  "RATE_LIMIT",
  "NETWORK",
  "UPSTREAM",
  "STRUCTURED_OUTPUT",
]);

export interface ClassifyErrorInput {
  category: ErrorCategory;
  httpStatus?: number;
}

/**
 * isRetryable é decidido aqui, na classificação — nunca deixado a critério do
 * agente/modelo em tempo de execução (§11.3).
 */
export function isRetryable({ category, httpStatus }: ClassifyErrorInput): boolean {
  if (httpStatus !== undefined) {
    if (NON_RETRYABLE_HTTP_STATUS.has(httpStatus)) return false;
    if (RETRYABLE_HTTP_STATUS.has(httpStatus)) return true;
  }
  return RETRYABLE_CATEGORIES.has(category);
}
