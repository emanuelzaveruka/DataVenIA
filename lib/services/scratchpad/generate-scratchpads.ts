import type { RankedCandidate } from "../../schemas/search.schema";
import type { DecisionScratchpad } from "../../schemas/scratchpad.schema";
import type { LlmProvider } from "../../llm/provider";
import type { JurisprudenceProvider } from "../../providers/jurisprudence-provider";
import { createAppError, type AppError } from "../../errors/app-error";
import { toolFailure, toolSuccess, type ToolResult } from "../../errors/tool-result";
import {
  SCRATCHPAD_CONCURRENCY,
  SCRATCHPAD_FETCH_CONCURRENCY,
  SCRATCHPAD_LLM_CONCURRENCY,
} from "../../config/limits";
import { runWithConcurrencyLimit } from "../../concurrency/run-with-concurrency-limit";
import { createConcurrencyLimiter } from "../../concurrency/create-concurrency-limiter";
import { NO_SCRATCHPAD_CACHE, type ScratchpadCache } from "../../persistence/scratchpad-cache";
import { generateScratchpad, type ScratchpadTiming } from "./generate-scratchpad";

export type ScratchpadBatchStatus = "SUCCESS" | "PARTIAL_SUCCESS";

export interface ScratchpadBatchFailure {
  candidateId: string;
  error: AppError;
}

/**
 * O que acontece com **uma** decisão dentro do lote, no instante em que acontece (HU-35). Existe
 * porque a etapa MAP é a mais longa do pipeline — uma chamada de modelo por decisão, em ondas de
 * `SCRATCHPAD_CONCURRENCY` — e o resultado agregado só chega no fim: sem isto, quem acompanha não
 * distingue "avançando devagar" de "travado".
 *
 * É um callback, e não um retorno: o serviço continua sem conhecer stream, HTTP ou log. Quem
 * escuta decide o que fazer com cada evento.
 */
export type ScratchpadProgressEvent =
  | { type: "STARTED"; index: number; candidateId: string; processNumber?: string }
  | { type: "FETCHING"; index: number; candidateId: string; processNumber?: string }
  | { type: "GENERATING"; index: number; candidateId: string; processNumber?: string }
  | {
      type: "FINISHED";
      index: number;
      candidateId: string;
      processNumber?: string;
      durationMs: number;
      /** `cache` quando HU-33 serviu o Scratchpad sem fetch nem modelo. */
      source: "cache" | "model";
      status: DecisionScratchpad["status"];
      timing?: ScratchpadTiming;
    }
  | {
      type: "FAILED";
      index: number;
      candidateId: string;
      processNumber?: string;
      durationMs: number;
      error: AppError;
      phase?: "fetch" | "model" | "unknown";
    };

export interface GenerateScratchpadsOptions {
  concurrency?: number;
  fetchConcurrency?: number;
  llmConcurrency?: number;
  cache?: ScratchpadCache;
  signal?: AbortSignal;
  onEvent?: (event: ScratchpadProgressEvent) => void;
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
  options: GenerateScratchpadsOptions = {},
): Promise<ToolResult<ScratchpadBatchResult>> {
  const {
    concurrency = SCRATCHPAD_CONCURRENCY,
    fetchConcurrency = concurrency === SCRATCHPAD_CONCURRENCY ? SCRATCHPAD_FETCH_CONCURRENCY : concurrency,
    llmConcurrency = concurrency === SCRATCHPAD_CONCURRENCY ? SCRATCHPAD_LLM_CONCURRENCY : concurrency,
    cache = NO_SCRATCHPAD_CACHE,
    signal,
    onEvent,
  } = options;

  // O contrato de `runWithConcurrencyLimit` é que o worker nunca rejeita: um listener que lança
  // abortaria a onda inteira e transformaria observabilidade em falha de análise.
  const notify = (event: ScratchpadProgressEvent): void => {
    try {
      onEvent?.(event);
    } catch (cause) {
      console.warn(`[scratchpads] listener de progresso falhou: ${String(cause)}`);
    }
  };

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

  const limitFetch = createConcurrencyLimiter(fetchConcurrency);
  const limitModel = createConcurrencyLimiter(llmConcurrency);

  const outcomes = await runWithConcurrencyLimit(
    candidates,
    async (candidate, index) => {
      const processNumber = candidate.item.processNumber;
      notify({ type: "STARTED", index, candidateId: candidate.item.id, processNumber });

      const startedAtMs = Date.now();
      let phase: "fetch" | "model" | "unknown" = "fetch";
      const outcome = await generateScratchpad(candidate, provider, jurisprudenceProvider, {
        cache,
        signal,
        limitFetch: (task) =>
          limitFetch(async () => {
            notify({ type: "FETCHING", index, candidateId: candidate.item.id, processNumber });
            return task();
          }),
        limitModel: (task) =>
          limitModel(async () => {
            phase = "model";
            notify({ type: "GENERATING", index, candidateId: candidate.item.id, processNumber });
            return task();
          }),
      });
      const durationMs = Date.now() - startedAtMs;

      notify(
        outcome.isError
          ? {
              type: "FAILED",
              index,
              candidateId: candidate.item.id,
              processNumber,
              durationMs,
              error: outcome.error,
              phase,
            }
          : {
              type: "FINISHED",
              index,
              candidateId: candidate.item.id,
              processNumber,
              durationMs,
              source: outcome.metadata?.source === "cache" ? "cache" : "model",
              status: outcome.data.status,
              timing: outcome.metadata?.timing as ScratchpadTiming | undefined,
            },
      );

      return outcome;
    },
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
