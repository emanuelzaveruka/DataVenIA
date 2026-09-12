import type { CrossFileAnalysis } from "../../schemas/cross-file.schema";
import type { VerifiedEvidence } from "../../schemas/evidence.schema";

export type DroppedClaimKind = "RISK" | "SUGGESTED_ARGUMENT" | "STRONGEST_SUPPORTING" | "STRONGEST_OPPOSING";

export interface DroppedClaim {
  legalIssueId: string;
  kind: DroppedClaimKind;
  /** Texto da afirmação removida, ou o `scratchpadId` quando o que caiu foi um precedente. */
  subject: string;
  /** IDs que a afirmação invocava e que não têm `VerifiedEvidence` correspondente. */
  unverifiedEvidenceIds: string[];
}

export interface EvidencePolicyResult {
  analyses: CrossFileAnalysis[];
  dropped: DroppedClaim[];
  verifiedEvidenceIds: string[];
}

function verifiedIdsOf(evidences: VerifiedEvidence[]): Set<string> {
  return new Set(evidences.filter((evidence) => evidence.verified).map((evidence) => evidence.evidenceId));
}

function scratchpadsWithVerifiedEvidence(evidences: VerifiedEvidence[]): Set<string> {
  return new Set(evidences.filter((evidence) => evidence.verified).map((evidence) => evidence.scratchpadId));
}

/**
 * HU-25 — regra anti-alucinação. É a camada que fecha a cadeia
 * `argumento → evidenceId → VerifiedEvidence → fonte original`: qualquer risco ou argumento sem ao
 * menos uma evidência verificada é REMOVIDO antes do relatório, por mais plausível que o texto
 * pareça. Também poda dos `evidenceIds` que sobram as citações não verificadas, para que o
 * relatório nunca exiba um link de "fonte" que a verificação reprovou.
 *
 * O que NÃO é removido, de propósito: `supportingDecisions`/`opposingDecisions`/`mixedDecisions`.
 * Essas listas são a contagem da amostra analisada ("6 de 10 decisões sustentam a tese", §3.10),
 * derivada dos Scratchpads — não são citações apresentadas ao usuário como fundamento. O que exige
 * evidência verificada é o precedente exibido com trecho e URL (`strongest*`) e toda afirmação
 * jurídica (riscos e argumentos).
 */
export function enforceEvidencePolicy(
  analyses: CrossFileAnalysis[],
  evidences: VerifiedEvidence[],
): EvidencePolicyResult {
  const verified = verifiedIdsOf(evidences);
  const backedScratchpads = scratchpadsWithVerifiedEvidence(evidences);
  const dropped: DroppedClaim[] = [];

  const filtered = analyses.map((analysis) => {
    const risks = analysis.risks.flatMap((risk) => {
      const kept = risk.evidenceIds.filter((id) => verified.has(id));
      if (kept.length > 0) return [{ ...risk, evidenceIds: kept }];
      dropped.push({
        legalIssueId: analysis.legalIssueId,
        kind: "RISK",
        subject: risk.description,
        unverifiedEvidenceIds: risk.evidenceIds,
      });
      return [];
    });

    const suggestedArguments = analysis.suggestedArguments.flatMap((argument) => {
      const kept = argument.evidenceIds.filter((id) => verified.has(id));
      if (kept.length > 0) return [{ ...argument, evidenceIds: kept }];
      dropped.push({
        legalIssueId: analysis.legalIssueId,
        kind: "SUGGESTED_ARGUMENT",
        subject: argument.argument,
        unverifiedEvidenceIds: argument.evidenceIds,
      });
      return [];
    });

    const keepPrecedent = (scratchpadId: string, kind: DroppedClaimKind): boolean => {
      if (backedScratchpads.has(scratchpadId)) return true;
      dropped.push({
        legalIssueId: analysis.legalIssueId,
        kind,
        subject: scratchpadId,
        unverifiedEvidenceIds: [],
      });
      return false;
    };

    return {
      ...analysis,
      strongestSupporting: analysis.strongestSupporting.filter((id) => keepPrecedent(id, "STRONGEST_SUPPORTING")),
      strongestOpposing: analysis.strongestOpposing.filter((id) => keepPrecedent(id, "STRONGEST_OPPOSING")),
      risks,
      suggestedArguments,
    };
  });

  return { analyses: filtered, dropped, verifiedEvidenceIds: [...verified] };
}
