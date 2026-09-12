import { randomUUID } from "node:crypto";
import type { CaseAnalysis, LegalIssue } from "../../schemas/case-analysis.schema";
import type { CrossFileAnalysis } from "../../schemas/cross-file.schema";
import type { VerifiedEvidence } from "../../schemas/evidence.schema";
import type { DecisionScratchpad } from "../../schemas/scratchpad.schema";
import {
  FinalReportSchema,
  NO_OPPOSING_PRECEDENTS_NOTICE,
  REPORT_SCHEMA_VERSION,
  RESEARCH_DISCLAIMER,
  type FinalReport,
  type IssueClassification,
  type ReportClaim,
  type ReportDistinguishing,
  type ReportIssue,
  type ReportOmission,
  type ReportPrecedentItem,
  type ReportSource,
  type ReportTrend,
} from "../../schemas/report.schema";
import type { DroppedClaim } from "../evidence/enforce-evidence-policy";
import { isOfficialTjprUrl } from "../../config/official-sources";
import { createAppError } from "../../errors/app-error";
import { toolFailure, toolSuccess, type ToolResult } from "../../errors/tool-result";
import { containsForbiddenMetric } from "./forbidden-metrics";
import { buildTrend } from "./trend";

/**
 * HU-22 — quando a amostra tinha contrários mas nenhum sobreviveu à verificação, dizer "nenhum
 * precedente contrário identificado" seria falso. O relatório distingue os dois casos.
 */
export const UNVERIFIED_OPPOSING_PRECEDENTS_NOTICE =
  "Há precedentes contrários na amostra, mas nenhum trecho deles pôde ser conferido na fonte oficial — por isso não são exibidos.";

/**
 * Terceiro caso, pela mesma razão: sem análise cruzada para a questão, nada se sabe sobre a
 * amostra — afirmar que não havia contrários seria inventar um fato sobre decisões nunca reduzidas.
 */
export const NO_ANALYSIS_OPPOSING_NOTICE =
  "Esta questão não foi analisada contra a jurisprudência, então nada se sabe sobre precedentes contrários.";

export interface BuildReportInput {
  caseAnalysis: CaseAnalysis;
  /** Saída de `enforceEvidencePolicy` (HU-25) — nunca os Scratchpads nem o cross-file cru. */
  analyses: CrossFileAnalysis[];
  evidences: VerifiedEvidence[];
  scratchpads: DecisionScratchpad[];
  /** Omissões já registradas pela política de evidência, para o relatório consolidar tudo (§14). */
  policyDropped?: DroppedClaim[];
}

interface IssueContext {
  verifiedByScratchpad: Map<string, VerifiedEvidence[]>;
  verifiedById: Map<string, VerifiedEvidence>;
  scratchpadById: Map<string, DecisionScratchpad>;
  omissions: ReportOmission[];
}

/**
 * A mesma evidência sem provenance pode ser rejeitada em três lugares (ponto, risco, argumento).
 * O registro de omissões é auditoria para um humano ler — repetir a mesma linha três vezes só
 * atrapalha quem audita.
 */
function recordOmission(omissions: ReportOmission[], omission: ReportOmission): void {
  const duplicate = omissions.some(
    (existing) =>
      existing.legalIssueId === omission.legalIssueId &&
      existing.kind === omission.kind &&
      existing.subject === omission.subject,
  );
  if (!duplicate) omissions.push(omission);
}

/**
 * Converte a provenance de uma evidência verificada no contrato exibível. Devolve `undefined`
 * quando falta qualquer campo obrigatório ou a URL não é oficial: HU-27 manda bloquear **aquele
 * item**, não o relatório, então a ausência vira omissão registrada e o resto segue.
 */
function toReportSource(
  evidence: VerifiedEvidence,
  legalIssueId: string,
  omissions: ReportOmission[],
): ReportSource | undefined {
  const { source } = evidence;
  const missing = (["processNumber", "court", "chamber", "judge", "judgmentDate"] as const).filter(
    (field) => !source[field]?.trim(),
  );

  if (missing.length > 0) {
    recordOmission(omissions, {
      legalIssueId,
      kind: "MISSING_PROVENANCE",
      subject: evidence.evidenceId,
      reason: `Achado sem ${missing.join(", ")} — §3.10 exige precedente, Câmara, relator e data em todo item exibido.`,
    });
    return undefined;
  }

  if (!isOfficialTjprUrl(source.url)) {
    recordOmission(omissions, {
      legalIssueId,
      kind: "UNOFFICIAL_SOURCE_URL",
      subject: evidence.evidenceId,
      reason: `URL "${source.url}" não aponta para a fonte oficial do TJPR — o achado não seria rastreável (HU-27).`,
    });
    return undefined;
  }

  return {
    processNumber: source.processNumber!,
    court: source.court!,
    chamber: source.chamber!,
    judge: source.judge!,
    judgmentDate: source.judgmentDate!,
    url: source.url,
    sourceHash: source.sourceHash,
  };
}

function buildPrecedentItems(
  scratchpadIds: string[],
  analysis: CrossFileAnalysis,
  context: IssueContext,
): ReportPrecedentItem[] {
  const items: ReportPrecedentItem[] = [];

  for (const scratchpadId of scratchpadIds) {
    for (const evidence of context.verifiedByScratchpad.get(scratchpadId) ?? []) {
      const source = toReportSource(evidence, analysis.legalIssueId, context.omissions);
      if (!source) continue;

      // O argumento preferido é o que o cross-file escreveu citando exatamente este trecho; sem
      // ele, a `proposition` do próprio trecho (o `purpose` declarado no MAP) — nunca um texto
      // inventado aqui para preencher o campo.
      const citing = analysis.suggestedArguments.find((argument) =>
        argument.evidenceIds.includes(evidence.evidenceId),
      );

      items.push({
        argument: citing?.argument ?? evidence.proposition,
        quote: evidence.quote,
        context: evidence.context,
        evidenceId: evidence.evidenceId,
        scratchpadId,
        source,
      });
    }
  }

  return items;
}

/**
 * HU-25 reaplicado na camada de exibição. `enforceEvidencePolicy` já deveria ter removido isto,
 * mas a regra anti-alucinação não pode depender da disciplina de quem chama: aqui ela é
 * idempotente — sobre uma entrada já filtrada não remove nada.
 */
function buildClaims(
  claims: { statement: string; evidenceIds: string[] }[],
  legalIssueId: string,
  context: IssueContext,
): ReportClaim[] {
  return claims.flatMap((claim) => {
    const forbidden = containsForbiddenMetric(claim.statement);
    if (forbidden.blocked) {
      recordOmission(context.omissions, {
        legalIssueId,
        kind: "FORBIDDEN_METRIC",
        subject: claim.statement,
        reason: `Afirmação suprimida: expressa probabilidade de desfecho processual ("${forbidden.matched}"), vedado por §3.10.`,
      });
      return [];
    }

    const verified = claim.evidenceIds.filter((id) => context.verifiedById.get(id)?.verified);
    const sources = verified
      .map((id) => toReportSource(context.verifiedById.get(id)!, legalIssueId, context.omissions))
      .filter((source): source is ReportSource => source !== undefined);

    if (sources.length === 0) {
      recordOmission(context.omissions, {
        legalIssueId,
        kind: "UNVERIFIED_EVIDENCE",
        subject: claim.statement,
        reason: "Afirmação sem nenhuma evidência verificada na fonte original (HU-25).",
      });
      return [];
    }

    return [{ statement: claim.statement, evidenceIds: verified, sources }];
  });
}

/**
 * Distinguishing (§3.10/HU-23) vem dos Scratchpads, não de citação direta. Para não reintroduzir
 * afirmação sem lastro, só entram fatos de decisões que têm ao menos um trecho verificado — a
 * fonte exibida é a dessa evidência.
 */
function buildDistinguishing(
  analysis: CrossFileAnalysis,
  context: IssueContext,
): ReportDistinguishing[] {
  const citedIds = [
    ...analysis.supportingDecisions,
    ...analysis.opposingDecisions,
    ...analysis.mixedDecisions,
  ];

  const items: ReportDistinguishing[] = [];
  const seen = new Set<string>();

  for (const scratchpadId of citedIds) {
    if (seen.has(scratchpadId)) continue;
    seen.add(scratchpadId);

    const scratchpad = context.scratchpadById.get(scratchpadId);
    const anchor = (context.verifiedByScratchpad.get(scratchpadId) ?? [])[0];
    if (!scratchpad || !anchor) continue;

    const source = toReportSource(anchor, analysis.legalIssueId, context.omissions);
    if (!source) continue;

    for (const fact of scratchpad.distinguishingFacts) {
      items.push({ fact, scratchpadId, source });
    }
  }

  return items;
}

/**
 * HU-29 — a classificação nunca é forçada para um dos lados. Abaixo do mínimo de precedentes, ou
 * sem nenhum ponto com evidência verificada, o resultado é `INDETERMINADA` com o motivo explícito;
 * empate técnico é `JURISPRUDENCIA_DIVIDIDA`, que também não é um lado.
 */
function classifyIssue(
  trend: ReportTrend,
  favorable: ReportPrecedentItem[],
  contrary: ReportPrecedentItem[],
): { classification: IssueClassification; classificationReason: string } {
  if (favorable.length === 0 && contrary.length === 0) {
    return {
      classification: "INDETERMINADA",
      classificationReason:
        "Nenhum precedente com trecho verificado na fonte oficial sustenta ou contraria esta questão.",
    };
  }

  if (trend.convergence === "AMOSTRA_INSUFICIENTE") {
    return {
      classification: "INDETERMINADA",
      classificationReason: `Amostra pequena demais para afirmar tendência: ${trend.analyzedCount} decisão(ões) analisada(s).`,
    };
  }

  if (trend.convergence === "DIVIDIDA") {
    return {
      classification: "JURISPRUDENCIA_DIVIDIDA",
      classificationReason: `Decisões favoráveis e contrárias em número equivalente (${trend.supportingCount} x ${trend.opposingCount}).`,
    };
  }

  const favorableSide = trend.supportingCount > trend.opposingCount;
  return {
    classification: favorableSide ? "TENDENCIA_FAVORAVEL" : "TENDENCIA_CONTRARIA",
    classificationReason: `Convergência ${trend.convergence.toLowerCase()}: ${trend.summary}`,
  };
}

function buildIssue(
  issue: LegalIssue,
  analysis: CrossFileAnalysis | undefined,
  context: IssueContext,
): ReportIssue {
  if (!analysis) {
    const trend = buildTrend({ supportingCount: 0, opposingCount: 0, mixedCount: 0 });
    return {
      legalIssueId: issue.id,
      topic: issue.topic,
      question: issue.question,
      relevance: issue.relevance,
      classification: "INDETERMINADA",
      classificationReason: "A análise cruzada não produziu resultado para esta questão jurídica.",
      trend,
      recurringFactors: [],
      favorablePoints: [],
      contraryPoints: [],
      contraryPointsNotice: NO_ANALYSIS_OPPOSING_NOTICE,
      risks: [],
      distinguishing: [],
      suggestedArguments: [],
    };
  }

  const trend = buildTrend({
    supportingCount: analysis.supportingDecisions.length,
    opposingCount: analysis.opposingDecisions.length,
    mixedCount: analysis.mixedDecisions.length,
  });

  const favorablePoints = buildPrecedentItems(analysis.strongestSupporting, analysis, context);
  const contraryPoints = buildPrecedentItems(analysis.strongestOpposing, analysis, context);

  const conclusionCheck = containsForbiddenMetric(analysis.conclusion);
  if (conclusionCheck.blocked) {
    recordOmission(context.omissions, {
      legalIssueId: analysis.legalIssueId,
      kind: "FORBIDDEN_METRIC",
      subject: analysis.conclusion,
      reason: `Conclusão suprimida: expressa probabilidade de desfecho processual ("${conclusionCheck.matched}"), vedado por §3.10.`,
    });
  }

  const chamberPatternCheck = analysis.chamberPattern
    ? containsForbiddenMetric(analysis.chamberPattern)
    : { blocked: false };

  const sampleHasOpposition =
    analysis.opposingDecisions.length > 0 || analysis.mixedDecisions.length > 0;

  return {
    legalIssueId: issue.id,
    topic: issue.topic,
    question: issue.question,
    relevance: issue.relevance,
    ...classifyIssue(trend, favorablePoints, contraryPoints),
    conclusion: conclusionCheck.blocked ? undefined : analysis.conclusion,
    conclusionBlockedReason: conclusionCheck.blocked
      ? "Conclusão suprimida por conter métrica de probabilidade de êxito, vedada pela política do produto."
      : undefined,
    trend,
    chamberPattern: chamberPatternCheck.blocked ? undefined : analysis.chamberPattern,
    recurringFactors: analysis.recurringFactors,
    favorablePoints,
    contraryPoints,
    contraryPointsNotice:
      contraryPoints.length > 0
        ? undefined
        : sampleHasOpposition
          ? UNVERIFIED_OPPOSING_PRECEDENTS_NOTICE
          : NO_OPPOSING_PRECEDENTS_NOTICE,
    risks: buildClaims(
      analysis.risks.map((risk) => ({ statement: risk.description, evidenceIds: risk.evidenceIds })),
      issue.id,
      context,
    ),
    distinguishing: buildDistinguishing(analysis, context),
    suggestedArguments: buildClaims(
      analysis.suggestedArguments.map((argument) => ({
        statement: argument.argument,
        evidenceIds: argument.evidenceIds,
      })),
      issue.id,
      context,
    ),
  };
}

function policyOmissions(dropped: DroppedClaim[]): ReportOmission[] {
  return dropped.map((claim) => ({
    legalIssueId: claim.legalIssueId,
    kind: "UNVERIFIED_EVIDENCE" as const,
    subject: claim.subject,
    reason:
      claim.unverifiedEvidenceIds.length > 0
        ? `Removido pela regra anti-alucinação (HU-25): nenhuma das evidências ${claim.unverifiedEvidenceIds.join(", ")} foi verificada na fonte.`
        : "Removido pela regra anti-alucinação (HU-25): precedente sem nenhum trecho verificado na fonte.",
  }));
}

/**
 * Relatório final (§3.10, HU-26/27/28/29). Montado **sem chamada de modelo**: todo campo já existe
 * de forma estruturada depois da Fase 6, e uma última passada de LLM aqui seria exatamente a
 * oportunidade de reintroduzir alucinação no ponto em que §3.9 acabou de eliminá-la. O preço é que
 * o relatório não tem prosa redigida — tem estrutura rastreável, que é o que HU-27/§14 pedem.
 */
export function buildReport(input: BuildReportInput): ToolResult<FinalReport> {
  const { caseAnalysis, analyses, evidences, scratchpads } = input;

  if (caseAnalysis.legalIssues.length === 0) {
    return toolFailure(
      createAppError({
        code: "NO_LEGAL_ISSUES_FOR_REPORT",
        category: "BUSINESS_RULE",
        severity: "ERROR",
        description: "buildReport called with a CaseAnalysis that has zero legalIssues",
        userMessage: "Não há questões jurídicas analisadas para compor o relatório.",
        isRetryable: false,
        operation: "buildReport",
      }),
    );
  }

  const verifiedByScratchpad = new Map<string, VerifiedEvidence[]>();
  for (const evidence of evidences.filter((item) => item.verified)) {
    const bucket = verifiedByScratchpad.get(evidence.scratchpadId) ?? [];
    bucket.push(evidence);
    verifiedByScratchpad.set(evidence.scratchpadId, bucket);
  }

  const context: IssueContext = {
    verifiedByScratchpad,
    verifiedById: new Map(evidences.map((evidence) => [evidence.evidenceId, evidence])),
    scratchpadById: new Map(scratchpads.map((scratchpad) => [scratchpad.scratchpadId, scratchpad])),
    omissions: policyOmissions(input.policyDropped ?? []),
  };

  const byIssueId = new Map(analyses.map((analysis) => [analysis.legalIssueId, analysis]));
  const issues = caseAnalysis.legalIssues.map((issue) =>
    buildIssue(issue, byIssueId.get(issue.id), context),
  );

  const report: FinalReport = {
    reportId: randomUUID(),
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    disclaimer: RESEARCH_DISCLAIMER,
    caseSummary: {
      processNumber: caseAnalysis.processNumber,
      court: caseAnalysis.court,
      chamber: caseAnalysis.chamber,
      parties: {
        plaintiff: caseAnalysis.parties.plaintiff,
        defendant: caseAnalysis.parties.defendant,
      },
      requests: caseAnalysis.requests,
      facts: caseAnalysis.facts,
    },
    issues,
    sample: {
      analyzedDecisions: scratchpads.length,
      verifiedEvidence: evidences.filter((evidence) => evidence.verified).length,
      omittedItems: context.omissions.length,
    },
    omissions: context.omissions,
  };

  const parsed = FinalReportSchema.safeParse(report);
  if (!parsed.success) {
    return toolFailure(
      createAppError({
        code: "REPORT_ASSEMBLY_ERROR",
        category: "INTERNAL",
        severity: "FATAL",
        description: `Assembled FinalReport failed final validation: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")}`,
        isRetryable: false,
        operation: "buildReport",
      }),
    );
  }

  return toolSuccess(parsed.data);
}
