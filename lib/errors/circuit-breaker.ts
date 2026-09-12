export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  /** Falhas consecutivas classificadas como retryable até o circuito abrir. */
  failureThreshold: number;
  /** Tempo de espera antes de permitir uma chamada de teste (meio-aberto). */
  cooldownMs: number;
  /** Chamado a cada transição de estado — ponto de extensão para observabilidade (§11.9, Fase 8). */
  onStateChange?: (state: CircuitState) => void;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: Omit<CircuitBreakerConfig, "onStateChange"> = {
  failureThreshold: 3,
  cooldownMs: 30_000,
};

export interface CircuitBreaker {
  getState(): CircuitState;
  /** true se uma chamada real pode ser tentada agora (fechado, ou aberto após o cooldown — meio-aberto). */
  canAttempt(): boolean;
  onSuccess(): void;
  onFailure(isRetryableFailure: boolean): void;
}

/**
 * Circuit breaker (HU-14, contexto-geral.md §11.4). Abre após `failureThreshold` falhas
 * consecutivas classificadas como retryable vindas da mesma fonte; enquanto aberto, chamadas
 * falham rápido (`canAttempt()` retorna false) até o `cooldownMs` decorrer, quando uma única
 * chamada de teste é permitida (meio-aberto). Sucesso fecha o circuito; falha no teste reabre e
 * reinicia o cooldown.
 */
export function createCircuitBreaker(
  config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG,
  now: () => number = Date.now,
): CircuitBreaker {
  let state: CircuitState = "CLOSED";
  let consecutiveFailures = 0;
  let openedAt: number | null = null;

  function transitionTo(next: CircuitState): void {
    if (state === next) return;
    state = next;
    config.onStateChange?.(next);
  }

  function canAttempt(): boolean {
    if (state !== "OPEN") return true;
    if (openedAt !== null && now() - openedAt >= config.cooldownMs) {
      transitionTo("HALF_OPEN");
      return true;
    }
    return false;
  }

  function onSuccess(): void {
    consecutiveFailures = 0;
    openedAt = null;
    transitionTo("CLOSED");
  }

  function onFailure(isRetryableFailure: boolean): void {
    if (state === "HALF_OPEN") {
      openedAt = now();
      transitionTo("OPEN");
      return;
    }

    if (!isRetryableFailure) return;

    consecutiveFailures += 1;
    if (consecutiveFailures >= config.failureThreshold) {
      openedAt = now();
      transitionTo("OPEN");
    }
  }

  return { getState: () => state, canAttempt, onSuccess, onFailure };
}
