import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createDeepseekProvider } from "../deepseek-provider";
import { createOpenAiProvider } from "../openai-provider";

const schema = z.object({ ok: z.boolean() });

const successResponse = {
  choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
};

function fetchMock() {
  return vi.fn(async (..._args: Parameters<typeof fetch>) =>
    new Response(JSON.stringify(successResponse), { status: 200 }),
  );
}

async function generateWith(provider: ReturnType<typeof createOpenAiProvider>) {
  return provider.generateStructured({
    system: "system",
    prompt: "prompt",
    schema,
    schemaName: "TestSchema",
    maxOutputTokens: 123,
  });
}

describe("OpenAI-compatible providers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends max_completion_tokens to OpenAI chat completions models", async () => {
    const fetch = fetchMock();
    vi.stubGlobal("fetch", fetch);

    const result = await generateWith(createOpenAiProvider({ apiKey: "key", model: "gpt-5-nano" }));

    expect(result.isError).toBe(false);
    const body = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
    expect(body.max_completion_tokens).toBe(123);
    expect(body.max_tokens).toBeUndefined();
    expect(body.reasoning_effort).toBe("minimal");
  });

  it("keeps max_tokens for DeepSeek's OpenAI-compatible endpoint", async () => {
    const fetch = fetchMock();
    vi.stubGlobal("fetch", fetch);

    const result = await generateWith(createDeepseekProvider({ apiKey: "key" }));

    expect(result.isError).toBe(false);
    const body = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
    expect(body.max_tokens).toBe(123);
    expect(body.max_completion_tokens).toBeUndefined();
    expect(body.reasoning_effort).toBeUndefined();
  });

  it("returns diagnostic metadata when a chat completion has no message content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: "length", message: { content: null } }],
            usage: {
              completion_tokens: 123,
              completion_tokens_details: { reasoning_tokens: 123 },
            },
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await generateWith(createOpenAiProvider({ apiKey: "key", model: "gpt-5-nano" }));

    expect(result.isError).toBe(true);
    if (!result.isError) return;
    expect(result.error.code).toBe("STRUCTURED_OUTPUT_MISSING");
    expect(result.error.description).toContain("finish_reason=length");
    expect(result.error.description).toContain("reasoning_tokens=123");
    expect(result.error.metadata).toMatchObject({
      finishReason: "length",
      usage: {
        completion_tokens: 123,
        completion_tokens_details: { reasoning_tokens: 123 },
      },
    });
  });
});
