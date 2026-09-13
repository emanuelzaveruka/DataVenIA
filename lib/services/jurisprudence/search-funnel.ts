import { BROAD_SEARCH_WARNING_THRESHOLD } from "../../config/limits";
import type { JurisprudenceSearchItem, JurisprudenceSearchResult } from "../../schemas/search.schema";

/**
 * Funil de limites (HU-13, contexto-geral.md §6). O TJPR pode declarar milhares de resultados para
 * uma query útil, mas o pipeline só processa os itens efetivamente coletados na página/amostra.
 * Por isso `totalCount` alto vira aviso de refinamento, não bloqueio da execução.
 */
export function applySearchFunnel(
  result: JurisprudenceSearchResult,
): { items: JurisprudenceSearchItem[]; broad: boolean } {
  return {
    items: result.items,
    broad: result.totalCount > BROAD_SEARCH_WARNING_THRESHOLD,
  };
}
