import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAuditedLlmProvider, type LlmCallRecord } from "../audited-llm-provider";
import { generateStructuredWithRetry } from "../generate-with-retry";
import { toolFailure, toolSuccess, type ToolResult } from "../../errors/tool-result";
import { createAppError } from "../../errors/app-error";
import type { GenerateStructuredParams, LlmProvider } from "../provider";

const SCHEMA = z.object({ ok: z.boolean() });

type StubResponse = () => ToolResult<{ ok: boolean }>;

function stubProvider(responses: StubResponse[]): LlmProvider {
  let call = 0;
  return {
    name: "stub",
    model: "stub-model",
    // O cast é a fronteira genérica do contrato: o stub só sabe responder um schema, e escondê-lo
    // atrás de `T` é o que permite usá-lo com `generateStructuredWithRetry` sem duplicar o tipo.
    generateStructured: async <T>() =>
      responses[Math.min(call++, responses.length - 1)]!() as ToolResult<T>,
  };
}

const PARAMS: GenerateStructuredParams<{ ok: boolean }> = {
  system: "system de teste",
  prompt: "prompt de teste",
  schema: SCHEMA,
  schemaName: "Teste",
};

describe("createAuditedLlmProvider", () => {
  it("registra system, prompt e modelo de cada chamada", async () => {
    const records: LlmCallRecord[] = [];
    const provider = createAuditedLlmProvider(
      stubProvider([() => toolSuccess({ ok: true }, { source: "reserva" })]),
      (record) => records.push(record),
    );

    await provider.generateStructured(PARAMS);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      callIndex: 1,
      schemaName: "Teste",
      provider: "stub",
      model: "stub-model",
      // Quem de fato respondeu, e não quem era o primário: é a diferença que HU-14 exige enxergar.
      respondedBy: "reserva",
      system: "system de teste",
      prompt: "prompt de teste",
      outcome: "OK",
      output: { ok: true },
    });
  });

  it("não altera o ToolResult devolvido ao pipeline", async () => {
    const inner = stubProvider([() => toolSuccess({ ok: true }, { durationMs: 7 })]);
    const audited = createAuditedLlmProvider(inner, () => {});

    const result = await audited.generateStructured(PARAMS);

    expect(result.isError).toBe(false);
    if (result.isError) return;
    expect(result.data).toEqual({ ok: true });
    expect(result.metadata?.durationMs).toBe(7);
  });

  it("registra cada tentativa do retry, com o erro anterior já dentro do prompt seguinte", async () => {
    const records: LlmCallRecord[] = [];
    const retryableFailure = () =>
      toolFailure(
        createAppError({
          code: "LLM_HTTP_503",
          category: "UPSTREAM",
          severity: "ERROR",
          description: "indisponível",
          isRetryable: true,
          operation: "teste",
        }),
      );

    const audited = createAuditedLlmProvider(
      stubProvider([retryableFailure, () => toolSuccess({ ok: true })]),
      (record) => records.push(record),
    );

    const result = await generateStructuredWithRetry(audited, PARAMS, {
      maxAttempts: 2,
      baseDelayMs: 0,
      maxDelayMs: 0,
    });

    expect(result.isError).toBe(false);
    expect(records.map((record) => record.outcome)).toEqual(["ERROR", "OK"]);
    expect(records[0]!.errorCode).toBe("LLM_HTTP_503");
    // A segunda tentativa carrega o erro da primeira: é assim que o ciclo de correção de §11.7
    // fica legível para quem audita, sem precisar instrumentar o retry.
    expect(records[1]!.prompt).toContain("indisponível");
  });

  it("falha do sink não derruba a chamada", async () => {
    const audited = createAuditedLlmProvider(
      stubProvider([() => toolSuccess({ ok: true })]),
      () => {
        throw new Error("sink quebrado");
      },
    );

    await expect(audited.generateStructured(PARAMS)).resolves.toMatchObject({ isError: false });
  });
});
