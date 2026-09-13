import type { CaseAnalysis } from "../../schemas/case-analysis.schema";
import type { DecisionScratchpad } from "../../schemas/scratchpad.schema";
import {
  buildCrossFileAnalysisResponseSchema,
  type CrossFileAnalysis,
  type CrossFileAnalysisResponse,
  type CrossFileOppositionGuard,
  type CrossFileReferenceContext,
} from "../../schemas/cross-file.schema";
import type { LlmProvider } from "../../llm/provider";
import { generateStructuredWithRetry } from "../../llm/generate-with-retry";
import { CROSS_FILE_MAX_OUTPUT_TOKENS } from "../../config/limits";
import { createAppError } from "../../errors/app-error";
import { toolFailure, toolSuccess, type ToolResult } from "../../errors/tool-result";
import { buildCrossFilePrompt, CROSS_FILE_SYSTEM_PROMPT } from "./prompts";

export interface CrossFileAnalysisResult {
  analyses: CrossFileAnalysis[];
  /**
   * HU-22 — quando `false`, o relatório final (Fase 7) precisa declarar explicitamente que nenhum
   * precedente contrário foi identificado na amostra, em vez de simplesmente não exibir a seção.
   */
  opposingPrecedentsFound: boolean;
  warnings?: string[];
}

const OPPOSITION_GUARD_WARNING =
  "A amostra contém holdings OPPOSES/MIXED, mas a análise cruzada não apontou decisões contrárias ou mistas. O relatório seguirá com aviso em vez de bloquear a execução.";

function oppositionGuardFromEnv(env: Partial<NodeJS.ProcessEnv> = process.env): CrossFileOppositionGuard {
  const configured = env.CROSS_FILE_OPPOSITION_GUARD?.trim().toLowerCase();
  if (configured === "strict") return "strict";
  return "warn";
}

/**
 * Só Scratchpads `VALID` alimentam o reduce: um Scratchpad PARTIAL/FAILED é análise que o próprio
 * MAP declarou não confiável, e HU-19/HU-21 falam de "Scratchpads válidos".
 */
export function filterValidScratchpads(scratchpads: DecisionScratchpad[]): DecisionScratchpad[] {
  return scratchpads.filter((scratchpad) => scratchpad.status === "VALID");
}

export function buildReferenceContext(
  caseAnalysis: CaseAnalysis,
  scratchpads: DecisionScratchpad[],
): CrossFileReferenceContext {
  return {
    legalIssueIds: caseAnalysis.legalIssues.map((issue) => issue.id),
    scratchpadIds: scratchpads.map((scratchpad) => scratchpad.scratchpadId),
    evidenceIds: scratchpads.flatMap((scratchpad) =>
      scratchpad.evidenceCandidates.map((candidate) => candidate.id),
    ),
    hasOpposingHoldings: scratchpads.some((scratchpad) =>
      scratchpad.holdings.some((holding) => holding.stance === "OPPOSES" || holding.stance === "MIXED"),
    ),
  };
}

/**
 * HU-22 — derivado em código a partir do resultado, nunca perguntado ao modelo: a ausência de
 * contrários é um fato sobre a amostra analisada, não uma opinião.
 */
export function hasOpposingPrecedents(analyses: CrossFileAnalysis[]): boolean {
  return analyses.some(
    (analysis) =>
      analysis.opposingDecisions.length > 0 ||
      analysis.mixedDecisions.length > 0 ||
      analysis.strongestOpposing.length > 0,
  );
}

/**
 * Cross-File Analysis (HU-21/HU-22/HU-23) — etapa REDUCE do §2.3. Recebe `CaseAnalysis` +
 * Scratchpads + IDs das decisões, **nunca** os documentos originais; a integridade referencial das
 * respostas (nenhum `scratchpadId`/`evidenceId` inventado) é parte do schema de saída, então uma
 * alucinação de ID vira falha de structured output e entra no retry com contexto do erro (§11.7),
 * em vez de ser filtrada silenciosamente.
 */
export async function analyzeCrossFile(
  caseAnalysis: CaseAnalysis,
  scratchpads: DecisionScratchpad[],
  provider: LlmProvider,
  signal?: AbortSignal,
): Promise<ToolResult<CrossFileAnalysisResult>> {
  const validScratchpads = filterValidScratchpads(scratchpads);

  if (validScratchpads.length === 0) {
    return toolFailure(
      createAppError({
        code: "NO_VALID_SCRATCHPADS",
        category: "BUSINESS_RULE",
        severity: "ERROR",
        description: "analyzeCrossFile called without any VALID scratchpad — nothing to reduce",
        userMessage: "Nenhuma decisão foi analisada com sucesso, então não há base para a análise cruzada.",
        isRetryable: false,
        operation: "analyzeCrossFile",
        metadata: { received: scratchpads.length },
      }),
    );
  }

  if (caseAnalysis.legalIssues.length === 0) {
    return toolFailure(
      createAppError({
        code: "NO_LEGAL_ISSUES_TO_ANALYZE",
        category: "BUSINESS_RULE",
        severity: "ERROR",
        description: "analyzeCrossFile called with a CaseAnalysis that has zero legalIssues",
        userMessage: "Não há questões jurídicas identificadas no caso para analisar contra a jurisprudência.",
        isRetryable: false,
        operation: "analyzeCrossFile",
      }),
    );
  }

  const context = buildReferenceContext(caseAnalysis, validScratchpads);
  const oppositionGuard = oppositionGuardFromEnv();

  const result = await generateStructuredWithRetry<CrossFileAnalysisResponse>(provider, {
    system: CROSS_FILE_SYSTEM_PROMPT,
    prompt: buildCrossFilePrompt(caseAnalysis, validScratchpads),
    schema: buildCrossFileAnalysisResponseSchema(context, { oppositionGuard }),
    schemaName: "CrossFileAnalysis",
    schemaDescription:
      "Análise cruzada dos Scratchpads válidos, uma entrada por questão jurídica do caso.",
    maxOutputTokens: CROSS_FILE_MAX_OUTPUT_TOKENS,
    signal,
  });

  if (result.isError) {
    const { error } = result;
    if (error.category !== "STRUCTURED_OUTPUT") return result;

    return toolFailure(
      createAppError({
        code: "INVALID_CROSS_FILE_ANALYSIS",
        category: error.category,
        severity: error.severity,
        description: error.description,
        userMessage:
          error.userMessage ??
          "Não foi possível consolidar a análise cruzada das decisões de forma confiável.",
        isRetryable: error.isRetryable,
        retryAfterMs: error.retryAfterMs,
        source: error.source,
        operation: "analyzeCrossFile",
        metadata: {
          ...error.metadata,
          validationIssues: error.metadata?.issues,
          scratchpadCount: validScratchpads.length,
          legalIssueCount: caseAnalysis.legalIssues.length,
        },
      }),
    );
  }

  const opposingPrecedentsFound = hasOpposingPrecedents(result.data.analyses);
  const warnings =
    oppositionGuard === "warn" && context.hasOpposingHoldings && !opposingPrecedentsFound
      ? [OPPOSITION_GUARD_WARNING]
      : undefined;

  return toolSuccess({
    analyses: result.data.analyses,
    opposingPrecedentsFound,
    warnings,
  });
}
