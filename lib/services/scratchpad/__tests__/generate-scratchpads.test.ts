import { describe, expect, it, vi } from "vitest";
import { generateScratchpads, type ScratchpadProgressEvent } from "../generate-scratchpads";
import { parseStructuredOutput } from "../../../llm/validate-structured-output";
import type { GenerateStructuredParams, LlmProvider } from "../../../llm/provider";
import type { JurisprudenceProvider } from "../../../providers/jurisprudence-provider";
import type { RankedCandidate, RawDecision } from "../../../schemas/search.schema";
import { toolFailure, toolSuccess } from "../../../errors/tool-result";
import { createAppError } from "../../../errors/app-error";
import type { ScratchpadCache } from "../../../persistence/scratchpad-cache";
import type { DecisionScratchpad } from "../../../schemas/scratchpad.schema";

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

    const result = await generateScratchpads(candidates, provider, jurisprudenceProvider, { concurrency: 2 });

    expect(result.isError).toBe(false);
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThan(1);
  });

  it("relata cada decisão no momento em que ela começa e termina", async () => {
    const ids = ["fixture-0", "fixture-1", "fixture-2"];
    const candidates = ids.map(rankedCandidate);
    const provider = fakeProviderKeyedById({
      "fixture-0": [validContent],
      "fixture-1": [validContent],
      // Esgota as três tentativas do retry e termina como falha de schema (HU-17).
      "fixture-2": [invalidContent, invalidContent, invalidContent],
    });
    const jurisprudenceProvider = fakeJurisprudenceProvider(ids);

    const events: ScratchpadProgressEvent[] = [];
    const result = await generateScratchpads(candidates, provider, jurisprudenceProvider, {
      onEvent: (event) => events.push(event),
    });

    expect(result.isError).toBe(false);
    expect(events.filter((event) => event.type === "STARTED")).toHaveLength(3);

    expect(events.filter((event) => event.type === "FETCHING")).toHaveLength(3);
    expect(events.filter((event) => event.type === "GENERATING")).toHaveLength(3);

    const concluidos = events.filter((event) => event.type === "FINISHED" || event.type === "FAILED");
    expect(concluidos).toHaveLength(3);

    // Toda decisão que começou também terminou: é o que impede o painel de ficar com um item
    // "em andamento" para sempre depois que o lote acabou.
    for (const id of ids) {
      expect(events.some((event) => event.type === "STARTED" && event.candidateId === id)).toBe(true);
      expect(
        events.some(
          (event) => (event.type === "FINISHED" || event.type === "FAILED") && event.candidateId === id,
        ),
      ).toBe(true);
    }

    const falha = events.find((event) => event.type === "FAILED");
    expect(falha?.candidateId).toBe("fixture-2");
    expect(falha?.type === "FAILED" && falha.error.code).toBe("INVALID_SCRATCHPAD_SCHEMA");

    const sucesso = events.find((event) => event.type === "FINISHED");
    expect(sucesso?.type === "FINISHED" && sucesso.status).toBe("VALID");
    expect(sucesso?.type === "FINISHED" && sucesso.source).toBe("model");
    expect(sucesso?.type === "FINISHED" && sucesso.timing?.modelMs).toEqual(expect.any(Number));
  });

  it("serve cache hit sem chamar fetchDecision nem modelo", async () => {
    const candidate = rankedCandidate("fixture-cache");
    const cachedScratchpad = {
      ...validContent,
      scratchpadId: "SP-cache",
      schemaVersion: "1.0.0",
      source: {
        provider: "TJPR",
        sourceId: candidate.item.id,
        url: candidate.item.url,
        court: "TJPR",
        chamber: candidate.item.chamber,
        sourceHash: "a".repeat(64),
      },
      evidenceCandidates: [],
    } as DecisionScratchpad;
    const cache: ScratchpadCache = {
      find: vi.fn(async () => cachedScratchpad),
      save: vi.fn(),
    };
    const provider = fakeProviderKeyedById({ "fixture-cache": [validContent] });
    const jurisprudenceProvider = fakeJurisprudenceProvider(["fixture-cache"]);
    const events: ScratchpadProgressEvent[] = [];

    const result = await generateScratchpads([candidate], provider, jurisprudenceProvider, {
      cache,
      onEvent: (event) => events.push(event),
    });

    expect(result.isError).toBe(false);
    expect(jurisprudenceProvider.fetchDecision).not.toHaveBeenCalled();
    expect(provider.generateStructured).not.toHaveBeenCalled();
    expect(cache.save).not.toHaveBeenCalled();
    expect(events.map((event) => event.type)).toEqual(["STARTED", "FINISHED"]);
    const finished = events.find((event) => event.type === "FINISHED");
    expect(finished?.type === "FINISHED" && finished.source).toBe("cache");
  });

  it("limita chamadas LLM separadamente da busca da decisão", async () => {
    const ids = Array.from({ length: 5 }, (_, i) => `fixture-${i}`);
    const candidates = ids.map(rankedCandidate);
    let llmInFlight = 0;
    let llmPeak = 0;
    const provider: LlmProvider = {
      name: "fake",
      model: "fake-model",
      generateStructured: vi.fn(async (params: GenerateStructuredParams<unknown>) => {
        llmInFlight += 1;
        llmPeak = Math.max(llmPeak, llmInFlight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        llmInFlight -= 1;
        return parseStructuredOutput(params.schema, params.schemaName, validContent, "fake");
      }) as unknown as LlmProvider["generateStructured"],
    };
    const jurisprudenceProvider = fakeJurisprudenceProvider(ids);

    const result = await generateScratchpads(candidates, provider, jurisprudenceProvider, {
      concurrency: 5,
      fetchConcurrency: 5,
      llmConcurrency: 2,
    });

    expect(result.isError).toBe(false);
    expect(llmPeak).toBeLessThanOrEqual(2);
    expect(llmPeak).toBeGreaterThan(1);
  });

  it("não deixa um listener de progresso quebrado derrubar o lote", async () => {
    const ids = ["fixture-0", "fixture-1"];
    const candidates = ids.map(rankedCandidate);
    const provider = fakeProviderKeyedById(Object.fromEntries(ids.map((id) => [id, [validContent]])));
    const jurisprudenceProvider = fakeJurisprudenceProvider(ids);

    const result = await generateScratchpads(candidates, provider, jurisprudenceProvider, {
      onEvent: () => {
        throw new Error("observabilidade quebrada");
      },
    });

    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.data.processed).toBe(2);
      expect(result.data.failed).toBe(0);
    }
  });
});
