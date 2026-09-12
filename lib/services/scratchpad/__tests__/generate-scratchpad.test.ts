import { describe, expect, it, vi } from "vitest";
import { generateScratchpad } from "../generate-scratchpad";
import { parseStructuredOutput } from "../../../llm/validate-structured-output";
import type { GenerateStructuredParams, LlmProvider } from "../../../llm/provider";
import type { JurisprudenceProvider } from "../../../providers/jurisprudence-provider";
import type { RankedCandidate, RawDecision } from "../../../schemas/search.schema";
import { toolFailure, toolSuccess, type ToolResult } from "../../../errors/tool-result";
import { createAppError } from "../../../errors/app-error";

function fakeProviderFromRawResponses(rawResponses: unknown[]): LlmProvider {
  let index = 0;
  const generateStructured = vi.fn(async (params: GenerateStructuredParams<unknown>) => {
    const raw = rawResponses[index];
    index += 1;
    return parseStructuredOutput(params.schema, params.schemaName, raw, "fake");
  }) as unknown as LlmProvider["generateStructured"];

  return { name: "fake", model: "fake-model", generateStructured };
}

function fakeJurisprudenceProvider(decisionResult: ToolResult<RawDecision>): JurisprudenceProvider {
  return {
    name: "fake",
    search: vi.fn(),
    fetchDecision: vi.fn(async () => decisionResult),
  };
}

function rankedCandidate(overrides: Partial<RankedCandidate["item"]> = {}): RankedCandidate {
  return {
    item: {
      id: "fixture-001",
      court: "TJPR",
      chamber: "5ª Câmara Cível",
      judge: "Des. Fulano",
      url: "https://tjpr.jus.br/fixture-001",
      source: "TJPR",
      ...overrides,
    },
    score: 0.87,
    scoreBreakdown: { keywordOverlap: 0.9 },
  };
}

function rawDecision(overrides: Partial<RawDecision> = {}): RawDecision {
  return {
    id: "fixture-001",
    court: "TJPR",
    processNumber: "0001234-56.2024.8.16.0001",
    rapporteur: "Des. Fulano",
    judgmentDate: "2024-03-10",
    fullText: "Texto integral da decisão sobre plano de saúde e negativa de cobertura.",
    sourceUrl: "https://tjpr.jus.br/fixture-001",
    ...overrides,
  };
}

const validContent = {
  relevance: { score: 0.5, reason: "Trata de tema correlato ao caso." },
  caseSummary: "Decisão que reconhece a abusividade da negativa de cobertura.",
  facts: ["Negativa de cobertura de home care."],
  legalIssues: ["Abusividade de cláusula contratual"],
  holdings: [
    {
      proposition: "Responsabilidade objetiva da operadora",
      stance: "SUPPORTS",
      reasoning: "O tribunal reconheceu a responsabilidade objetiva da operadora de saúde.",
    },
  ],
  favorablePoints: ["Reconhecimento da abusividade da negativa."],
  contraryPoints: [],
  distinguishingFacts: [],
  citedLaws: ["Lei 9.656/1998"],
  citedPrecedents: [],
  evidenceCandidates: [
    {
      id: "ev-1",
      quote: "A negativa de cobertura de home care é abusiva.",
      context: "Trecho do voto do relator.",
      purpose: "Sustenta a tese de abusividade.",
    },
  ],
  confidence: 0.8,
  status: "VALID",
};

describe("generateScratchpad", () => {
  it("assembles a full DecisionScratchpad, computing sourceHash and overriding relevance.score with the Fase 4 score (HU-17)", async () => {
    const provider = fakeProviderFromRawResponses([validContent]);
    const jurisprudenceProvider = fakeJurisprudenceProvider(toolSuccess(rawDecision()));
    const candidate = rankedCandidate();

    const result = await generateScratchpad(candidate, provider, jurisprudenceProvider);

    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.data.source.sourceHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.data.source.sourceId).toBe("fixture-001");
      expect(result.data.source.provider).toBe("TJPR");
      expect(result.data.relevance.score).toBe(candidate.score);
      expect(result.data.scratchpadId).toBeTruthy();
      expect(result.data.schemaVersion).toBeTruthy();
    }
    expect(provider.generateStructured).toHaveBeenCalledTimes(1);
  });

  it("propagates a fetchDecision failure unchanged, without calling the model", async () => {
    const provider = fakeProviderFromRawResponses([validContent]);
    const fetchError = toolFailure(
      createAppError({
        code: "FIXTURE_DECISION_NOT_FOUND",
        category: "NOT_FOUND",
        severity: "ERROR",
        description: "Decision not found",
        isRetryable: false,
        operation: "fetchDecision",
      }),
    );
    const jurisprudenceProvider = fakeJurisprudenceProvider(fetchError);

    const result = await generateScratchpad(rankedCandidate(), provider, jurisprudenceProvider);

    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("FIXTURE_DECISION_NOT_FOUND");
    }
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it("rejects a decision with no fullText and no summary without wasting a model call", async () => {
    const provider = fakeProviderFromRawResponses([validContent]);
    const jurisprudenceProvider = fakeJurisprudenceProvider(
      toolSuccess(rawDecision({ fullText: undefined, summary: undefined })),
    );

    const result = await generateScratchpad(rankedCandidate(), provider, jurisprudenceProvider);

    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("EMPTY_DECISION_CONTENT");
      expect(result.error.isRetryable).toBe(false);
    }
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it("retries with error feedback when the first output fails schema validation (HU-20)", async () => {
    const provider = fakeProviderFromRawResponses([
      { ...validContent, holdings: [{ proposition: "x" }] },
      validContent,
    ]);
    const jurisprudenceProvider = fakeJurisprudenceProvider(toolSuccess(rawDecision()));

    const result = await generateScratchpad(rankedCandidate(), provider, jurisprudenceProvider);

    expect(result.isError).toBe(false);
    expect(provider.generateStructured).toHaveBeenCalledTimes(2);
  });

  it("remaps an exhausted structured-output failure to INVALID_SCRATCHPAD_SCHEMA with metadata.missingFields (HU-17)", async () => {
    const invalidResponse = { relevance: { score: 0.5, reason: "x" } };
    const provider = fakeProviderFromRawResponses([invalidResponse, invalidResponse, invalidResponse]);
    const jurisprudenceProvider = fakeJurisprudenceProvider(toolSuccess(rawDecision()));

    const result = await generateScratchpad(rankedCandidate(), provider, jurisprudenceProvider);

    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("INVALID_SCRATCHPAD_SCHEMA");
      expect(result.error.category).toBe("STRUCTURED_OUTPUT");
      expect(result.error.isRetryable).toBe(true);
      const missingFields = result.error.metadata?.missingFields as string[];
      expect(missingFields).toContain("caseSummary");
      expect(missingFields).toContain("holdings");
    }
    expect(provider.generateStructured).toHaveBeenCalledTimes(3);
  });

  it("rejects holdings=[] combined with status=VALID from the model as a schema failure (HU-18)", async () => {
    const inconsistentResponse = { ...validContent, holdings: [], status: "VALID" };
    const provider = fakeProviderFromRawResponses([inconsistentResponse, inconsistentResponse, inconsistentResponse]);
    const jurisprudenceProvider = fakeJurisprudenceProvider(toolSuccess(rawDecision()));

    const result = await generateScratchpad(rankedCandidate(), provider, jurisprudenceProvider);

    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("INVALID_SCRATCHPAD_SCHEMA");
    }
  });

  it("accepts holdings=[] when status is PARTIAL (HU-18: empty holdings is fine outside VALID)", async () => {
    const partialResponse = { ...validContent, holdings: [], status: "PARTIAL" };
    const provider = fakeProviderFromRawResponses([partialResponse]);
    const jurisprudenceProvider = fakeJurisprudenceProvider(toolSuccess(rawDecision()));

    const result = await generateScratchpad(rankedCandidate(), provider, jurisprudenceProvider);

    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.data.status).toBe("PARTIAL");
      expect(result.data.holdings).toEqual([]);
    }
  });
});
