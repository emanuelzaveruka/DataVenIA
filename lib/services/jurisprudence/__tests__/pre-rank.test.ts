import { describe, expect, it } from "vitest";
import { buildPreRankingContext, rankCandidates, type PreRankingContext } from "../pre-rank";
import { SEARCH_CANDIDATE_LIMIT } from "../../../config/limits";
import type { CaseAnalysis } from "../../../schemas/case-analysis.schema";
import type { JurisprudenceSearchItem } from "../../../schemas/search.schema";

function fakeItem(overrides: Partial<JurisprudenceSearchItem> & { id: string }): JurisprudenceSearchItem {
  return {
    court: "TJPR",
    url: `https://portal.tjpr.jus.br/decisao/${overrides.id}`,
    source: "TJPR",
    ...overrides,
  };
}

describe("rankCandidates (HU-15)", () => {
  it("scores a candidate matching chamber and judge higher than one with no correspondence", () => {
    const context: PreRankingContext = {
      chamber: "1ª Câmara Cível",
      judge: "Des. Fulano de Tal",
      keywords: [],
    };
    const matching = fakeItem({ id: "match", chamber: "1ª Câmara Cível", judge: "Des. Fulano de Tal" });
    const nonMatching = fakeItem({ id: "no-match", chamber: "3ª Câmara Cível", judge: "Des. Outro" });

    const [first, second] = rankCandidates([nonMatching, matching], context);

    expect(first?.item.id).toBe("match");
    expect(second?.item.id).toBe("no-match");
    expect(first!.score).toBeGreaterThan(second!.score);
  });

  it("does not break when metadata is missing — falls back to proportional weight over computable criteria", () => {
    const context: PreRankingContext = { keywords: ["dano moral"] };
    const barebones = fakeItem({ id: "bare" });

    const [ranked] = rankCandidates([barebones], context);

    expect(ranked?.score).toBe(0);
    expect(ranked?.scoreBreakdown.sameClass).toBeNull();
    expect(ranked?.scoreBreakdown.sameSubject).toBeNull();
  });

  it("scores legal similarity via keyword overlap with title/summary", () => {
    const context: PreRankingContext = { keywords: ["responsabilidade objetiva", "dano moral"] };
    const similar = fakeItem({ id: "similar", summary: "Responsabilidade objetiva e dano moral configurados." });
    const unrelated = fakeItem({ id: "unrelated", summary: "Discussão sobre honorários advocatícios." });

    const [first, second] = rankCandidates([unrelated, similar], context);

    expect(first?.item.id).toBe("similar");
    expect(second?.item.id).toBe("unrelated");
  });

  it("truncates to searchCandidateLimit", () => {
    const context: PreRankingContext = { keywords: [] };
    const items = Array.from({ length: SEARCH_CANDIDATE_LIMIT + 10 }, (_, i) => fakeItem({ id: `item-${i}` }));

    const ranked = rankCandidates(items, context);

    expect(ranked).toHaveLength(SEARCH_CANDIDATE_LIMIT);
  });
});

describe("buildPreRankingContext", () => {
  it("derives context from CaseAnalysis without inventing fields", () => {
    const caseAnalysis: CaseAnalysis = {
      chamber: "2ª Câmara Cível",
      judge: "Des. Ciclano",
      parties: {},
      facts: [],
      requests: [],
      legalIssues: [
        { id: "issue-1", topic: "Dano moral", question: "Há dano moral?", relevance: "HIGH" },
      ],
      clientArguments: [],
      opposingArguments: [],
      citedLaws: [],
      citedPrecedents: [],
      evidenceSummary: [],
    };

    const context = buildPreRankingContext(caseAnalysis);

    expect(context.chamber).toBe("2ª Câmara Cível");
    expect(context.judge).toBe("Des. Ciclano");
    expect(context.keywords).toEqual(["Dano moral", "Há dano moral?"]);
  });
});
