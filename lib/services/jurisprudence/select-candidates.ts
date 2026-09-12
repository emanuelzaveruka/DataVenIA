import { createAppError } from "../../errors/app-error";
import { toolFailure, toolSuccess, type ToolResult } from "../../errors/tool-result";
import { SCRATCHPAD_LIMIT } from "../../config/limits";
import type { RankedCandidate } from "../../schemas/search.schema";

const UNKNOWN_CHAMBER_KEY = "UNKNOWN";

/**
 * Seleção para Scratchpad (HU-16). Não pega apenas o top-N por score: intercala por Câmara em
 * round-robin (preservando a ordem de score dentro de cada Câmara) para garantir diversidade de
 * origem — pré-requisito para o Cross-File Analysis (§3.8/§3.9) ter material contrário para
 * comparar, em vez de apenas o cluster mais bem pontuado dominar as `scratchpadLimit` vagas.
 */
export function selectForScratchpad(ranked: RankedCandidate[]): ToolResult<RankedCandidate[]> {
  if (ranked.length === 0) {
    return toolFailure(
      createAppError({
        code: "NO_RELEVANT_JURISPRUDENCE_FOUND",
        category: "BUSINESS_RULE",
        severity: "WARNING",
        description: "Pre-ranking produced zero candidates — nothing to select for Scratchpad generation",
        userMessage: "Não foi encontrada jurisprudência relevante para este caso.",
        isRetryable: false,
        operation: "selectForScratchpad",
      }),
    );
  }

  const buckets = new Map<string, RankedCandidate[]>();
  for (const candidate of ranked) {
    const key = candidate.item.chamber ?? UNKNOWN_CHAMBER_KEY;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(candidate);
    else buckets.set(key, [candidate]);
  }

  // Cada bucket já vem ordenado por score desc, herdado de `ranked` (HU-15).
  const bucketQueues = Array.from(buckets.values());
  const selected: RankedCandidate[] = [];
  let cursor = 0;

  while (selected.length < SCRATCHPAD_LIMIT && bucketQueues.some((queue) => queue.length > 0)) {
    const queue = bucketQueues[cursor % bucketQueues.length];
    const next = queue?.shift();
    if (next) selected.push(next);
    cursor += 1;
  }

  return toolSuccess(selected);
}
