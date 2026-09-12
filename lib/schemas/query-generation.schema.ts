import { z } from "zod";

/**
 * MAIN_THESIS busca a tese principal do cliente, CONTRARY busca jurisprudência contrária,
 * RELATED busca teses correlatas (contexto-geral.md §3.3). Campo estruturado em vez de
 * inferir a intenção a partir do texto livre de `reason` (§2.1, Structured First) — é o que
 * permite validar de forma confiável a regra de negócio de HU-11 (precisa haver busca contrária).
 */
export const QUERY_INTENTS = ["MAIN_THESIS", "CONTRARY", "RELATED"] as const;
export type QueryIntent = (typeof QUERY_INTENTS)[number];

export const SearchQuerySchema = z.object({
  query: z.string().min(1),
  reason: z.string().min(1),
  intent: z.enum(QUERY_INTENTS),
  legalIssueId: z.string().min(1),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

const SearchQueryPlanShape = z.object({
  queries: z.array(SearchQuerySchema).min(1, "queries não pode ser vazio"),
});

/**
 * Schema com contexto do caso: valida que toda query referencia uma legalIssue real do
 * CaseAnalysis (rastreabilidade, HU-11) e que existe pelo menos uma query CONTRARY. Uma falha
 * aqui é tratada como STRUCTURED_OUTPUT — a mesma via de retry-com-contexto de HU-07 se aplica.
 */
export function buildSearchQueryPlanSchema(validLegalIssueIds: readonly string[]) {
  return SearchQueryPlanShape.superRefine((plan, ctx) => {
    plan.queries.forEach((searchQuery, index) => {
      if (!validLegalIssueIds.includes(searchQuery.legalIssueId)) {
        ctx.addIssue({
          code: "custom",
          path: ["queries", index, "legalIssueId"],
          message: `legalIssueId "${searchQuery.legalIssueId}" não corresponde a nenhuma legalIssue do CaseAnalysis.`,
        });
      }
    });

    if (!plan.queries.some((searchQuery) => searchQuery.intent === "CONTRARY")) {
      ctx.addIssue({
        code: "custom",
        path: ["queries"],
        message:
          'O conjunto de queries deve conter ao menos uma query com intent "CONTRARY" (jurisprudência contrária).',
      });
    }
  });
}

export type SearchQueryPlan = z.infer<typeof SearchQueryPlanShape>;
