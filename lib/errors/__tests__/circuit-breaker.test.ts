import { describe, expect, it, vi } from "vitest";
import { createCircuitBreaker, type CircuitState } from "../circuit-breaker";

function fakeClock(startMs = 0) {
  let current = startMs;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe("createCircuitBreaker (HU-14)", () => {
  it("stays closed and keeps allowing attempts while under the failure threshold", () => {
    const breaker = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });

    breaker.onFailure(true);
    breaker.onFailure(true);

    expect(breaker.getState()).toBe("CLOSED");
    expect(breaker.canAttempt()).toBe(true);
  });

  it("opens after N consecutive retryable failures and fails fast until cooldown elapses", () => {
    const clock = fakeClock();
    const breaker = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 }, clock.now);

    breaker.onFailure(true);
    breaker.onFailure(true);
    breaker.onFailure(true);

    expect(breaker.getState()).toBe("OPEN");
    expect(breaker.canAttempt()).toBe(false);

    clock.advance(999);
    expect(breaker.canAttempt()).toBe(false);

    clock.advance(1);
    expect(breaker.canAttempt()).toBe(true);
    expect(breaker.getState()).toBe("HALF_OPEN");
  });

  it("does not count non-retryable failures toward the threshold", () => {
    const breaker = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 1000 });

    breaker.onFailure(false);
    breaker.onFailure(false);
    breaker.onFailure(false);

    expect(breaker.getState()).toBe("CLOSED");
  });

  it("closes and resets the failure counter on success after being half-open", () => {
    const clock = fakeClock();
    const breaker = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 1000 }, clock.now);

    breaker.onFailure(true);
    breaker.onFailure(true);
    expect(breaker.getState()).toBe("OPEN");

    clock.advance(1000);
    expect(breaker.canAttempt()).toBe(true);
    expect(breaker.getState()).toBe("HALF_OPEN");

    breaker.onSuccess();
    expect(breaker.getState()).toBe("CLOSED");

    // Counter was reset by onSuccess — a single failure alone (below threshold=2) must not reopen it.
    breaker.onFailure(true);
    expect(breaker.getState()).toBe("CLOSED");
  });

  it("reopens and restarts the cooldown when the half-open test call fails", () => {
    const clock = fakeClock();
    const breaker = createCircuitBreaker({ failureThreshold: 1, cooldownMs: 1000 }, clock.now);

    breaker.onFailure(true);
    clock.advance(1000);
    expect(breaker.canAttempt()).toBe(true);
    expect(breaker.getState()).toBe("HALF_OPEN");

    breaker.onFailure(true);
    expect(breaker.getState()).toBe("OPEN");
    expect(breaker.canAttempt()).toBe(false);

    clock.advance(999);
    expect(breaker.canAttempt()).toBe(false);
    clock.advance(1);
    expect(breaker.canAttempt()).toBe(true);
  });

  it("notifies onStateChange for observability (HU-14 validation)", () => {
    const clock = fakeClock();
    const onStateChange = vi.fn<(state: CircuitState) => void>();
    const breaker = createCircuitBreaker({ failureThreshold: 1, cooldownMs: 500, onStateChange }, clock.now);

    breaker.onFailure(true);
    clock.advance(500);
    breaker.canAttempt();
    breaker.onSuccess();

    expect(onStateChange.mock.calls.map((call) => call[0])).toEqual(["OPEN", "HALF_OPEN", "CLOSED"]);
  });
});
