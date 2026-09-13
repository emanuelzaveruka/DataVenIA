import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { analyzeCase } from "../analyze-case";
import { parseStructuredOutput } from "../../../llm/validate-structured-output";
import type { GenerateStructuredParams, LlmProvider } from "../../../llm/provider";
import type { SanitizedDocument } from "../../../schemas/sanitization.schema";
import { MIN_CASE_ANALYSIS_INPUT_CHARS } from "../../../config/limits";

function fakeProviderFromRawResponses(rawResponses: unknown[]): LlmProvider {
  let index = 0;
  const generateStructured = vi.fn(async (params: GenerateStructuredParams<unknown>) => {
    const raw = rawResponses[index];
    index += 1;
    return parseStructuredOutput(params.schema, params.schemaName, raw, "fake");
  }) as unknown as LlmProvider["generateStructured"];

  return { name: "fake", model: "fake-model", generateStructured };
}

function sanitizedDocument(text: string): SanitizedDocument {
  return { documentId: "doc-1", sanitizedText: text, redactions: [] };
}

const validCaseAnalysis = {
  parties: { plaintiff: "Fulano", defendant: "Ciclano" },
  facts: ["Negativação indevida em 2024."],
  requests: ["Indenização por danos morais."],
  legalIssues: [
    { id: "issue-1", topic: "Dano moral", question: "Há dano moral por negativação indevida?", relevance: "HIGH" },
  ],
  clientArguments: ["A negativação foi indevida."],
  opposingArguments: [],
  citedLaws: [],
  citedPrecedents: [],
  evidenceSummary: [],
};

describe("analyzeCase", () => {
  it("numera as questões jurídicas em código, ignorando o id que o modelo tenha escrito", async () => {
    // O id é a chave que liga query (HU-11), análise cruzada (HU-21) e relatório. Pedi-lo ao
    // modelo dava um formato diferente a cada execução ("1", "issue-1"), e a etapa seguinte, sem
    // padrão a seguir, inventava o seu — derrubando a análise cruzada inteira por id inexistente.
    const provider = fakeProviderFromRawResponses([
      {
        ...validCaseAnalysis,
        legalIssues: [
          { id: "1", topic: "Dano moral", question: "Há dano moral?", relevance: "HIGH" },
          { id: "qualquer-coisa", topic: "Reajuste", question: "O reajuste é abusivo?", relevance: "MEDIUM" },
        ],
      },
    ]);

    const result = await analyzeCase(
      sanitizedDocument("x".repeat(MIN_CASE_ANALYSIS_INPUT_CHARS + 1)),
      provider,
    );

    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.data.legalIssues.map((issue) => issue.id)).toEqual(["LI-1", "LI-2"]);
      expect(result.data.legalIssues[1]!.topic).toBe("Reajuste");
    }
  });

  it("não pede o id ao modelo: ele não aparece no schema enviado", async () => {
    const provider = fakeProviderFromRawResponses([validCaseAnalysis]);

    await analyzeCase(sanitizedDocument("x".repeat(MIN_CASE_ANALYSIS_INPUT_CHARS + 1)), provider);

    const params = vi.mocked(provider.generateStructured).mock.calls[0]![0] as GenerateStructuredParams<unknown>;
    const shape = JSON.stringify(z.toJSONSchema(params.schema as z.ZodType, { target: "draft-7" }));
    expect(shape).not.toContain('"id"');
  });

  it("rejects documents below the minimum useful-content threshold without calling the provider", async () => {
    const provider = fakeProviderFromRawResponses([]);
    const document = sanitizedDocument("texto curto");

    const result = await analyzeCase(document, provider);

    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("INSUFFICIENT_DOCUMENT_CONTENT");
      expect(result.error.isRetryable).toBe(false);
    }
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it("extracts facts and requests without fabricating optional fields (HU-07)", async () => {
    const provider = fakeProviderFromRawResponses([validCaseAnalysis]);
    const document = sanitizedDocument("x".repeat(MIN_CASE_ANALYSIS_INPUT_CHARS + 1));

    const result = await analyzeCase(document, provider);

    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.data.facts).toEqual(validCaseAnalysis.facts);
      expect(result.data.requests).toEqual(validCaseAnalysis.requests);
      expect(result.data.processNumber).toBeUndefined();
    }
  });

  it("rejects a CaseAnalysis with zero legalIssues as a business rule, not a generic issue (HU-08/HU-09)", async () => {
    const provider = fakeProviderFromRawResponses([{ ...validCaseAnalysis, legalIssues: [] }]);
    const document = sanitizedDocument("x".repeat(MIN_CASE_ANALYSIS_INPUT_CHARS + 1));

    const result = await analyzeCase(document, provider);

    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("NO_LEGAL_ISSUES_IDENTIFIED");
      expect(result.error.category).toBe("BUSINESS_RULE");
    }
  });

  it("retries once with error feedback when the model's first output fails schema validation", async () => {
    const provider = fakeProviderFromRawResponses([
      { ...validCaseAnalysis, legalIssues: [{ id: "issue-1", topic: "x" }] },
      validCaseAnalysis,
    ]);
    const document = sanitizedDocument("x".repeat(MIN_CASE_ANALYSIS_INPUT_CHARS + 1));

    const result = await analyzeCase(document, provider);

    expect(result.isError).toBe(false);
    expect(provider.generateStructured).toHaveBeenCalledTimes(2);
  });
});
