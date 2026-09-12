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
  });

  it("keeps max_tokens for DeepSeek's OpenAI-compatible endpoint", async () => {
    const fetch = fetchMock();
    vi.stubGlobal("fetch", fetch);

    const result = await generateWith(createDeepseekProvider({ apiKey: "key" }));

    expect(result.isError).toBe(false);
    const body = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
    expect(body.max_tokens).toBe(123);
    expect(body.max_completion_tokens).toBeUndefined();
  });
});
