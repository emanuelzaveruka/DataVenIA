import { z } from "zod";
import { CaseAnalysisSchema } from "./case-analysis.schema";
import { CrossFileAnalysisSchema } from "./cross-file.schema";
import { VerifiedEvidenceSchema } from "./evidence.schema";
import { FinalReportSchema } from "./report.schema";
import { ScratchpadSchema, SCRATCHPAD_STATUSES } from "./scratchpad.schema";
import { JurisprudenceQuerySchema, JurisprudenceSearchItemSchema } from "./search.schema";
import { WORKFLOW_STAGES, WORKFLOW_STATUSES } from "../workflow/state-machine";

/**
 * Linhas persistidas (contexto-geral.md §11.8). Cada tabela sugerida pelo contexto tem aqui o seu
 * contrato Zod, pelo mesmo motivo que toda saída de modelo tem: o que entra no banco é validado
 * estruturalmente, não confiado (§2.1/§11.7).
 *
 * Regra de privacidade que molda o desenho (HU-34/HU-05/HU-06): **não existe campo para o texto
 * bruto do documento do usuário**. `UploadedDocumentRecord` guarda só o texto já sanitizado, o
 * hash e o resumo de redações — a garantia é estrutural, não uma promessa de quem escreve o insert.
 */

export const AnalysisRunRecordSchema = z.object({
  runId: z.string().min(1),
  traceId: z.string().min(1),
  stage: z.enum(WORKFLOW_STAGES),
  status: z.enum(WORKFLOW_STATUSES),
  pipelineVersion: z.string().min(1),
  startedAt: z.string().min(1),
  finishedAt: z.string().optional(),
});
export type AnalysisRunRecord = z.infer<typeof AnalysisRunRecordSchema>;

export const UploadedDocumentRecordSchema = z.object({
  documentId: z.string().min(1),
  runId: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  /** Hash do arquivo original — permite reconhecer reenvio do mesmo documento sem guardá-lo. */
  contentHash: z.string().min(1),
  pageCount: z.number().int().positive().optional(),
  /** Já sanitizado (HU-05). O texto bruto nunca é persistido — não há coluna para ele. */
  sanitizedText: z.string(),
  redactions: z.array(
    z.object({ type: z.string(), marker: z.string(), count: z.number().int().positive() }),
  ),
  createdAt: z.string().min(1),
});
export type UploadedDocumentRecord = z.infer<typeof UploadedDocumentRecordSchema>;

export const CaseAnalysisRecordSchema = z.object({
  runId: z.string().min(1),
  documentId: z.string().min(1),
  content: CaseAnalysisSchema,
  createdAt: z.string().min(1),
});
export type CaseAnalysisRecord = z.infer<typeof CaseAnalysisRecordSchema>;

export const JurisprudenceSearchRecordSchema = z.object({
  searchId: z.string().min(1),
  runId: z.string().min(1),
  query: JurisprudenceQuerySchema,
  provider: z.string().min(1),
  totalCount: z.number().int().nonnegative(),
  items: z.array(JurisprudenceSearchItemSchema),
  createdAt: z.string().min(1),
});
export type JurisprudenceSearchRecord = z.infer<typeof JurisprudenceSearchRecordSchema>;

/**
 * Proveniência completa da decisão bruta (§11.8). É a única tabela que **não** pertence a uma
 * execução: jurisprudência é pública e é justamente o que HU-06 autoriza reter entre sessões, por
 * ser o que alimenta o cache de HU-33.
 */
export const JurisprudenceDecisionRecordSchema = z.object({
  provider: z.string().min(1),
  sourceId: z.string().min(1),
  processNumber: z.string().optional(),
  url: z.string().url(),
  court: z.string().optional(),
  chamber: z.string().optional(),
  judge: z.string().optional(),
  judgmentDate: z.string().optional(),
  rawText: z.string().optional(),
  rawHtml: z.string().optional(),
  sourceHash: z.string().min(1),
  fetchedAt: z.string().min(1),
});
export type JurisprudenceDecisionRecord = z.infer<typeof JurisprudenceDecisionRecordSchema>;

/**
 * §11.8 + §11.6: o Scratchpad guarda as quatro versões que o produziram. `idempotencyKey` é o
 * SHA256 de `decisionId + promptVersion + pipelineVersion + modelVersion` (HU-33) e é o que o
 * cache consulta — não o `decisionId` sozinho, senão um prompt novo reusaria resultado velho.
 */
export const DecisionScratchpadRecordSchema = z.object({
  scratchpadId: z.string().min(1),
  runId: z.string().min(1),
  decisionId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  schemaVersion: z.string().min(1),
  pipelineVersion: z.string().min(1),
  promptVersion: z.string().min(1),
  modelVersion: z.string().min(1),
  content: ScratchpadSchema,
  status: z.enum(SCRATCHPAD_STATUSES),
  createdAt: z.string().min(1),
});
export type DecisionScratchpadRecord = z.infer<typeof DecisionScratchpadRecordSchema>;

export const CrossFileAnalysisRecordSchema = z.object({
  runId: z.string().min(1),
  legalIssueId: z.string().min(1),
  content: CrossFileAnalysisSchema,
  createdAt: z.string().min(1),
});
export type CrossFileAnalysisRecord = z.infer<typeof CrossFileAnalysisRecordSchema>;

export const VerifiedEvidenceRecordSchema = z.object({
  runId: z.string().min(1),
  content: VerifiedEvidenceSchema,
  createdAt: z.string().min(1),
});
export type VerifiedEvidenceRecord = z.infer<typeof VerifiedEvidenceRecordSchema>;

export const FinalReportRecordSchema = z.object({
  reportId: z.string().min(1),
  runId: z.string().min(1),
  content: FinalReportSchema,
  createdAt: z.string().min(1),
});
export type FinalReportRecord = z.infer<typeof FinalReportRecordSchema>;

/**
 * §11.9 — uma linha por chamada de tool, incluindo cada tentativa de retry (`attempt`), para que
 * "reconstruir a sequência de tools chamadas, tentativas e resultado" (HU-35) seja uma query, não
 * uma leitura de log de texto.
 */
export const ToolExecutionLogSchema = z.object({
  traceId: z.string().min(1),
  workflowId: z.string().min(1),
  toolName: z.string().min(1),
  attempt: z.number().int().positive(),
  startedAt: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  success: z.boolean(),
  errorCode: z.string().optional(),
  isRetryable: z.boolean().optional(),
});
export type ToolExecutionLog = z.infer<typeof ToolExecutionLogSchema>;

/**
 * Erros persistidos com o mesmo contrato de §11.3 — `description` técnica e `userMessage` separada
 * continuam separadas no banco (HU-32), para que auditoria e tela nunca leiam o mesmo campo.
 */
export const ErrorRecordSchema = z.object({
  runId: z.string().min(1),
  traceId: z.string().min(1),
  code: z.string().min(1),
  category: z.string().min(1),
  severity: z.string().min(1),
  description: z.string().min(1),
  userMessage: z.string().optional(),
  isRetryable: z.boolean(),
  operation: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.string().min(1),
});
export type ErrorRecord = z.infer<typeof ErrorRecordSchema>;
