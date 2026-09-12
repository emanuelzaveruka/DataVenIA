import { describe, expect, it, vi } from "vitest";
import { generateScratchpads } from "../generate-scratchpads";
import { parseStructuredOutput } from "../../../llm/validate-structured-output";
import type { GenerateStructuredParams, LlmProvider } from "../../../llm/provider";
import type { JurisprudenceProvider } from "../../../providers/jurisprudence-provider";
import type { RankedCandidate, RawDecision } from "../../../schemas/search.schema";
import { toolFailure, toolSuccess } from "../../../errors/tool-result";
import { createAppError } from "../../../errors/app-error";

/**
 * Chaveado por `candidate.item.id`, extraído do prompt via o marcador estável
 * "ID interno da decisão: X" (lib/services/scratchpad/prompts.ts). Um índice compartilhado, como
 * usado em `analyze-case.test.ts`, não é seguro aqui: as chamadas rodam concorrentemente e a ordem
 * de execução entre decisões diferentes não é garantida.
 */
function fakeProviderKeyedById(responsesById: Record<string, unknown[]>): LlmProvider {
  const cursors: Record<string, number> = {};
  const generateStructured = vi.fn(async (params: GenerateStructuredParams<unknown>) => {
    const match = /ID interno da decisão: (\S+)/.exec(params.prompt);
    const id = match?.[1];
    if (!id || !(id in responsesById)) {
      throw new Error(`test fake: no responses configured for decision id "${id}"`);
    }
    const i = cursors[id] ?? 0;
    cursors[id] = i + 1;
    return parseStructuredOutput(params.schema, params.schemaName, responsesById[id]![i], "fake");
  }) as unknown as LlmProvider["generateStructured"];

  return { name: "fake", model: "fake-model", generateStructured };
}

function fakeJurisprudenceProvider(
  ids: readonly string[],
  options: { delayMs?: number; onFetch?: () => void } = {},
): JurisprudenceProvider {
  return {
    name: "fake",
    search: vi.fn(),
    fetchDecision: vi.fn(async (id: string) => {
      if (!ids.includes(id)) {
        return toolFailure(
          createAppError({
            code: "FIXTURE_DECISION_NOT_FOUND",
            category: "NOT_FOUND",
            severity: "ERROR",
            description: `no fake decision configured for "${id}"`,
            isRetryable: false,
          }),
        );
      }
      options.onFetch?.();
      if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      return toolSuccess(rawDecision({ id }));
    }),
  };
}

function rankedCandidate(id: string): RankedCandidate {
  return {
    item: {
      id,
      court: "TJPR",
      chamber: "5ª Câmara Cível",
      url: `https://tjpr.jus.br/${id}`,
      source: "TJPR",
    },
    score: 0.7,
    scoreBreakdown: { keywordOverlap: 0.7 },
  };
}

function rawDecision(overrides: Partial<RawDecision> = {}): RawDecision {
  return {
    id: "fixture-0",
    court: "TJPR",
    fullText: "Texto integral da decisão.",
    sourceUrl: "https://tjpr.jus.br/fixture-0",
    ...overrides,
  };
}

const validContent = {
  relevance: { score: 0.5, reason: "x" },
  caseSummary: "Resumo do caso.",
  facts: [],
  legalIssues: [],
  holdings: [{ proposition: "Tese X", stance: "SUPPORTS", reasoning: "Porque sim." }],
  favorablePoints: [],
  contraryPoints: [],
  distinguishingFacts: [],
  citedLaws: [],
  citedPrecedents: [],
  evidenceCandidates: [],
  confidence: 0.6,
  status: "VALID",
};

const invalidContent = { relevance: { score: 0.5, reason: "x" } };

describe("generateScratchpads", () => {
  it("returns NO_CANDIDATES_FOR_SCRATCHPAD for an empty candidate list", async () => {
    const provider = fakeProviderKeyedById({});
    const jurisprudenceProvider = fakeJurisprudenceProvider([]);

    const result = await generateScratchpads([], provider, jurisprudenceProvider);

    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("NO_CANDIDATES_FOR_SCRATCHPAD");
    }
  });

  it("reports SUCCESS with all candidates processed and preserves original order", async () => {
    const ids = ["fixture-0", "fixture-1", "fixture-2", "fixture-3"];
    const candidates = ids.map(rankedCandidate);
    const provider = fakeProviderKeyedById(Object.fromEntries(ids.map((id) => [id, [validContent]])));
    const jurisprudenceProvider = fakeJurisprudenceProvider(ids);

    const result = await generateScratchpads(candidates, provider, jurisprudenceProvider);

    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.data.status).toBe("SUCCESS");
      expect(result.data.requested).toBe(4);
      expect(result.data.processed).toBe(4);
      expect(result.data.failed).toBe(0);
      expect(result.data.scratchpads.map((s) => s.source.sourceId)).toEqual(ids);
    }
  });

  it("keeps going when one decision fails all retries, reporting PARTIAL_SUCCESS with correct counts (HU-19)", async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `fixture-${i}`);
    const failingId = "fixture-5";
    const candidates = ids.map(rankedCandidate);
    const responsesById = Object.fromEntries(
      ids.map((id) => [id, id === failingId ? [invalidContent, invalidContent, invalidContent] : [validContent]]),
    );
    const provider = fakeProviderKeyedById(responsesById);
    const jurisprudenceProvider = fakeJurisprudenceProvider(ids);

    const result = await generateScratchpads(candidates, provider, jurisprudenceProvider);

    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.data.status).toBe("PARTIAL_SUCCESS");
      expect(result.data.requested).toBe(10);
      expect(result.data.processed).toBe(9);
      expect(result.data.failed).toBe(1);
      expect(result.data.failures).toHaveLength(1);
      expect(result.data.failures[0]?.candidateId).toBe(failingId);
      expect(result.data.failures[0]?.error.code).toBe("INVALID_SCRATCHPAD_SCHEMA");
      expect(result.data.scratchpads).toHaveLength(9);
    }
  });

  it("never runs more fetchDecision calls at once than the configured concurrency", async () => {
    const ids = Array.from({ length: 6 }, (_, i) => `fixture-${i}`);
    const candidates = ids.map(rankedCandidate);
    const provider = fakeProviderKeyedById(Object.fromEntries(ids.map((id) => [id, [validContent]])));

    let inFlight = 0;
    let peak = 0;
    const jurisprudenceProvider: JurisprudenceProvider = {
      name: "fake",
      search: vi.fn(),
      fetchDecision: vi.fn(async (id: string) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlight -= 1;
        return toolSuccess(rawDecision({ id }));
      }),
    };

    const result = await generateScratchpads(candidates, provider, jurisprudenceProvider, 2);

    expect(result.isError).toBe(false);
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThan(1);
  });
});
