import { z } from "zod";

export const LEGAL_ISSUE_RELEVANCE = ["HIGH", "MEDIUM", "LOW"] as const;
export type LegalIssueRelevance = (typeof LEGAL_ISSUE_RELEVANCE)[number];

export const LegalIssueSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  question: z.string().min(1),
  relevance: z.enum(LEGAL_ISSUE_RELEVANCE),
});
export type LegalIssue = z.infer<typeof LegalIssueSchema>;

export const CasePartiesSchema = z.object({
  plaintiff: z.string().optional(),
  defendant: z.string().optional(),
  others: z.array(z.string()).optional(),
});
export type CaseParties = z.infer<typeof CasePartiesSchema>;

/**
 * Contrato completo de Case Understanding (contexto-geral.md §3.2, HU-07/HU-08). Campos
 * opcionais ficam ausentes quando não identificáveis no documento — nunca preenchidos com
 * valor inventado.
 */
export const CaseAnalysisSchema = z.object({
  processNumber: z.string().optional(),
  court: z.string().optional(),
  chamber: z.string().optional(),
  judge: z.string().optional(),
  parties: CasePartiesSchema,
  caseClass: z.string().optional(),
  facts: z.array(z.string()),
  requests: z.array(z.string()),
  legalIssues: z.array(LegalIssueSchema),
  clientArguments: z.array(z.string()),
  opposingArguments: z.array(z.string()),
  citedLaws: z.array(z.string()),
  citedPrecedents: z.array(z.string()),
  evidenceSummary: z.array(z.string()),
});
export type CaseAnalysis = z.infer<typeof CaseAnalysisSchema>;

/**
 * O que o modelo produz: tudo menos o `id` das questões jurídicas.
 *
 * O `id` é a chave de rastreabilidade do pipeline inteiro — `SearchQuery.legalIssueId` (HU-11),
 * `CrossFileAnalysis.legalIssueId` (HU-21) e as omissões do relatório (§14) referenciam por ele.
 * Pedi-lo ao modelo produzia um identificador diferente a cada execução ("1", "issue-1",
 * "LI-01"...), e o modelo da etapa seguinte, sem um padrão a que se agarrar, inventava o seu.
 * Atribuir em código é a mesma regra que `ScratchpadSourceSchema` já aplica à identificação da
 * fonte: identificador é responsabilidade do pipeline, nunca do modelo.
 */
export const CaseAnalysisContentSchema = CaseAnalysisSchema.extend({
  legalIssues: z.array(LegalIssueSchema.omit({ id: true })),
});
export type CaseAnalysisContent = z.infer<typeof CaseAnalysisContentSchema>;

/** Formato estável e legível do identificador de questão jurídica: `LI-1`, `LI-2`, ... */
export function legalIssueId(index: number): string {
  return `LI-${index + 1}`;
}

export function assignLegalIssueIds(content: CaseAnalysisContent): CaseAnalysis {
  return {
    ...content,
    legalIssues: content.legalIssues.map((issue, index) => ({ ...issue, id: legalIssueId(index) })),
  };
}
