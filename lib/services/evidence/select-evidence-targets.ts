import { FINAL_EVIDENCE_LIMIT } from "../../config/limits";
import type { CrossFileAnalysis } from "../../schemas/cross-file.schema";
import type { DecisionScratchpad } from "../../schemas/scratchpad.schema";

/**
 * Escolhe quais decisões têm a fonte original reaberta na verificação (§3.9: "os melhores
 * precedentes selecionados no cross-file"), respeitando `finalEvidenceLimit` (§6: precedentes
 * usados no relatório final).
 *
 * A ordem de prioridade não é estética: decisões cujas citações sustentam riscos/argumentos vêm
 * primeiro porque, sem `VerifiedEvidence`, HU-25 remove justamente essas afirmações do relatório —
 * gastar o orçamento de verificação em outra decisão esvaziaria o relatório.
 */
export function selectEvidenceTargets(
  analyses: CrossFileAnalysis[],
  scratchpads: DecisionScratchpad[],
  limit: number = FINAL_EVIDENCE_LIMIT,
): DecisionScratchpad[] {
  const byId = new Map(scratchpads.map((scratchpad) => [scratchpad.scratchpadId, scratchpad]));

  const ownerOfEvidence = new Map<string, string>();
  for (const scratchpad of scratchpads) {
    for (const candidate of scratchpad.evidenceCandidates) {
      ownerOfEvidence.set(candidate.id, scratchpad.scratchpadId);
    }
  }

  const claimEvidenceIds = analyses.flatMap((analysis) => [
    ...analysis.risks.flatMap((risk) => risk.evidenceIds),
    ...analysis.suggestedArguments.flatMap((argument) => argument.evidenceIds),
  ]);

  const priorities: string[][] = [
    claimEvidenceIds.map((evidenceId) => ownerOfEvidence.get(evidenceId) ?? ""),
    analyses.flatMap((analysis) => [...analysis.strongestSupporting, ...analysis.strongestOpposing]),
    // §3.9 inclui explicitamente um precedente "distinguishing" na amostra reaberta.
    analyses
      .flatMap((analysis) => [...analysis.supportingDecisions, ...analysis.opposingDecisions, ...analysis.mixedDecisions])
      .filter((id) => (byId.get(id)?.distinguishingFacts.length ?? 0) > 0),
    analyses.flatMap((analysis) => [
      ...analysis.supportingDecisions,
      ...analysis.opposingDecisions,
      ...analysis.mixedDecisions,
    ]),
  ];

  const selected: DecisionScratchpad[] = [];
  const seen = new Set<string>();

  for (const tier of priorities) {
    for (const id of tier) {
      if (selected.length >= limit) return selected;
      if (seen.has(id)) continue;
      const scratchpad = byId.get(id);
      if (!scratchpad) continue;
      seen.add(id);
      selected.push(scratchpad);
    }
  }

  return selected;
}
