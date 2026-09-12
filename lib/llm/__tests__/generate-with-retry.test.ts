import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { generateStructuredWithRetry } from "../generate-with-retry";
import { parseStructuredOutput } from "../validate-structured-output";
import type { GenerateStructuredParams, LlmProvider } from "../provider";

const schema = z.object({ value: z.string().min(1) });

function fakeProviderFromRawResponses(rawResponses: unknown[]): LlmProvider {
  let index = 0;
  const generateStructured = vi.fn(async (params: GenerateStructuredParams<unknown>) => {
    const raw = rawResponses[index];
    index += 1;
    return parseStructuredOutput(params.schema, params.schemaName, raw, "fake");
  }) as unknown as LlmProvider["generateStructured"];

  return { name: "fake", model: "fake-model", generateStructured };
}

describe("generateStructuredWithRetry", () => {
  it("returns success on the first attempt without retrying", async () => {
    const provider = fakeProviderFromRawResponses([{ value: "ok" }]);

    const result = await generateStructuredWithRetry(provider, {
      system: "sys",
      prompt: "prompt",
      schema,
      schemaName: "Test",
    });

    expect(result.isError).toBe(false);
    expect(provider.generateStructured).toHaveBeenCalledTimes(1);
  });

  it("retries a STRUCTURED_OUTPUT failure with the previous error as feedback, then succeeds", async () => {
    const provider = fakeProviderFromRawResponses([{ value: "" }, { value: "ok" }]);

    const result = await generateStructuredWithRetry(
      provider,
      { system: "sys", prompt: "original prompt", schema, schemaName: "Test" },
      { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 },
    );

    expect(result.isError).toBe(false);
    expect(provider.generateStructured).toHaveBeenCalledTimes(2);

    const secondCallParams = vi.mocked(provider.generateStructured).mock.calls[1]![0];
    expect(secondCallParams.prompt).toContain("original prompt");
    expect(secondCallParams.prompt).toContain("falhou nesta validação");
  });

  it("gives up after maxAttempts and returns the last error", async () => {
    const provider = fakeProviderFromRawResponses([{ value: "" }, { value: "" }, { value: "" }]);

    const result = await generateStructuredWithRetry(
      provider,
      { system: "sys", prompt: "prompt", schema, schemaName: "Test" },
      { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 },
    );

    expect(result.isError).toBe(true);
    expect(provider.generateStructured).toHaveBeenCalledTimes(3);
    if (result.isError) {
      expect(result.error.category).toBe("STRUCTURED_OUTPUT");
    }
  });

  it("does not retry a non-retryable error category", async () => {
    const provider: LlmProvider = {
      name: "fake",
      model: "fake-model",
      generateStructured: vi.fn(async () =>
        Promise.resolve({
          isError: true as const,
          error: {
            isError: true as const,
            code: "AUTH_FAILED",
            category: "AUTH" as const,
            severity: "ERROR" as const,
            description: "bad api key",
            isRetryable: false,
            timestamp: new Date().toISOString(),
          },
        }),
      ),
    };

    const result = await generateStructuredWithRetry(provider, {
      system: "sys",
      prompt: "prompt",
      schema,
      schemaName: "Test",
    });

    expect(result.isError).toBe(true);
    expect(provider.generateStructured).toHaveBeenCalledTimes(1);
  });
});
