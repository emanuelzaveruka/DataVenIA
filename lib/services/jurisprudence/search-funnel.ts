import { createAppError } from "../../errors/app-error";
import { toolFailure, toolSuccess, type ToolResult } from "../../errors/tool-result";
import { RAW_SEARCH_RESULTS_CAP } from "../../config/limits";
import type { JurisprudenceSearchItem, JurisprudenceSearchResult } from "../../schemas/search.schema";

/**
 * Funil de limites (HU-13, contexto-geral.md §6). Roda antes de qualquer pre-ranking: se o total
 * de resultados brutos exceder `rawSearchResultsCap`, a busca é bloqueada para o usuário refinar
 * com período/órgão julgador/relator em vez de o pipeline processar um volume não filtrado (caso
 * real observado: "plano de saúde" retornou 3.970 resultados, §4.2).
 */
export function applySearchFunnel(
  result: JurisprudenceSearchResult,
): ToolResult<JurisprudenceSearchItem[]> {
  if (result.totalCount > RAW_SEARCH_RESULTS_CAP) {
    return toolFailure(
      createAppError({
        code: "SEARCH_RESULTS_EXCEED_CAP",
        category: "BUSINESS_RULE",
        severity: "WARNING",
        description: `Search returned totalCount=${result.totalCount}, above rawSearchResultsCap=${RAW_SEARCH_RESULTS_CAP}`,
        userMessage:
          "A busca retornou um volume muito grande de decisões. Refine com período, órgão julgador ou relator antes de continuar.",
        isRetryable: false,
        operation: "applySearchFunnel",
        metadata: { totalCount: result.totalCount, cap: RAW_SEARCH_RESULTS_CAP },
      }),
    );
  }

  return toolSuccess(result.items);
}
