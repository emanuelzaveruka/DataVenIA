import { describe, expect, it, vi } from "vitest";
import { createCachedJurisprudenceProvider } from "../cached-jurisprudence-provider";
import { createInMemoryRepository } from "../../persistence/in-memory-repository";
import type { JurisprudenceProvider } from "../jurisprudence-provider";
import type { RawDecision } from "../../schemas/search.schema";
import { toolSuccess } from "../../errors/tool-result";
import { verifyEvidence } from "../../services/evidence/verify-evidence";
import { crossFileAnalysis, scratchpad } from "../../persistence/__tests__/fixtures";

const DECISION_TEXT = "EMENTA: a negativa de cobertura é abusiva.";

function innerProvider(text = DECISION_TEXT): JurisprudenceProvider {
  const decision: RawDecision = {
    id: "fixture-001",
    court: "TJPR",
    judgingBody: "9ª Câmara Cível",
    fullText: text,
    sourceUrl: "https://portal.tjpr.jus.br/jurisprudencia/publico/#/decisao/fixture-001",
  };

  return {
    name: "fixture",
    search: vi.fn(async () => toolSuccess({ items: [], totalCount: 0 })),
    fetchDecision: vi.fn(async () => toolSuccess(decision)),
  };
}

describe("createCachedJurisprudenceProvider (HU-33/§11.8)", () => {
  it("fetches once and serves the second call from the decision cache", async () => {
    const inner = innerProvider();
    const cached = createCachedJurisprudenceProvider(inner, createInMemoryRepository());

    const first = await cached.fetchDecision("fixture-001");
    const second = await cached.fetchDecision("fixture-001");

    expect(first.isError).toBe(false);
    expect(second.isError).toBe(false);
    expect(inner.fetchDecision).toHaveBeenCalledTimes(1);
    if (!second.isError) {
      expect(second.data.fullText).toBe(DECISION_TEXT);
      expect(second.metadata?.source).toBe("cache");
    }
  });

  it("stores the sourceHash, which is what lets HU-24 detect a changed source later", async () => {
    const repository = createInMemoryRepository();
    const cached = createCachedJurisprudenceProvider(innerProvider(), repository);

    await cached.fetchDecision("fixture-001");

    const stored = await repository.findDecision("fixture", "fixture-001");
    if (stored.isError || !stored.data) throw new Error("decisão não cacheada");
    expect(stored.data.sourceHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never caches search results — the court's catalogue changes over time", async () => {
    const inner = innerProvider();
    const cached = createCachedJurisprudenceProvider(inner, createInMemoryRepository());

    await cached.search({ query: "plano de saúde" });
    await cached.search({ query: "plano de saúde" });

    expect(inner.search).toHaveBeenCalledTimes(2);
  });

  it("propagates a fetch failure without poisoning the cache", async () => {
    const repository = createInMemoryRepository();
    const failing: JurisprudenceProvider = {
      name: "fixture",
      search: vi.fn(),
      fetchDecision: vi.fn(async () => ({
        isError: true as const,
        error: {
          isError: true as const,
          code: "FIXTURE_DECISION_NOT_FOUND",
          category: "NOT_FOUND" as const,
          severity: "ERROR" as const,
          description: "not found",
          isRetryable: false,
          timestamp: new Date().toISOString(),
        },
      })),
    };

    const cached = createCachedJurisprudenceProvider(failing, repository);
    const result = await cached.fetchDecision("fixture-001");

    expect(result.isError).toBe(true);
    const stored = await repository.findDecision("fixture", "fixture-001");
    if (!stored.isError) expect(stored.data).toBeUndefined();
  });

  it("exposes `fresh`, so Evidence Verification can bypass the cache (HU-24)", async () => {
    const inner = innerProvider();
    const cached = createCachedJurisprudenceProvider(inner, createInMemoryRepository());

    expect(cached.fresh).toBe(inner);
  });

  it("through `fresh`, still detects that the source changed after the scratchpad was written", async () => {
    const repository = createInMemoryRepository();
    const cached = createCachedJurisprudenceProvider(innerProvider(), repository);

    // A execução original passou pelo cache e gravou a decisão como estava.
    await cached.fetchDecision("fixture-001");

    // O tribunal republica a decisão (ex.: embargos de declaração acolhidos).
    const republished = createCachedJurisprudenceProvider(
      innerProvider(`${DECISION_TEXT} Retificada por embargos.`),
      repository,
    );

    const stale = scratchpad({
      source: { ...scratchpad().source, sourceHash: "hash-antigo" },
    });

    const result = await verifyEvidence([crossFileAnalysis()], [stale], republished.fresh);

    expect(result.isError).toBe(false);
    if (result.isError) return;
    expect(result.data.staleScratchpadIds).toEqual(["SP-1"]);
    expect(result.data.evidences[0]!.matchKind).toBe("SOURCE_CHANGED");
  });
});
