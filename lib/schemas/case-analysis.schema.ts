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
