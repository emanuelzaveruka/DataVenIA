import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createResilientLlmProvider } from "../resilient-llm-provider";
import { createCircuitBreaker } from "../../errors/circuit-breaker";
import { createAppError, type ErrorCategory } from "../../errors/app-error";
import { toolFailure, toolSuccess } from "../../errors/tool-result";
import type { GenerateStructuredParams, LlmProvider } from "../provider";

const schema = z.object({ ok: z.boolean() });

const params: GenerateStructuredParams<{ ok: boolean }> = {
  system: "system",
  prompt: "prompt",
  schema,
  schemaName: "Fake",
};

function failing(name: string, category: ErrorCategory, isRetryable = true): LlmProvider {
  return {
    name,
    model: `${name}-model`,
    generateStructured: vi.fn(async () =>
      toolFailure(
        createAppError({
          code: `${name.toUpperCase()}_FAIL`,
          category,
          severity: "ERROR",
          description: `${name} failed`,
          isRetryable,
          source: name,
          operation: "generateStructured",
        }),
      ),
    ) as unknown as LlmProvider["generateStructured"],
  };
}

function succeeding(name: string): LlmProvider {
  return {
    name,
    model: `${name}-model`,
    generateStructured: vi.fn(async () => toolSuccess({ ok: true })) as unknown as LlmProvider["generateStructured"],
  };
}

describe("createResilientLlmProvider", () => {
  it("uses the primary and labels the response with its name", async () => {
    const primary = succeeding("openai");
    const fallback = succeeding("deepseek");

    const result = await createResilientLlmProvider(primary, fallback, createCircuitBreaker()).generateStructured(params);

    expect(result.isError).toBe(false);
    if (!result.isError) expect(result.metadata?.source).toBe("openai");
    expect(fallback.generateStructured).not.toHaveBeenCalled();
  });

  it("degrades to the second model in the same call when the primary is unavailable", async () => {
    const primary = failing("openai", "UPSTREAM");
    const fallback = succeeding("deepseek");

    const result = await createResilientLlmProvider(primary, fallback, createCircuitBreaker()).generateStructured(params);

    expect(result.isError).toBe(false);
    if (!result.isError) expect(result.metadata?.source).toBe("deepseek");
  });

  it("does not switch models on invalid structured output — that is retried in place (§11.7/HU-20)", async () => {
    const primary = failing("openai", "STRUCTURED_OUTPUT");
    const fallback = succeeding("deepseek");

    const result = await createResilientLlmProvider(primary, fallback, createCircuitBreaker()).generateStructured(params);

    expect(result.isError).toBe(true);
    expect(fallback.generateStructured).not.toHaveBeenCalled();
  });

  it("stops calling the primary once the circuit opens, going straight to the fallback (HU-14)", async () => {
    const primary = failing("openai", "UPSTREAM");
    const fallback = succeeding("deepseek");
    const breaker = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 60_000 });
    const provider = createResilientLlmProvider(primary, fallback, breaker);

    await provider.generateStructured(params);
    await provider.generateStructured(params);
    expect(breaker.getState()).toBe("OPEN");

    await provider.generateStructured(params);

    expect(primary.generateStructured).toHaveBeenCalledTimes(2);
    expect(fallback.generateStructured).toHaveBeenCalledTimes(3);
  });

  it("returns the fallback error when both models fail — never a fabricated success", async () => {
    const provider = createResilientLlmProvider(
      failing("openai", "UPSTREAM"),
      failing("deepseek", "RATE_LIMIT"),
      createCircuitBreaker(),
    );

    const result = await provider.generateStructured(params);

    expect(result.isError).toBe(true);
    if (result.isError) expect(result.error.code).toBe("DEEPSEEK_FAIL");
  });

  it("keeps the primary model identity, which is what feeds the HU-33 idempotency key", () => {
    const provider = createResilientLlmProvider(succeeding("openai"), succeeding("deepseek"), createCircuitBreaker());
    expect(provider.model).toBe("openai-model");
  });
});
