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

  it("corta no scratchpadLimit quando há candidatos de sobra", () => {
    const excedente = SCRATCHPAD_LIMIT + 10;
    const ranked = Array.from({ length: excedente }, (_, i) =>
      fakeCandidate(`item-${i}`, excedente - i, "1ª Câmara Cível"),
    );

    const result = selectForScratchpad(ranked);

    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.data).toHaveLength(SCRATCHPAD_LIMIT);
    }
  });

  it("seleciona todos quando há menos candidatos que o limite", () => {
    // Desde 2026-09-13 `SCRATCHPAD_LIMIT` é o próprio teto do pré-ranking (`docs/escopo.md`): a
    // seleção deixou de ser um segundo corte e o caso normal passou a ser "analisa tudo que veio".
    const ranked = Array.from({ length: 7 }, (_, i) => fakeCandidate(`item-${i}`, 7 - i, "1ª Câmara Cível"));

    const result = selectForScratchpad(ranked);

    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.data).toHaveLength(7);
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
