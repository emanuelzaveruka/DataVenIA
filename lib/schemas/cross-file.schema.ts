import { z } from "zod";

/**
 * Contrato de Cross-File Analysis (contexto-geral.md §3.8) — uma entrada por questão jurídica do
 * caso. É a etapa REDUCE do §2.3: recebe apenas `CaseAnalysis` + Scratchpads + IDs das decisões,
 * nunca os documentos originais.
 */
export const RiskSchema = z.object({
  description: z.string().min(1),
  /**
   * HU-23: um risco sem `evidenceIds` é afirmação genérica sem lastro e não pode chegar ao
   * relatório — a regra é estrutural aqui, não uma recomendação de prompt.
   */
  evidenceIds: z.array(z.string().min(1)).min(1),
});
export type Risk = z.infer<typeof RiskSchema>;

export const SuggestedArgumentSchema = z.object({
  argument: z.string().min(1),
  /**
   * HU-25: a cadeia `argumento → evidenceId → VerifiedEvidence → fonte original` começa aqui. Um
   * argumento sem `evidenceIds` não teria como ser verificado depois, então nem é aceito.
   */
  evidenceIds: z.array(z.string().min(1)).min(1),
});
export type SuggestedArgument = z.infer<typeof SuggestedArgumentSchema>;

export const CrossFileAnalysisSchema = z.object({
  legalIssueId: z.string().min(1),
  conclusion: z.string().min(1),
  supportingDecisions: z.array(z.string().min(1)),
  opposingDecisions: z.array(z.string().min(1)),
  mixedDecisions: z.array(z.string().min(1)),
  chamberPattern: z.string().optional(),
  recurringFactors: z.array(z.string()),
  strongestSupporting: z.array(z.string().min(1)),
  strongestOpposing: z.array(z.string().min(1)),
  risks: z.array(RiskSchema),
  suggestedArguments: z.array(SuggestedArgumentSchema),
});
export type CrossFileAnalysis = z.infer<typeof CrossFileAnalysisSchema>;

/**
 * Tudo que o código já conhece antes da chamada e que o modelo, portanto, não pode inventar
 * (HU-21: "nunca um ID inventado"). A integridade referencial é validada como parte do structured
 * output — assim uma violação vira uma falha de schema e entra automaticamente no retry com
 * contexto do erro de `generateStructuredWithRetry` (§11.7), em vez de virar um filtro silencioso.
 */
export interface CrossFileReferenceContext {
  legalIssueIds: readonly string[];
  scratchpadIds: readonly string[];
  evidenceIds: readonly string[];
  /** Há `holdings` com stance OPPOSES/MIXED entre os Scratchpads válidos (HU-22). */
  hasOpposingHoldings: boolean;
}

function unknownIds(ids: readonly string[], known: ReadonlySet<string>): string[] {
  return ids.filter((id) => !known.has(id));
}

function addIssue(ctx: z.RefinementCtx, path: (string | number)[], message: string): void {
  ctx.addIssue({ code: "custom", path, message });
}

function validateDecisionRefs(
  ctx: z.RefinementCtx,
  index: number,
  analysis: CrossFileAnalysis,
  knownScratchpads: ReadonlySet<string>,
): void {
  const buckets = ["supportingDecisions", "opposingDecisions", "mixedDecisions", "strongestSupporting", "strongestOpposing"] as const;

  for (const bucket of buckets) {
    const invented = unknownIds(analysis[bucket], knownScratchpads);
    if (invented.length > 0) {
      addIssue(
        ctx,
        ["analyses", index, bucket],
        `referencia scratchpadId inexistente: ${invented.join(", ")}. Use apenas os IDs de Scratchpad fornecidos.`,
      );
    }
  }

  const cited = new Set([...analysis.supportingDecisions, ...analysis.opposingDecisions, ...analysis.mixedDecisions]);
  if (cited.size === 0) {
    addIssue(
      ctx,
      ["analyses", index],
      "toda questão jurídica precisa de uma conclusão amparada em pelo menos uma decisão real (HU-21).",
    );
  }

  const supportSide = new Set([...analysis.supportingDecisions, ...analysis.mixedDecisions]);
  const opposeSide = new Set([...analysis.opposingDecisions, ...analysis.mixedDecisions]);

  const strayStrongest = unknownIds(analysis.strongestSupporting, supportSide);
  if (strayStrongest.length > 0) {
    addIssue(
      ctx,
      ["analyses", index, "strongestSupporting"],
      `só pode conter decisões já listadas em supportingDecisions/mixedDecisions; fora da lista: ${strayStrongest.join(", ")}.`,
    );
  }

  const strayOpposing = unknownIds(analysis.strongestOpposing, opposeSide);
  if (strayOpposing.length > 0) {
    addIssue(
      ctx,
      ["analyses", index, "strongestOpposing"],
      `só pode conter decisões já listadas em opposingDecisions/mixedDecisions; fora da lista: ${strayOpposing.join(", ")}.`,
    );
  }
}

function validateEvidenceRefs(
  ctx: z.RefinementCtx,
  index: number,
  analysis: CrossFileAnalysis,
  knownEvidence: ReadonlySet<string>,
): void {
  analysis.risks.forEach((risk, riskIndex) => {
    const invented = unknownIds(risk.evidenceIds, knownEvidence);
    if (invented.length > 0) {
      addIssue(
        ctx,
        ["analyses", index, "risks", riskIndex, "evidenceIds"],
        `referencia evidenceId inexistente: ${invented.join(", ")}. Use apenas os IDs de evidenceCandidates fornecidos.`,
      );
    }
  });

  analysis.suggestedArguments.forEach((argument, argumentIndex) => {
    const invented = unknownIds(argument.evidenceIds, knownEvidence);
    if (invented.length > 0) {
      addIssue(
        ctx,
        ["analyses", index, "suggestedArguments", argumentIndex, "evidenceIds"],
        `referencia evidenceId inexistente: ${invented.join(", ")}. Use apenas os IDs de evidenceCandidates fornecidos.`,
      );
    }
  });
}

function validateIssueCoverage(
  ctx: z.RefinementCtx,
  analyses: CrossFileAnalysis[],
  legalIssueIds: readonly string[],
): void {
  const seen = new Set<string>();
  const known = new Set(legalIssueIds);

  analyses.forEach((analysis, index) => {
    if (!known.has(analysis.legalIssueId)) {
      addIssue(
        ctx,
        ["analyses", index, "legalIssueId"],
        `"${analysis.legalIssueId}" não é uma questão jurídica do caso. Válidos: ${legalIssueIds.join(", ")}.`,
      );
    }
    if (seen.has(analysis.legalIssueId)) {
      addIssue(ctx, ["analyses", index, "legalIssueId"], `questão jurídica "${analysis.legalIssueId}" analisada mais de uma vez.`);
    }
    seen.add(analysis.legalIssueId);
  });

  const missing = legalIssueIds.filter((id) => !seen.has(id));
  if (missing.length > 0) {
    addIssue(ctx, ["analyses"], `faltam análises para as questões jurídicas: ${missing.join(", ")} (HU-21: cada legalIssue recebe uma conclusão).`);
  }
}

/**
 * HU-22 — "nunca omitir contrários para parecer melhor para o usuário". Se os Scratchpads válidos
 * contêm proposições OPPOSES/MIXED e a análise não aponta nenhuma decisão contrária ou mista em
 * nenhuma questão, o resultado é rejeitado: a amostra tinha contraditório e ele sumiu no reduce.
 */
function validateOppositionNotDropped(
  ctx: z.RefinementCtx,
  analyses: CrossFileAnalysis[],
  hasOpposingHoldings: boolean,
): void {
  if (!hasOpposingHoldings) return;

  const surfaced = analyses.some(
    (analysis) => analysis.opposingDecisions.length > 0 || analysis.mixedDecisions.length > 0,
  );
  if (!surfaced) {
    addIssue(
      ctx,
      ["analyses"],
      "os Scratchpads contêm proposições OPPOSES/MIXED, mas nenhuma análise apontou decisão contrária ou mista. Precedentes contrários nunca podem ser omitidos (HU-22).",
    );
  }
}

export const CrossFileAnalysisResponseShape = z.object({
  analyses: z.array(CrossFileAnalysisSchema),
});
export type CrossFileAnalysisResponse = z.infer<typeof CrossFileAnalysisResponseShape>;

/**
 * Fábrica do schema de saída estruturada do cross-file, fechado sobre os IDs reais daquela
 * execução. É o que impede um `scratchpadId`/`evidenceId` alucinado de atravessar a etapa.
 */
export function buildCrossFileAnalysisResponseSchema(
  context: CrossFileReferenceContext,
): z.ZodType<CrossFileAnalysisResponse> {
  const knownScratchpads = new Set(context.scratchpadIds);
  const knownEvidence = new Set(context.evidenceIds);

  return CrossFileAnalysisResponseShape.superRefine((data, ctx) => {
    validateIssueCoverage(ctx, data.analyses, context.legalIssueIds);
    data.analyses.forEach((analysis, index) => {
      validateDecisionRefs(ctx, index, analysis, knownScratchpads);
      validateEvidenceRefs(ctx, index, analysis, knownEvidence);
    });
    validateOppositionNotDropped(ctx, data.analyses, context.hasOpposingHoldings);
  });
}
