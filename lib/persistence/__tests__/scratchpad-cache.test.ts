import { describe, expect, it, vi } from "vitest";
import { createInMemoryRepository } from "../in-memory-repository";
import { createRepositoryScratchpadCache, NO_SCRATCHPAD_CACHE } from "../scratchpad-cache";
import { buildIdempotencyKey } from "../idempotency";
import { RUN_ID, runRecord, scratchpad } from "./fixtures";
import { generateScratchpad } from "../../services/scratchpad/generate-scratchpad";
import { parseStructuredOutput } from "../../llm/validate-structured-output";
import type { GenerateStructuredParams, LlmProvider } from "../../llm/provider";
import type { JurisprudenceProvider } from "../../providers/jurisprudence-provider";
import type { PipelineVersions } from "../../config/versions";
import type { RankedCandidate, RawDecision } from "../../schemas/search.schema";
import { toolSuccess } from "../../errors/tool-result";

const versions: PipelineVersions = {
  pipelineVersion: "1.0.0",
  promptVersion: "1.0.0",
  modelVersion: "fake-model",
};

const validContent = {
  relevance: { score: 0.5, reason: "Trata de tema correlato." },
  caseSummary: "Decisão que reconhece a abusividade.",
  facts: ["Negativa de cobertura."],
  legalIssues: ["Abusividade"],
  holdings: [
    { proposition: "Negativa abusiva", stance: "SUPPORTS", reasoning: "Prescrição médica prevalece." },
  ],
  favorablePoints: [],
  contraryPoints: [],
  distinguishingFacts: [],
  citedLaws: [],
  citedPrecedents: [],
  evidenceCandidates: [
    { id: "EV-1", quote: "é abusiva", context: "Ementa.", purpose: "Sustenta a tese." },
  ],
  confidence: 0.8,
  status: "VALID",
};

function fakeLlmProvider(): LlmProvider {
  const generateStructured = vi.fn(async (params: GenerateStructuredParams<unknown>) =>
    parseStructuredOutput(params.schema, params.schemaName, validContent, "fake"),
  ) as unknown as LlmProvider["generateStructured"];

  return { name: "fake", model: "fake-model", generateStructured };
}

function fakeJurisprudenceProvider(): JurisprudenceProvider {
  const decision: RawDecision = {
    id: "fixture-001",
    court: "TJPR",
    fullText: "EMENTA: a negativa de cobertura é abusiva.",
    sourceUrl: "https://portal.tjpr.jus.br/jurisprudencia/publico/#/decisao/fixture-001",
  };

  return {
    name: "fake",
    search: vi.fn(),
    fetchDecision: vi.fn(async () => toolSuccess(decision)),
  };
}

function candidate(): RankedCandidate {
  return {
    item: {
      id: "fixture-001",
      court: "TJPR",
      chamber: "9ª Câmara Cível",
      url: "https://portal.tjpr.jus.br/jurisprudencia/publico/#/decisao/fixture-001",
      source: "TJPR",
    },
    score: 0.87,
    scoreBreakdown: {},
  };
}

async function seededRepository() {
  const repository = createInMemoryRepository();
  await repository.createRun(runRecord());
  return repository;
}

describe("createRepositoryScratchpadCache (HU-33)", () => {
  it("reuses an existing scratchpad instead of calling the model again", async () => {
    const repository = await seededRepository();
    const cache = createRepositoryScratchpadCache({ repository, runId: RUN_ID, versions });
    const llm = fakeLlmProvider();
    const jurisprudence = fakeJurisprudenceProvider();

    const first = await generateScratchpad(candidate(), llm, jurisprudence, cache);
    expect(first.isError).toBe(false);
    expect(llm.generateStructured).toHaveBeenCalledTimes(1);

    const second = await generateScratchpad(candidate(), llm, jurisprudence, cache);

    expect(second.isError).toBe(false);
    // Critério de aceite de HU-33: reutiliza em vez de chamar o modelo de novo.
    expect(llm.generateStructured).toHaveBeenCalledTimes(1);
    if (!second.isError && !first.isError) {
      expect(second.data.scratchpadId).toBe(first.data.scratchpadId);
    }
  });

  it("does not even reopen the decision on a cache hit", async () => {
    const repository = await seededRepository();
    const cache = createRepositoryScratchpadCache({ repository, runId: RUN_ID, versions });
    const jurisprudence = fakeJurisprudenceProvider();

    await generateScratchpad(candidate(), fakeLlmProvider(), jurisprudence, cache);
    await generateScratchpad(candidate(), fakeLlmProvider(), jurisprudence, cache);

    expect(jurisprudence.fetchDecision).toHaveBeenCalledTimes(1);
  });

  it("regenerates when the prompt version changed — no silent cross-version reuse", async () => {
    const repository = await seededRepository();
    const jurisprudence = fakeJurisprudenceProvider();
    const llm = fakeLlmProvider();

    await generateScratchpad(
      candidate(),
      llm,
      jurisprudence,
      createRepositoryScratchpadCache({ repository, runId: RUN_ID, versions }),
    );

    await generateScratchpad(
      candidate(),
      llm,
      jurisprudence,
      createRepositoryScratchpadCache({
        repository,
        runId: RUN_ID,
        versions: { ...versions, promptVersion: "1.1.0" },
      }),
    );

    expect(llm.generateStructured).toHaveBeenCalledTimes(2);
  });

  it("regenerates when the model changed", async () => {
    const repository = await seededRepository();
    const jurisprudence = fakeJurisprudenceProvider();
    const llm = fakeLlmProvider();

    await generateScratchpad(
      candidate(),
      llm,
      jurisprudence,
      createRepositoryScratchpadCache({ repository, runId: RUN_ID, versions }),
    );
    await generateScratchpad(
      candidate(),
      llm,
      jurisprudence,
      createRepositoryScratchpadCache({
        repository,
        runId: RUN_ID,
        versions: { ...versions, modelVersion: "gpt-4.1" },
      }),
    );

    expect(llm.generateStructured).toHaveBeenCalledTimes(2);
  });

  it("never serves a PARTIAL scratchpad from cache — that would freeze an unreliable analysis", async () => {
    const repository = await seededRepository();
    const cache = createRepositoryScratchpadCache({ repository, runId: RUN_ID, versions });

    await repository.saveScratchpad({
      scratchpadId: "SP-PARTIAL",
      runId: RUN_ID,
      decisionId: "fixture-001",
      idempotencyKey: buildIdempotencyKey("fixture-001", versions),
      schemaVersion: "1.0.0",
      pipelineVersion: versions.pipelineVersion,
      promptVersion: versions.promptVersion,
      modelVersion: versions.modelVersion,
      content: scratchpad({ scratchpadId: "SP-PARTIAL", status: "PARTIAL" }),
      status: "PARTIAL",
      createdAt: new Date().toISOString(),
    });

    expect(await cache.find("fixture-001")).toBeUndefined();
  });

  it("persists the four versions that produced the scratchpad (§11.6)", async () => {
    const repository = await seededRepository();
    const cache = createRepositoryScratchpadCache({ repository, runId: RUN_ID, versions });

    await generateScratchpad(candidate(), fakeLlmProvider(), fakeJurisprudenceProvider(), cache);

    const stored = await repository.findScratchpadByIdempotencyKey(
      buildIdempotencyKey("fixture-001", versions),
    );
    if (stored.isError || !stored.data) throw new Error("scratchpad não persistido");

    expect(stored.data.schemaVersion).toBeTruthy();
    expect(stored.data.pipelineVersion).toBe("1.0.0");
    expect(stored.data.promptVersion).toBe("1.0.0");
    expect(stored.data.modelVersion).toBe("fake-model");
    expect(stored.data.decisionId).toBe("fixture-001");
  });
});

describe("NO_SCRATCHPAD_CACHE", () => {
  it("keeps the pre-Fase 8 behaviour: always generates, never stores", async () => {
    const llm = fakeLlmProvider();

    await generateScratchpad(candidate(), llm, fakeJurisprudenceProvider(), NO_SCRATCHPAD_CACHE);
    await generateScratchpad(candidate(), llm, fakeJurisprudenceProvider(), NO_SCRATCHPAD_CACHE);

    expect(llm.generateStructured).toHaveBeenCalledTimes(2);
  });
});
