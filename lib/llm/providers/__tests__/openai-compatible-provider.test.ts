import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createDeepseekProvider } from "../deepseek-provider";
import { createOpenAiProvider } from "../openai-provider";
import { LLM_CALL_TIMEOUT_MS } from "../../../config/limits";

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

  it("não impõe teto de saída quando o chamador não pede um", async () => {
    const fetch = fetchMock();
    vi.stubGlobal("fetch", fetch);

    const result = await createOpenAiProvider({ apiKey: "key", model: "gpt-5-nano" }).generateStructured({
      system: "system",
      prompt: "prompt",
      schema,
      schemaName: "TestSchema",
    });

    expect(result.isError).toBe(false);
    const body = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
    // Sem o parâmetro vale o limite do próprio modelo. Um teto nosso aqui cortaria a geração no
    // meio — em modelo de raciocínio o orçamento é compartilhado com os tokens de raciocínio, e o
    // resultado truncado voltava como STRUCTURED_OUTPUT, queimando as três tentativas do retry.
    expect(body.max_completion_tokens).toBeUndefined();
    expect(body.max_tokens).toBeUndefined();
  });

  it("marca a resposta truncada pelo limite do modelo como truncada, e não como erro genérico", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "" } }] }),
          { status: 200 },
        ),
      ),
    );

    const result = await generateWith(createOpenAiProvider({ apiKey: "key", model: "gpt-5-nano" }));

    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("STRUCTURED_OUTPUT_MISSING");
      expect(result.error.metadata?.truncated).toBe(true);
      expect(result.error.description).toContain("finish_reason=length");
    }
  });

  it("interrompe a chamada que passa do tempo limite, em vez de segurar um worker para sempre", async () => {
    // Sem timeout, uma chamada pendurada prendia um dos `SCRATCHPAD_CONCURRENCY` workers da etapa
    // MAP indefinidamente — e "muito lento" ficava indistinguível de "travado".
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }),
    );

    const result = await generateWith(createOpenAiProvider({ apiKey: "key", model: "gpt-5-nano" }));

    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("LLM_CALL_TIMEOUT");
      expect(result.error.category).toBe("TIMEOUT");
      expect(result.error.isRetryable).toBe(true);
      expect(result.error.metadata?.timeoutMs).toBe(LLM_CALL_TIMEOUT_MS);
    }
  });

  it("não trata cancelamento do usuário como falha retryable", async () => {
    // Retentar aqui gastaria mais duas chamadas de modelo por um resultado que ninguém vai ler.
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        controller.abort();
        throw init.signal?.reason ?? new DOMException("aborted", "AbortError");
      }),
    );

    const result = await createOpenAiProvider({ apiKey: "key", model: "gpt-5-nano" }).generateStructured({
      system: "system",
      prompt: "prompt",
      schema,
      schemaName: "TestSchema",
      signal: controller.signal,
    });

    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("LLM_CALL_CANCELLED");
      expect(result.error.isRetryable).toBe(false);
    }
  });

  it("passa ao fetch um sinal que carrega o cancelamento do usuário junto com o tempo limite", async () => {
    const controller = new AbortController();
    const fetch = fetchMock();
    vi.stubGlobal("fetch", fetch);

    await createOpenAiProvider({ apiKey: "key", model: "gpt-5-nano" }).generateStructured({
      system: "system",
      prompt: "prompt",
      schema,
      schemaName: "TestSchema",
      signal: controller.signal,
    });

    const signal = fetch.mock.calls[0]![1]!.signal as AbortSignal;
    expect(signal).not.toBe(controller.signal);
    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
  });

  it("asks OpenAI for strict json_schema, which is what makes the shape enforced server-side", async () => {
    const fetch = fetchMock();
    vi.stubGlobal("fetch", fetch);

    await generateWith(createOpenAiProvider({ apiKey: "key", model: "gpt-5-nano" }));

    const body = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.name).toBe("TestSchema");
    expect(body.response_format.json_schema.schema.properties.ok).toBeDefined();
    // No modo estrito o schema viaja no parâmetro; repeti-lo no prompt só gastaria contexto.
    expect(body.messages[0].content).toBe("system");
  });

  it("keeps DeepSeek on json_object with the schema in the prompt — it has no strict mode", async () => {
    const fetch = fetchMock();
    vi.stubGlobal("fetch", fetch);

    await generateWith(createDeepseekProvider({ apiKey: "key" }));

    const body = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0].content).toContain("JSON Schema");
  });

  it("lets the caller raise reasoning_effort above the default for a harder stage", async () => {
    const fetch = fetchMock();
    vi.stubGlobal("fetch", fetch);

    await generateWith(createOpenAiProvider({ apiKey: "key", model: "gpt-5-nano", reasoningEffort: "medium" }));

    expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string).reasoning_effort).toBe("medium");
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
