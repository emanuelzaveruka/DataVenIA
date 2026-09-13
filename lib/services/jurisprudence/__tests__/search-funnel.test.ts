import { describe, expect, it } from "vitest";
import { applySearchFunnel } from "../search-funnel";
import {
  BROAD_SEARCH_WARNING_THRESHOLD,
  SEARCH_COLLECTED_ITEMS_CAP,
} from "../../../config/limits";
import type { JurisprudenceSearchItem, JurisprudenceSearchResult } from "../../../schemas/search.schema";

function fakeItem(id: string): JurisprudenceSearchItem {
  return {
    id,
    court: "TJPR",
    url: `https://portal.tjpr.jus.br/decisao/${id}`,
    source: "TJPR",
  };
}

function fakeItems(count: number): JurisprudenceSearchItem[] {
  return Array.from({ length: count }, (_, index) => fakeItem(String(index + 1)));
}

describe("applySearchFunnel (HU-13)", () => {
  it("deixa passar o que coube no teto de coleta", () => {
    const items = fakeItems(2);
    const result: JurisprudenceSearchResult = { items, totalCount: items.length };

    expect(applySearchFunnel(result)).toEqual({
      items,
      totalCount: 2,
      truncated: false,
      broad: false,
    });
  });

  it("corta no teto de coleta e sinaliza, em vez de descartar a busca", () => {
    const items = fakeItems(SEARCH_COLLECTED_ITEMS_CAP + 5);
    const funnel = applySearchFunnel({ items, totalCount: items.length });

    expect(funnel.items).toHaveLength(SEARCH_COLLECTED_ITEMS_CAP);
    expect(funnel.truncated).toBe(true);
  });

  it("busca ampla vira aviso, não falha (caso real: 3.970 para 'plano de saúde')", () => {
    const items = fakeItems(SEARCH_COLLECTED_ITEMS_CAP);
    const funnel = applySearchFunnel({ items, totalCount: 3970 });

    // Antes de 2026-09-13 isto derrubava a execução inteira. O total continua reportado — é o que
    // diz ao usuário que vale refinar —, mas quem decide o volume processado é o teto de coleta.
    expect(funnel.broad).toBe(true);
    expect(funnel.items).toHaveLength(SEARCH_COLLECTED_ITEMS_CAP);
  });

  it("total exatamente no limiar de aviso ainda não é considerado amplo (fronteira)", () => {
    const funnel = applySearchFunnel({
      items: fakeItems(1),
      totalCount: BROAD_SEARCH_WARNING_THRESHOLD,
    });

    expect(funnel.broad).toBe(false);
  });
});
