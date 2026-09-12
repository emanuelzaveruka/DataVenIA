import { randomUUID } from "node:crypto";
import {
  ScratchpadContentSchema,
  ScratchpadSchema,
  SCRATCHPAD_SCHEMA_VERSION,
  type DecisionScratchpad,
} from "../../schemas/scratchpad.schema";
import type { RankedCandidate } from "../../schemas/search.schema";
import type { LlmProvider } from "../../llm/provider";
import type { JurisprudenceProvider } from "../../providers/jurisprudence-provider";
import { generateStructuredWithRetry } from "../../llm/generate-with-retry";
import { createAppError } from "../../errors/app-error";
import { toolFailure, toolSuccess, type ToolResult } from "../../errors/tool-result";
import { hashBuffer } from "../document/hash";
import { NO_SCRATCHPAD_CACHE, type ScratchpadCache } from "../../persistence/scratchpad-cache";
import { buildScratchpadPrompt, SCRATCHPAD_SYSTEM_PROMPT } from "./prompts";

/**
 * `parseStructuredOutput` relata falhas de schema como uma lista de strings "path: message"
 * (lib/llm/validate-structured-output.ts). HU-17 exige que o campo faltante fique explícito em
 * `metadata.missingFields` — isto extrai só o "path" de cada issue.
 */
function extractMissingFields(issues: unknown): string[] {
  if (!Array.isArray(issues)) return [];
  return issues
    .filter((issue): issue is string => typeof issue === "string")
    .map((issue) => issue.split(":")[0]!.trim());
}

/**
 * Geração de Scratchpad para uma única decisão (HU-17: uma chamada de modelo por decisão, nunca
 * várias decisões na mesma chamada). Nunca lança — sempre devolve um ToolResult, para que
 * `generateScratchpads` (HU-19) possa isolar a falha de uma decisão sem afetar as demais.
 */
export async function generateScratchpad(
  candidate: RankedCandidate,
  provider: LlmProvider,
  jurisprudenceProvider: JurisprudenceProvider,
  cache: ScratchpadCache = NO_SCRATCHPAD_CACHE,
  signal?: AbortSignal,
): Promise<ToolResult<DecisionScratchpad>> {
  // HU-33 — a consulta ao cache vem antes do fetch e antes do modelo: reaproveitar depois de já
  // ter pago as duas chamadas não economizaria nada.
  const cached = await cache.find(candidate.item.id);
  if (cached) return toolSuccess(cached, { source: "cache" });

  const decisionResult = await jurisprudenceProvider.fetchDecision(candidate.item.id);
  if (decisionResult.isError) return decisionResult;

  const decision = decisionResult.data;
  const sourceText = decision.fullText ?? decision.summary ?? "";

  if (sourceText.trim().length === 0) {
    return toolFailure(
      createAppError({
        code: "EMPTY_DECISION_CONTENT",
        category: "VALIDATION",
        severity: "ERROR",
        description: `Decision "${candidate.item.id}" has neither fullText nor summary — nothing to analyze`,
        userMessage: "Uma das decisões selecionadas não tem texto disponível para análise.",
        isRetryable: false,
        operation: "generateScratchpad",
        metadata: { decisionId: candidate.item.id },
      }),
    );
  }

  const result = await generateStructuredWithRetry(provider, {
    system: SCRATCHPAD_SYSTEM_PROMPT,
    prompt: buildScratchpadPrompt(candidate, decision),
    schema: ScratchpadContentSchema,
    schemaName: "DecisionScratchpadContent",
    schemaDescription: "Análise estruturada de uma única decisão, classificada por proposição jurídica.",
    signal,
  });

  if (result.isError) {
    const { error } = result;
    if (error.category !== "STRUCTURED_OUTPUT") return result;

    return toolFailure(
      createAppError({
        code: "INVALID_SCRATCHPAD_SCHEMA",
        category: error.category,
        severity: error.severity,
        description: error.description,
        userMessage: error.userMessage,
        isRetryable: error.isRetryable,
        retryAfterMs: error.retryAfterMs,
        source: error.source,
        operation: error.operation,
        metadata: {
          ...error.metadata,
          missingFields: extractMissingFields(error.metadata?.issues),
        },
      }),
    );
  }

  const sourceHash = hashBuffer(Buffer.from(sourceText, "utf-8"));

  const scratchpad: DecisionScratchpad = {
    ...result.data,
    scratchpadId: randomUUID(),
    schemaVersion: SCRATCHPAD_SCHEMA_VERSION,
    source: {
      provider: "TJPR",
      sourceId: decision.id,
      url: decision.sourceUrl,
      processNumber: decision.processNumber,
      court: decision.court,
      chamber: candidate.item.chamber,
      judge: decision.rapporteur ?? candidate.item.judge,
      judgmentDate: decision.judgmentDate,
      sourceHash,
    },
    relevance: { ...result.data.relevance, score: candidate.score },
  };

  const parsed = ScratchpadSchema.safeParse(scratchpad);
  if (!parsed.success) {
    return toolFailure(
      createAppError({
        code: "SCRATCHPAD_ASSEMBLY_ERROR",
        category: "INTERNAL",
        severity: "FATAL",
        description: `Assembled DecisionScratchpad failed final validation: ${parsed.error.issues
          .map((issue) => issue.message)
          .join("; ")}`,
        isRetryable: false,
        operation: "generateScratchpad",
        metadata: { decisionId: candidate.item.id },
      }),
    );
  }

  await cache.save(candidate.item.id, parsed.data);

  return toolSuccess(parsed.data);
}
