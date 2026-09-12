import type { RankedCandidate } from "../../schemas/search.schema";
import type { DecisionScratchpad } from "../../schemas/scratchpad.schema";
import type { LlmProvider } from "../../llm/provider";
import type { JurisprudenceProvider } from "../../providers/jurisprudence-provider";
import { createAppError, type AppError } from "../../errors/app-error";
import { toolFailure, toolSuccess, type ToolResult } from "../../errors/tool-result";
import { SCRATCHPAD_CONCURRENCY } from "../../config/limits";
import { runWithConcurrencyLimit } from "../../concurrency/run-with-concurrency-limit";
import { NO_SCRATCHPAD_CACHE, type ScratchpadCache } from "../../persistence/scratchpad-cache";
import { generateScratchpad } from "./generate-scratchpad";

export type ScratchpadBatchStatus = "SUCCESS" | "PARTIAL_SUCCESS";

export interface ScratchpadBatchFailure {
  candidateId: string;
  error: AppError;
}

export interface ScratchpadBatchResult {
  status: ScratchpadBatchStatus;
  requested: number;
  processed: number;
  failed: number;
  scratchpads: DecisionScratchpad[];
  failures: ScratchpadBatchFailure[];
}

/**
 * Orquestra a geração de Scratchpads para todas as decisões selecionadas (HU-17: até
 * `concurrency` chamadas simultâneas ao modelo, nunca uma chamada com várias decisões).
 *
 * Sobrevive a falha parcial (HU-19): o gate de "scratchpads válidos insuficientes para avançar" é
 * responsabilidade de `Workflow.advanceTo` (lib/workflow/state-machine.ts) — esta função apenas
 * produz as contagens corretas (`requested`/`processed`/`failed`) para quem for chamar `advanceTo`
 * depois; não decide, e não duplica, esse gate.
 */
export async function generateScratchpads(
  candidates: RankedCandidate[],
  provider: LlmProvider,
  jurisprudenceProvider: JurisprudenceProvider,
  concurrency: number = SCRATCHPAD_CONCURRENCY,
  cache: ScratchpadCache = NO_SCRATCHPAD_CACHE,
  signal?: AbortSignal,
): Promise<ToolResult<ScratchpadBatchResult>> {
  if (candidates.length === 0) {
    return toolFailure(
      createAppError({
        code: "NO_CANDIDATES_FOR_SCRATCHPAD",
        category: "BUSINESS_RULE",
        severity: "WARNING",
        description: "generateScratchpads called with zero candidates — nothing to process",
        isRetryable: false,
        operation: "generateScratchpads",
      }),
    );
  }

  const outcomes = await runWithConcurrencyLimit(
    candidates,
    (candidate) => generateScratchpad(candidate, provider, jurisprudenceProvider, cache, signal),
    concurrency,
    signal,
  );

  const scratchpads: DecisionScratchpad[] = [];
  const failures: ScratchpadBatchFailure[] = [];

  outcomes.forEach((outcome, index) => {
    if (outcome.isError) {
      failures.push({ candidateId: candidates[index]!.item.id, error: outcome.error });
    } else {
      scratchpads.push(outcome.data);
    }
  });

  return toolSuccess({
    status: failures.length === 0 ? "SUCCESS" : "PARTIAL_SUCCESS",
    requested: candidates.length,
    processed: scratchpads.length,
    failed: failures.length,
    scratchpads,
    failures,
  });
}
