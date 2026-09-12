export interface RetryPolicyConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicyConfig = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
};

/**
 * attempt começa em 0 (primeira tentativa). Um Retry-After explícito da fonte
 * sempre tem prioridade sobre o backoff calculado (§11.4).
 */
export function computeBackoffDelayMs(
  attempt: number,
  policy: RetryPolicyConfig = DEFAULT_RETRY_POLICY,
  retryAfterMs?: number,
): number {
  if (retryAfterMs !== undefined) return retryAfterMs;
  const exponential = Math.min(
    policy.baseDelayMs * 2 ** attempt,
    policy.maxDelayMs,
  );
  const jitterFactor = 0.8 + Math.random() * 0.4;
  return Math.round(exponential * jitterFactor);
}
