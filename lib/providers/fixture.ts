import { createAppError } from "../errors/app-error";
import { toolFailure, toolSuccess, type ToolResult } from "../errors/tool-result";
import type { JurisprudenceQuery, JurisprudenceSearchResult, RawDecision } from "../schemas/search.schema";
import type { JurisprudenceProvider } from "./jurisprudence-provider";
import { FIXTURE_RAW_DECISIONS, FIXTURE_SEARCH_ITEMS } from "./fixtures/tjpr-demo-case";

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function queryTerms(query: string): string[] {
  return normalizeText(query)
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2);
}

function matchesTerms(item: (typeof FIXTURE_SEARCH_ITEMS)[number], terms: string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = normalizeText([item.title, item.summary].filter(Boolean).join(" "));
  return terms.some((term) => haystack.includes(term));
}

function applyFilters(
  items: readonly (typeof FIXTURE_SEARCH_ITEMS)[number][],
  filters: JurisprudenceQuery["filters"],
): (typeof FIXTURE_SEARCH_ITEMS)[number][] {
  if (!filters) return [...items];

  return items.filter((item) => {
    if (filters.judgingBody && item.chamber !== filters.judgingBody) return false;
    if (filters.judge && item.judge !== filters.judge) return false;
    if (filters.periodStart && (!item.judgmentDate || item.judgmentDate < filters.periodStart)) return false;
    if (filters.periodEnd && (!item.judgmentDate || item.judgmentDate > filters.periodEnd)) return false;
    return true;
  });
}

/**
 * `FixtureProvider` (HU-37) — respostas normalizadas salvas para demo/testes, mesma interface de
 * `TjprProvider` (§5). Garante que o pipeline complete todas as etapas mesmo sem conectividade
 * externa (Critério de aceite 16, §12): a busca nunca retorna vazia por falta de correspondência
 * de termos — quando nenhum item bate com a query, cai de volta ao catálogo completo em vez de
 * interromper a demonstração.
 */
export function createFixtureProvider(): JurisprudenceProvider {
  return {
    name: "fixture",

    async search(query: JurisprudenceQuery): Promise<ToolResult<JurisprudenceSearchResult>> {
      const terms = queryTerms(query.query);
      const textMatched = FIXTURE_SEARCH_ITEMS.filter((item) => matchesTerms(item, terms));
      const candidates = textMatched.length > 0 ? textMatched : FIXTURE_SEARCH_ITEMS;
      const items = applyFilters(candidates, query.filters);

      return toolSuccess({ items, totalCount: items.length }, { source: "fixture" });
    },

    async fetchDecision(decisionId: string): Promise<ToolResult<RawDecision>> {
      const decision = FIXTURE_RAW_DECISIONS.find((candidate) => candidate.id === decisionId);

      if (!decision) {
        return toolFailure(
          createAppError({
            code: "FIXTURE_DECISION_NOT_FOUND",
            category: "NOT_FOUND",
            severity: "ERROR",
            description: `No fixture RawDecision found for decisionId=${decisionId}`,
            userMessage: "Decisão não encontrada na fixture de demonstração.",
            isRetryable: false,
            operation: "fixtureProvider.fetchDecision",
            metadata: { decisionId },
          }),
        );
      }

      return toolSuccess(decision, { source: "fixture" });
    },
  };
}
