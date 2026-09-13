import { z } from "zod";

/**
 * MAIN_THESIS busca a tese principal do cliente, CONTRARY busca jurisprudência contrária e
 * RELATED representa termos extras fornecidos pelo usuário depois da geração do modelo.
 * Campo estruturado em vez de
 * inferir a intenção a partir do texto livre de `reason` (§2.1, Structured First) — é o que
 * permite validar de forma confiável a regra de negócio de HU-11 (precisa haver busca contrária).
 */
export const QUERY_INTENTS = ["MAIN_THESIS", "CONTRARY", "RELATED"] as const;
export type QueryIntent = (typeof QUERY_INTENTS)[number];

const MODEL_QUERY_INTENTS = ["MAIN_THESIS", "CONTRARY"] as const;

export const SearchQuerySchema = z.object({
  query: z.string().min(1),
  reason: z.string().min(1),
  intent: z.enum(QUERY_INTENTS),
  legalIssueId: z.string().min(1),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

const GeneratedSearchQuerySchema = SearchQuerySchema.extend({
  intent: z.enum(MODEL_QUERY_INTENTS),
});

const SearchQueryPlanShape = z.object({
  queries: z
    .array(GeneratedSearchQuerySchema)
    .length(2, "gere exatamente 2 queries: uma MAIN_THESIS e uma CONTRARY"),
});

/**
 * Schema com contexto do caso: valida que toda query referencia uma legalIssue real do
 * CaseAnalysis (rastreabilidade, HU-11) e que existe exatamente uma query MAIN_THESIS e
 * uma CONTRARY. Uma falha
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

    const mainCount = plan.queries.filter((searchQuery) => searchQuery.intent === "MAIN_THESIS").length;
    const contraryCount = plan.queries.filter((searchQuery) => searchQuery.intent === "CONTRARY").length;

    if (mainCount !== 1 || contraryCount !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["queries"],
        message:
          'O conjunto de queries deve conter exatamente uma query "MAIN_THESIS" e exatamente uma query "CONTRARY".',
      });
    }
  });
}

export type SearchQueryPlan = z.infer<typeof SearchQueryPlanShape>;
