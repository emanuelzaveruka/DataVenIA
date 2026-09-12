import type { CrossFileAnalysis } from "../../schemas/cross-file.schema";
import type { DecisionScratchpad } from "../../schemas/scratchpad.schema";
import type { VerifiedEvidence } from "../../schemas/evidence.schema";
import type { JurisprudenceProvider } from "../../providers/jurisprudence-provider";
import { createAppError, type AppError } from "../../errors/app-error";
import { toolSuccess, type ToolResult } from "../../errors/tool-result";
import { FINAL_EVIDENCE_LIMIT, SCRATCHPAD_CONCURRENCY } from "../../config/limits";
import { runWithConcurrencyLimit } from "../../concurrency/run-with-concurrency-limit";
import { hashBuffer } from "../document/hash";
import { matchQuote } from "./quote-matching";
import { selectEvidenceTargets } from "./select-evidence-targets";

export interface EvidenceVerificationFailure {
  scratchpadId: string;
  error: AppError;
}

export interface EvidenceVerificationResult {
  evidences: VerifiedEvidence[];
  verifiedCount: number;
  rejectedCount: number;
  /**
   * Scratchpads cuja fonte mudou desde a coleta (`sourceHash` divergente, §11.8). Suas evidências
   * saem com `verified: false`: HU-24 manda reprocessar em vez de confiar em cache desatualizado,
   * e reprocessar é gerar o Scratchpad de novo (etapa MAP) — não é decisão desta etapa, que só
   * confere presença de citação (§2.3).
   */
  staleScratchpadIds: string[];
  failures: EvidenceVerificationFailure[];
}

interface DecisionVerification {
  scratchpadId: string;
  evidences: VerifiedEvidence[];
  stale: boolean;
  failure?: AppError;
}

function toVerifiedEvidence(
  scratchpad: DecisionScratchpad,
  candidate: DecisionScratchpad["evidenceCandidates"][number],
  sourceHash: string,
  match: { kind: VerifiedEvidence["matchKind"]; similarity: number },
): VerifiedEvidence {
  return {
    evidenceId: candidate.id,
    scratchpadId: scratchpad.scratchpadId,
    // O contrato de §3.6 não liga um `evidenceCandidate` a um holding específico; `purpose` é a
    // proposição que o próprio MAP declarou para aquele trecho. Nada aqui é inferido de novo.
    proposition: candidate.purpose,
    quote: candidate.quote,
    context: candidate.context,
    source: {
      processNumber: scratchpad.source.processNumber,
      court: scratchpad.source.court,
      chamber: scratchpad.source.chamber,
      judge: scratchpad.source.judge,
      judgmentDate: scratchpad.source.judgmentDate,
      url: scratchpad.source.url,
      sourceHash,
    },
    verified: match.kind === "EXACT" || match.kind === "ELIDED" || match.kind === "NEAR_LITERAL",
    matchKind: match.kind,
    similarity: match.similarity,
  };
}

async function verifyDecision(
  scratchpad: DecisionScratchpad,
  jurisprudenceProvider: JurisprudenceProvider,
): Promise<DecisionVerification> {
  const decisionResult = await jurisprudenceProvider.fetchDecision(scratchpad.source.sourceId);
  if (decisionResult.isError) {
    return { scratchpadId: scratchpad.scratchpadId, evidences: [], stale: false, failure: decisionResult.error };
  }

  const decision = decisionResult.data;
  const sourceText = decision.fullText ?? decision.summary ?? "";

  if (sourceText.trim().length === 0) {
    return {
      scratchpadId: scratchpad.scratchpadId,
      evidences: [],
      stale: false,
      failure: createAppError({
        code: "EMPTY_SOURCE_FOR_VERIFICATION",
        category: "UPSTREAM",
        severity: "ERROR",
        description: `Decision "${scratchpad.source.sourceId}" was reopened for verification but returned no text`,
        userMessage: "Não foi possível reabrir o texto original de uma das decisões para conferir as citações.",
        isRetryable: true,
        operation: "verifyEvidence",
        metadata: { scratchpadId: scratchpad.scratchpadId, sourceId: scratchpad.source.sourceId },
      }),
    };
  }

  const sourceHash = hashBuffer(Buffer.from(sourceText, "utf-8"));
  const stale = sourceHash !== scratchpad.source.sourceHash;

  const evidences = scratchpad.evidenceCandidates.map((candidate) =>
    stale
      ? toVerifiedEvidence(scratchpad, candidate, sourceHash, { kind: "SOURCE_CHANGED", similarity: 0 })
      : toVerifiedEvidence(scratchpad, candidate, sourceHash, matchQuote(sourceText, candidate.quote)),
  );

  return { scratchpadId: scratchpad.scratchpadId, evidences, stale };
}

/**
 * Evidence Verification (HU-24) — etapa VERIFY do §2.3. Reabre as decisões dos melhores
 * precedentes apontados pelo cross-file e confere cada citação contra o texto original. Não usa
 * modelo algum: é comparação determinística de texto, e por isso nunca "decide quem ganha".
 *
 * Nunca falha por inteiro quando uma decisão individual não abre: a falha fica isolada em
 * `failures` (mesma postura de HU-19), e as evidências daquela decisão simplesmente não ficam
 * disponíveis para o relatório — o que HU-25 já trata como motivo para remover a afirmação.
 */
export async function verifyEvidence(
  analyses: CrossFileAnalysis[],
  scratchpads: DecisionScratchpad[],
  jurisprudenceProvider: JurisprudenceProvider,
  limit: number = FINAL_EVIDENCE_LIMIT,
  concurrency: number = SCRATCHPAD_CONCURRENCY,
): Promise<ToolResult<EvidenceVerificationResult>> {
  const targets = selectEvidenceTargets(analyses, scratchpads, limit);

  const verifications = await runWithConcurrencyLimit(
    targets,
    (target) => verifyDecision(target, jurisprudenceProvider),
    concurrency,
  );

  const evidences = verifications.flatMap((verification) => verification.evidences);

  return toolSuccess({
    evidences,
    verifiedCount: evidences.filter((evidence) => evidence.verified).length,
    rejectedCount: evidences.filter((evidence) => !evidence.verified).length,
    staleScratchpadIds: verifications.filter((v) => v.stale).map((v) => v.scratchpadId),
    failures: verifications
      .filter((v): v is DecisionVerification & { failure: AppError } => v.failure !== undefined)
      .map((v) => ({ scratchpadId: v.scratchpadId, error: v.failure })),
  });
}
