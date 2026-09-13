import type { JurisprudenceSearchItem, JurisprudenceSearchResult } from "../../schemas/search.schema";

/**
 * Funil de limites (HU-13, contexto-geral.md §6). O TJPR pode declarar milhares de resultados para
 * uma query útil, mas o pipeline só processa os itens efetivamente coletados na página/amostra.
 * `totalCount` alto não bloqueia nem avisa: é metadado de auditoria, não regra de produto.
 */
export function applySearchFunnel(
  result: JurisprudenceSearchResult,
): JurisprudenceSearchItem[] {
  return result.items;
}
