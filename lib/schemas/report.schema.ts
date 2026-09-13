import { z } from "zod";
import { LEGAL_ISSUE_RELEVANCE } from "./case-analysis.schema";

export const REPORT_SCHEMA_VERSION = "1.0.0";

/**
 * Texto exato exigido por §7.2/HU-28. É `z.literal` no schema de propósito: o aviso não é uma
 * sugestão de copy que cada tela reescreve — um relatório sem exatamente esta frase não valida.
 */
export const RESEARCH_DISCLAIMER =
  "Resultado de apoio à pesquisa. Confirme a fonte e realize revisão jurídica independente.";

/**
 * HU-22 — a ausência de contrários é declarada, nunca silenciada pela simples falta da seção.
 */
export const NO_OPPOSING_PRECEDENTS_NOTICE =
  "Nenhum precedente contrário identificado na amostra.";

export const CONVERGENCE_LEVELS = ["ALTA", "MODERADA", "DIVIDIDA", "AMOSTRA_INSUFICIENTE"] as const;
export type ConvergenceLevel = (typeof CONVERGENCE_LEVELS)[number];

/**
 * HU-29 — `INDETERMINADA` é um resultado de primeira classe, não um erro nem um "sem dados". O
 * conjunto não tem rótulo binário forçado: quando a evidência não basta, a classificação diz isso.
 */
export const ISSUE_CLASSIFICATIONS = [
  "TENDENCIA_FAVORAVEL",
  "TENDENCIA_CONTRARIA",
  "JURISPRUDENCIA_DIVIDIDA",
  "INDETERMINADA",
] as const;
export type IssueClassification = (typeof ISSUE_CLASSIFICATIONS)[number];

/**
 * Provenance exibida em qualquer achado (HU-26 / HU-27 / critério de aceite 12). O objeto sempre
 * carrega os campos que a UI espera renderizar; quando o TJPR não entrega algum metadado, a camada
 * de relatório preenche explicitamente como "Não informado". A exigência rígida fica em URL oficial
 * e citação verificada, que são o núcleo da rastreabilidade.
 */
export const ReportSourceSchema = z.object({
  processNumber: z.string().min(1),
  court: z.string().min(1),
  chamber: z.string().min(1),
  judge: z.string().min(1),
  judgmentDate: z.string().min(1),
  url: z.string().url(),
  sourceHash: z.string().min(1),
});
export type ReportSource = z.infer<typeof ReportSourceSchema>;

export const ReportPrecedentItemSchema = z.object({
  argument: z.string().min(1),
  quote: z.string().min(1),
  context: z.string().min(1),
  evidenceId: z.string().min(1),
  scratchpadId: z.string().min(1),
  source: ReportSourceSchema,
});
export type ReportPrecedentItem = z.infer<typeof ReportPrecedentItemSchema>;

export const ReportClaimSchema = z.object({
  statement: z.string().min(1),
  /** Cadeia de HU-25 preservada no relatório: toda afirmação carrega os evidenceIds verificados. */
  evidenceIds: z.array(z.string().min(1)).min(1),
  sources: z.array(ReportSourceSchema).min(1),
});
export type ReportClaim = z.infer<typeof ReportClaimSchema>;

export const ReportDistinguishingSchema = z.object({
  fact: z.string().min(1),
  scratchpadId: z.string().min(1),
  source: ReportSourceSchema,
});
export type ReportDistinguishing = z.infer<typeof ReportDistinguishingSchema>;

/**
 * Tendência jurisprudencial (§3.10). As contagens existem porque a frase exibida é feita delas
 * ("6 de 10 decisões..."); `convergence` é rótulo qualitativo. Não há — e não pode haver — campo
 * de probabilidade de êxito.
 */
export const ReportTrendSchema = z.object({
  analyzedCount: z.number().int().nonnegative(),
  supportingCount: z.number().int().nonnegative(),
  opposingCount: z.number().int().nonnegative(),
  mixedCount: z.number().int().nonnegative(),
  summary: z.string().min(1),
  convergence: z.enum(CONVERGENCE_LEVELS),
});
export type ReportTrend = z.infer<typeof ReportTrendSchema>;

export const ReportIssueSchema = z.object({
  legalIssueId: z.string().min(1),
  topic: z.string().min(1),
  question: z.string().min(1),
  relevance: z.enum(LEGAL_ISSUE_RELEVANCE),
  classification: z.enum(ISSUE_CLASSIFICATIONS),
  /** Por que esta classificação e não outra — §14 exige que o pipeline responda isso. */
  classificationReason: z.string().min(1),
  conclusion: z.string().min(1).optional(),
  /** Preenchido quando a conclusão foi suprimida (ex.: continha métrica de chance de êxito). */
  conclusionBlockedReason: z.string().min(1).optional(),
  trend: ReportTrendSchema,
  chamberPattern: z.string().optional(),
  recurringFactors: z.array(z.string()),
  favorablePoints: z.array(ReportPrecedentItemSchema),
  contraryPoints: z.array(ReportPrecedentItemSchema),
  /** HU-22: presente exatamente quando `contraryPoints` está vazio. */
  contraryPointsNotice: z.string().min(1).optional(),
  risks: z.array(ReportClaimSchema),
  distinguishing: z.array(ReportDistinguishingSchema),
  suggestedArguments: z.array(ReportClaimSchema),
});
export type ReportIssue = z.infer<typeof ReportIssueSchema>;

export const ReportCaseSummarySchema = z.object({
  processNumber: z.string().optional(),
  court: z.string().optional(),
  chamber: z.string().optional(),
  parties: z.object({
    plaintiff: z.string().optional(),
    defendant: z.string().optional(),
  }),
  requests: z.array(z.string()),
  facts: z.array(z.string()),
});

export const REPORT_OMISSION_KINDS = [
  "UNVERIFIED_EVIDENCE",
  "MISSING_PROVENANCE",
  "UNOFFICIAL_SOURCE_URL",
  "FORBIDDEN_METRIC",
] as const;
export type ReportOmissionKind = (typeof REPORT_OMISSION_KINDS)[number];

/**
 * Tudo que o pipeline decidiu não exibir, com o motivo. §14 pede que o sistema responda
 * deterministicamente por que uma conclusão foi (ou não foi) gerada — sem este registro, "sumiu"
 * e "não existia" ficariam indistinguíveis para quem audita o relatório.
 */
export const ReportOmissionSchema = z.object({
  legalIssueId: z.string().min(1),
  kind: z.enum(REPORT_OMISSION_KINDS),
  subject: z.string().min(1),
  reason: z.string().min(1),
});
export type ReportOmission = z.infer<typeof ReportOmissionSchema>;

export const FinalReportSchema = z.object({
  reportId: z.string().min(1),
  schemaVersion: z.string().min(1),
  generatedAt: z.string().min(1),
  disclaimer: z.literal(RESEARCH_DISCLAIMER),
  caseSummary: ReportCaseSummarySchema,
  issues: z.array(ReportIssueSchema).min(1),
  sample: z.object({
    analyzedDecisions: z.number().int().nonnegative(),
    verifiedEvidence: z.number().int().nonnegative(),
    omittedItems: z.number().int().nonnegative(),
  }),
  omissions: z.array(ReportOmissionSchema),
});
export type FinalReport = z.infer<typeof FinalReportSchema>;
