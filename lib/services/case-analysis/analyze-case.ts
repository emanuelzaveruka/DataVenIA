import {
  assignLegalIssueIds,
  CaseAnalysisContentSchema,
  type CaseAnalysis,
} from "../../schemas/case-analysis.schema";
import type { SanitizedDocument } from "../../schemas/sanitization.schema";
import type { LlmProvider } from "../../llm/provider";
import { generateStructuredWithRetry } from "../../llm/generate-with-retry";
import { createAppError } from "../../errors/app-error";
import { toolFailure, toolSuccess, type ToolResult } from "../../errors/tool-result";
import { MIN_CASE_ANALYSIS_INPUT_CHARS } from "../../config/limits";
import { buildCaseAnalysisPrompt, CASE_ANALYSIS_SYSTEM_PROMPT } from "./prompts";

function countUsefulChars(text: string): number {
  return text.replace(/\s+/g, "").length;
}

/**
 * Case Understanding (HU-07/HU-08/HU-09). Roda somente sobre texto já sanitizado (HU-05) e
 * nunca sobre o documento bruto.
 */
export async function analyzeCase(
  document: SanitizedDocument,
  provider: LlmProvider,
  signal?: AbortSignal,
): Promise<ToolResult<CaseAnalysis>> {
  const usefulChars = countUsefulChars(document.sanitizedText);

  if (usefulChars < MIN_CASE_ANALYSIS_INPUT_CHARS) {
    return toolFailure(
      createAppError({
        code: "INSUFFICIENT_DOCUMENT_CONTENT",
        category: "VALIDATION",
        severity: "ERROR",
        description: `Sanitized document has only ${usefulChars} useful characters, below the minimum of ${MIN_CASE_ANALYSIS_INPUT_CHARS} required for Case Understanding`,
        userMessage:
          "O documento enviado não tem conteúdo suficiente para uma análise jurídica útil. Envie um documento mais completo.",
        isRetryable: false,
        operation: "analyzeCase",
        metadata: { documentId: document.documentId, usefulChars },
      }),
    );
  }

  const result = await generateStructuredWithRetry(provider, {
    system: CASE_ANALYSIS_SYSTEM_PROMPT,
    prompt: buildCaseAnalysisPrompt(document),
    schema: CaseAnalysisContentSchema,
    schemaName: "CaseAnalysis",
    schemaDescription: "Análise estruturada do caso extraída do documento jurídico.",
    signal,
  });

  if (result.isError) return result;

  if (result.data.legalIssues.length === 0) {
    return toolFailure(
      createAppError({
        code: "NO_LEGAL_ISSUES_IDENTIFIED",
        category: "BUSINESS_RULE",
        severity: "ERROR",
        description:
          "CaseAnalysis extraction returned zero legalIssues — no recognizable legal content in the document",
        userMessage:
          "Não foi possível identificar questões jurídicas no documento enviado. Verifique se o arquivo corresponde a uma peça jurídica.",
        isRetryable: false,
        operation: "analyzeCase",
        metadata: { documentId: document.documentId },
      }),
    );
  }

  // O `id` de cada questão jurídica é atribuído aqui, não pedido ao modelo: é a chave que liga
  // query, análise cruzada e relatório, e precisa ser estável e previsível.
  return toolSuccess(assignLegalIssueIds(result.data));
}
