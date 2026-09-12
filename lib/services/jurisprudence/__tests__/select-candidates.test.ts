import { describe, expect, it } from "vitest";
import { selectForScratchpad } from "../select-candidates";
import { SCRATCHPAD_LIMIT } from "../../../config/limits";
import type { JurisprudenceSearchItem, RankedCandidate } from "../../../schemas/search.schema";

function fakeCandidate(id: string, score: number, chamber?: string): RankedCandidate {
  const item: JurisprudenceSearchItem = {
    id,
    court: "TJPR",
    chamber,
    url: `https://portal.tjpr.jus.br/decisao/${id}`,
    source: "TJPR",
  };
  return { item, score, scoreBreakdown: {} };
}

describe("selectForScratchpad (HU-16)", () => {
  it("rejects a selection that would result in zero decisions", () => {
    const result = selectForScratchpad([]);

    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("NO_RELEVANT_JURISPRUDENCE_FOUND");
      expect(result.error.category).toBe("BUSINESS_RULE");
    }
  });

  it("selects at most scratchpadLimit decisions out of 30 ranked candidates", () => {
    const ranked = Array.from({ length: 30 }, (_, i) => fakeCandidate(`item-${i}`, 30 - i, "1ª Câmara Cível"));

    const result = selectForScratchpad(ranked);

    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.data.length).toBeLessThanOrEqual(SCRATCHPAD_LIMIT);
      expect(result.data.length).toBe(SCRATCHPAD_LIMIT);
    }
  });

  it("does not let a single high-scoring chamber dominate all slots when other chambers have candidates", () => {
    const dominant = Array.from({ length: 20 }, (_, i) => fakeCandidate(`dominant-${i}`, 100 - i, "1ª Câmara Cível"));
    const minority = [fakeCandidate("minority-1", 10, "3ª Câmara Cível"), fakeCandidate("minority-2", 9, "3ª Câmara Cível")];
    const ranked = [...dominant, ...minority].sort((a, b) => b.score - a.score);

    const result = selectForScratchpad(ranked);

    expect(result.isError).toBe(false);
    if (!result.isError) {
      const chambers = new Set(result.data.map((candidate) => candidate.item.chamber));
      expect(chambers.has("3ª Câmara Cível")).toBe(true);
      expect(chambers.has("1ª Câmara Cível")).toBe(true);
    }
  });

  it("returns fewer than scratchpadLimit when there are not enough candidates", () => {
    const ranked = [fakeCandidate("only-one", 5, "1ª Câmara Cível")];

    const result = selectForScratchpad(ranked);

    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.data).toHaveLength(1);
    }
  });
});
