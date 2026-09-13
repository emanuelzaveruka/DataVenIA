import { describe, expect, it } from "vitest";
import { applySearchFunnel } from "../search-funnel";
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
  it("passes through collected items regardless of the provider totalCount", () => {
    const items = [fakeItem("1"), fakeItem("2")];
    const result: JurisprudenceSearchResult = { items, totalCount: 3970 };

    const funnelResult = applySearchFunnel(result);

    expect(funnelResult).toEqual(items);
  });
});
