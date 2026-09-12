import { describe, expect, it } from "vitest";
import { applySearchFunnel } from "../search-funnel";
import { RAW_SEARCH_RESULTS_CAP } from "../../../config/limits";
import type { JurisprudenceSearchItem, JurisprudenceSearchResult } from "../../../schemas/search.schema";

function fakeItem(id: string): JurisprudenceSearchItem {
  return {
    id,
    court: "TJPR",
    url: `https://portal.tjpr.jus.br/decisao/${id}`,
    source: "TJPR",
  };
}

describe("applySearchFunnel (HU-13)", () => {
  it("passes through results within rawSearchResultsCap", () => {
    const items = [fakeItem("1"), fakeItem("2")];
    const result: JurisprudenceSearchResult = { items, totalCount: items.length };

    const funnelResult = applySearchFunnel(result);

    expect(funnelResult.isError).toBe(false);
    if (!funnelResult.isError) {
      expect(funnelResult.data).toEqual(items);
    }
  });

  it("blocks and asks for filters when totalCount exceeds the cap (real case: 3.970 for 'plano de saúde')", () => {
    const result: JurisprudenceSearchResult = { items: [], totalCount: 3970 };

    const funnelResult = applySearchFunnel(result);

    expect(funnelResult.isError).toBe(true);
    if (funnelResult.isError) {
      expect(funnelResult.error.code).toBe("SEARCH_RESULTS_EXCEED_CAP");
      expect(funnelResult.error.category).toBe("BUSINESS_RULE");
      expect(funnelResult.error.isRetryable).toBe(false);
      expect(funnelResult.error.metadata).toEqual({ totalCount: 3970, cap: RAW_SEARCH_RESULTS_CAP });
    }
  });

  it("treats a result exactly at the cap as acceptable (boundary)", () => {
    const result: JurisprudenceSearchResult = { items: [], totalCount: RAW_SEARCH_RESULTS_CAP };

    const funnelResult = applySearchFunnel(result);

    expect(funnelResult.isError).toBe(false);
  });
});
