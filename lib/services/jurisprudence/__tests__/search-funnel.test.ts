import { describe, expect, it } from "vitest";
import { applySearchFunnel } from "../search-funnel";
import { BROAD_SEARCH_WARNING_THRESHOLD } from "../../../config/limits";
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
  it("passes through collected items and marks a narrow result as not broad", () => {
    const items = [fakeItem("1"), fakeItem("2")];
    const result: JurisprudenceSearchResult = { items, totalCount: items.length };

    const funnelResult = applySearchFunnel(result);

    expect(funnelResult.items).toEqual(items);
    expect(funnelResult.broad).toBe(false);
  });

  it("marks broad searches as a warning instead of blocking the run", () => {
    const items = [fakeItem("1")];
    const result: JurisprudenceSearchResult = { items, totalCount: 3970 };

    const funnelResult = applySearchFunnel(result);

    expect(funnelResult.items).toEqual(items);
    expect(funnelResult.broad).toBe(true);
  });

  it("treats a result exactly at the broad threshold as not broad (boundary)", () => {
    const result: JurisprudenceSearchResult = { items: [], totalCount: BROAD_SEARCH_WARNING_THRESHOLD };

    const funnelResult = applySearchFunnel(result);

    expect(funnelResult.broad).toBe(false);
  });
});
