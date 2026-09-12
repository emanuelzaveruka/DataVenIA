import { buildSearchQueryPlanSchema, type SearchQueryPlan } from "../../schemas/query-generation.schema";
import type { CaseAnalysis } from "../../schemas/case-analysis.schema";
import type { LlmProvider } from "../../llm/provider";
import { generateStructuredWithRetry } from "../../llm/generate-with-retry";
import { toolSuccess, type ToolResult } from "../../errors/tool-result";
import { buildQueryGenerationPrompt, QUERY_GENERATION_SYSTEM_PROMPT } from "./prompts";

/**
 * Query Generation (HU-11). Requer um CaseAnalysis com ao menos uma legalIssue (garantido por
 * HU-08 antes deste passo) — os ids dessas questões alimentam a validação de rastreabilidade
 * de cada query gerada.
 */
export async function generateSearchQueries(
  caseAnalysis: CaseAnalysis,
  provider: LlmProvider,
): Promise<ToolResult<SearchQueryPlan>> {
  const validLegalIssueIds = caseAnalysis.legalIssues.map((issue) => issue.id);
  const schema = buildSearchQueryPlanSchema(validLegalIssueIds);

  const result = await generateStructuredWithRetry(provider, {
    system: QUERY_GENERATION_SYSTEM_PROMPT,
    prompt: buildQueryGenerationPrompt(caseAnalysis),
    schema,
    schemaName: "SearchQueryPlan",
    schemaDescription: "Conjunto de queries de pesquisa de jurisprudência com justificativa.",
  });

  if (result.isError) return result;
  return toolSuccess(result.data);
}
