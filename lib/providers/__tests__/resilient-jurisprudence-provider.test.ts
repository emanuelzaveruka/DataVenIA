import { describe, expect, it, vi } from "vitest";
import { createResilientJurisprudenceProvider } from "../resilient-jurisprudence-provider";
import { createFixtureProvider } from "../fixture";
import { createCircuitBreaker } from "../../errors/circuit-breaker";
import { createAppError } from "../../errors/app-error";
import { toolFailure, toolSuccess, type ToolResult } from "../../errors/tool-result";
import type { JurisprudenceProvider } from "../jurisprudence-provider";
import type { JurisprudenceSearchResult, RawDecision } from "../../schemas/search.schema";

function upstreamError(isRetryable: boolean) {
  return createAppError({
    code: "TJPR_UNAVAILABLE",
    category: isRetryable ? "UPSTREAM" : "NOT_FOUND",
    severity: "ERROR",
    description: "Simulated upstream failure",
    isRetryable,
    operation: "fakePrimary.search",
  });
}

function fakePrimary(searchImpl: () => Promise<ToolResult<JurisprudenceSearchResult>>): JurisprudenceProvider {
  return {
    name: "tjpr",
    search: vi.fn(searchImpl),
    fetchDecision: vi.fn(async (): Promise<ToolResult<RawDecision>> =>
      toolFailure(upstreamError(true)),
    ),
  };
}

describe("createResilientJurisprudenceProvider (HU-12 fallback + HU-14 circuit breaker)", () => {
  it("returns the primary's result on success without touching the fallback", async () => {
    const primaryResult: JurisprudenceSearchResult = { items: [], totalCount: 0 };
    const primary = fakePrimary(async () => toolSuccess(primaryResult, { source: "tjpr" }));
    const fallback = createFixtureProvider();
    const breaker = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
    const provider = createResilientJurisprudenceProvider(primary, fallback, breaker);

    const result = await provider.search({ query: "plano de saúde" });

    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.metadata?.source).toBe("tjpr");
    }
    expect(primary.search).toHaveBeenCalledTimes(1);
  });

  it("falls back to fixture visibly (metadata.source) when the primary fails, without silent degradation", async () => {
    const primary = fakePrimary(async () => toolFailure(upstreamError(true)));
    const fallback = createFixtureProvider();
    const breaker = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
    const provider = createResilientJurisprudenceProvider(primary, fallback, breaker);

    const result = await provider.search({ query: "plano de saúde" });

    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.metadata?.source).toBe("fixture");
      expect(result.data.items.length).toBeGreaterThan(0);
    }
  });

  it("opens the circuit after N consecutive retryable failures and then skips the primary entirely", async () => {
    const primary = fakePrimary(async () => toolFailure(upstreamError(true)));
    const fallback = createFixtureProvider();
    const breaker = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 1000 });
    const provider = createResilientJurisprudenceProvider(primary, fallback, breaker);

    await provider.search({ query: "a" });
    await provider.search({ query: "b" });
    expect(breaker.getState()).toBe("OPEN");

    await provider.search({ query: "c" });

    // Primary called only twice (the two failures that opened the circuit); the third call
    // skipped it entirely because canAttempt() was false.
    expect(primary.search).toHaveBeenCalledTimes(2);
  });

  it("does not open the circuit on a non-retryable failure, but still falls back for that call", async () => {
    const primary = fakePrimary(async () => toolFailure(upstreamError(false)));
    const fallback = createFixtureProvider();
    const breaker = createCircuitBreaker({ failureThreshold: 1, cooldownMs: 1000 });
    const provider = createResilientJurisprudenceProvider(primary, fallback, breaker);

    const result = await provider.search({ query: "plano de saúde" });

    expect(breaker.getState()).toBe("CLOSED");
    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.metadata?.source).toBe("fixture");
    }
  });
});
