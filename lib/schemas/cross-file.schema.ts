import { z } from "zod";

/**
 * Contrato de Cross-File Analysis (contexto-geral.md §3.8) — uma entrada por questão jurídica do
 * caso. É a etapa REDUCE do §2.3: recebe apenas `CaseAnalysis` + Scratchpads + IDs das decisões,
 * nunca os documentos originais.
 */
/**
 * As mensagens de `.min(1)` abaixo não são cosméticas: `withRetryFeedback`
 * (`lib/llm/generate-with-retry.ts`) devolve ao modelo o texto literal do erro de validação, e o
 * texto padrão do Zod ("Too small: expected array to have >=1 items") descreve a violação sem
 * dizer o que fazer com ela. Um modelo que acabou de escrever uma afirmação sem citação lê isso e
 * tende a inventar um evidenceId para preencher a lista. A mensagem precisa nomear a saída válida
 * — remover a afirmação — como a correção esperada.
 */
const EVIDENCE_REQUIRED_MESSAGE =
  "toda afirmação precisa apontar ao menos um evidenceId real dos evidenceCandidates fornecidos. Se nenhum trecho sustenta esta afirmação, REMOVA a afirmação inteira da lista em vez de enviar evidenceIds vazio — nunca invente um id para preencher o campo (HU-23/HU-25).";

export const RiskSchema = z.object({
  description: z.string().min(1),
  /**
   * HU-23: um risco sem `evidenceIds` é afirmação genérica sem lastro e não pode chegar ao
   * relatório — a regra é estrutural aqui, não uma recomendação de prompt.
   */
  evidenceIds: z.array(z.string().min(1)).min(1, EVIDENCE_REQUIRED_MESSAGE),
});
export type Risk = z.infer<typeof RiskSchema>;

export const SuggestedArgumentSchema = z.object({
  argument: z.string().min(1),
  /**
   * HU-25: a cadeia `argumento → evidenceId → VerifiedEvidence → fonte original` começa aqui. Um
   * argumento sem `evidenceIds` não teria como ser verificado depois, então nem é aceito.
   */
  evidenceIds: z.array(z.string().min(1)).min(1, EVIDENCE_REQUIRED_MESSAGE),
});
export type SuggestedArgument = z.infer<typeof SuggestedArgumentSchema>;

/**
 * HU-21/HU-29 — "a amostra não trata desta questão" é um resultado legítimo, não um erro. Sem este
 * campo o schema tornava o estado *irrepresentável*: `validateIssueCoverage` exige uma análise para
 * cada questão jurídica e `validateCoverage` exige pelo menos uma decisão real por análise, de modo
 * que uma questão sem cobertura na jurisprudência recuperada só podia terminar em falha de
 * structured output — e o retry com contexto do erro (§11.7) empurrava o modelo a inventar o
 * vínculo entre uma decisão qualquer e a questão, exatamente a alucinação que HU-21 existe para
 * impedir. `default("COVERED")` mantém a regra antiga para quem omite o campo (inclusive registros
 * gravados antes desta versão): declarar a não-cobertura é um ato explícito, nunca o silêncio.
 */
export const SAMPLE_COVERAGE = ["COVERED", "NOT_COVERED"] as const;
export type SampleCoverage = (typeof SAMPLE_COVERAGE)[number];

export const CrossFileAnalysisSchema = z.object({
  legalIssueId: z.string().min(1),
  sampleCoverage: z.enum(SAMPLE_COVERAGE).default("COVERED"),
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

/**
 * HU-21 tem dois lados, e o schema precisa dos dois. Uma análise `COVERED` sem nenhuma decisão real
 * é conclusão sem lastro e continua sendo rejeitada; uma análise `NOT_COVERED` é a declaração
 * explícita de que **a amostra** não trata da questão — e por isso não pode listar decisão,
 * precedente forte, fator recorrente, padrão de Câmara, risco ou argumento: todos eles só existem
 * apoiados nas decisões analisadas. A mensagem do caso `COVERED` aponta a saída válida de propósito:
 * sem ela o retry com contexto do erro (§11.7) só oferecia ao modelo o caminho de inventar o
 * vínculo com uma decisão qualquer.
 */
function validateCoverage(ctx: z.RefinementCtx, index: number, analysis: CrossFileAnalysis): void {
  const cited = new Set([
    ...analysis.supportingDecisions,
    ...analysis.opposingDecisions,
    ...analysis.mixedDecisions,
    ...analysis.strongestSupporting,
    ...analysis.strongestOpposing,
  ]);

  if (analysis.sampleCoverage === "NOT_COVERED") {
    if (cited.size > 0) {
      addIssue(
        ctx,
        ["analyses", index, "sampleCoverage"],
        `"NOT_COVERED" declara que nenhuma decisão analisada trata desta questão, mas a análise lista ${[...cited].join(", ")}. Se alguma decisão trata da questão, use "COVERED".`,
      );
    }

    const unfounded = (
      [
        ["risks", analysis.risks.length],
        ["suggestedArguments", analysis.suggestedArguments.length],
        ["recurringFactors", analysis.recurringFactors.length],
        ["chamberPattern", analysis.chamberPattern ? 1 : 0],
      ] as const
    ).filter(([, count]) => count > 0);

    if (unfounded.length > 0) {
      addIssue(
        ctx,
        ["analyses", index, "sampleCoverage"],
        `"NOT_COVERED" não admite ${unfounded.map(([field]) => field).join(", ")}: sem decisão que trate da questão, não há nada na amostra para sustentar essas afirmações.`,
      );
    }
    return;
  }

  if (cited.size === 0) {
    addIssue(
      ctx,
      ["analyses", index],
      'toda questão jurídica precisa de uma conclusão amparada em pelo menos uma decisão real (HU-21). Se nenhuma das decisões analisadas trata desta questão, declare sampleCoverage: "NOT_COVERED" com as listas vazias — nunca vincule uma decisão que não trata do tema só para preencher o campo.',
    );
  }
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

  validateCoverage(ctx, index, analysis);

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

  // Quando nenhuma questão foi coberta pela amostra, não há contraditório a omitir — só não há
  // análise. Exigir aqui um contrário que nenhuma análise pode listar transformaria uma resposta
  // honesta ("essas decisões não tratam do caso") em falha permanente de structured output.
  if (!analyses.some((analysis) => analysis.sampleCoverage === "COVERED")) return;

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
