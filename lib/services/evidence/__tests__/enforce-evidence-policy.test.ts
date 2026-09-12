import { describe, expect, it } from "vitest";
import { enforceEvidencePolicy } from "../enforce-evidence-policy";
import { crossFileAnalysis } from "./fixtures";
import type { VerifiedEvidence } from "../../../schemas/evidence.schema";

function evidence(evidenceId: string, scratchpadId: string, verified: boolean): VerifiedEvidence {
  return {
    evidenceId,
    scratchpadId,
    proposition: "Proposição.",
    quote: "trecho",
    context: "contexto",
    source: { url: "https://tjpr.jus.br/fixture", sourceHash: "hash" },
    verified,
    matchKind: verified ? "EXACT" : "NOT_FOUND",
    similarity: verified ? 1 : 0,
  };
}

describe("enforceEvidencePolicy", () => {
  it("removes an argument whose evidence was never verified, however plausible it reads (HU-25)", () => {
    const analyses = [crossFileAnalysis()];
    const result = enforceEvidencePolicy(analyses, [evidence("EV-2", "SP-2", true), evidence("EV-1", "SP-1", false)]);

    expect(result.analyses[0]!.suggestedArguments).toHaveLength(0);
    expect(result.analyses[0]!.risks).toHaveLength(1);
    expect(result.dropped).toContainEqual({
      legalIssueId: "LI-1",
      kind: "SUGGESTED_ARGUMENT",
      subject: "Sustentar a abusividade.",
      unverifiedEvidenceIds: ["EV-1"],
    });
  });

  it("removes a risk left without any verified evidence (HU-23/HU-25)", () => {
    const result = enforceEvidencePolicy([crossFileAnalysis()], [evidence("EV-1", "SP-1", true)]);

    expect(result.analyses[0]!.risks).toHaveLength(0);
    expect(result.dropped.some((claim) => claim.kind === "RISK")).toBe(true);
  });

  it("prunes unverified ids from a claim that still has at least one verified source", () => {
    const analyses = [
      crossFileAnalysis({
        suggestedArguments: [{ argument: "Sustentar a abusividade.", evidenceIds: ["EV-1", "EV-9"] }],
      }),
    ];

    const result = enforceEvidencePolicy(analyses, [evidence("EV-1", "SP-1", true), evidence("EV-9", "SP-1", false)]);

    expect(result.analyses[0]!.suggestedArguments[0]!.evidenceIds).toEqual(["EV-1"]);
  });

  it("drops a strongest precedent with no verified quote, so it is never shown as a source (§3.9)", () => {
    const result = enforceEvidencePolicy([crossFileAnalysis()], [evidence("EV-1", "SP-1", true)]);

    expect(result.analyses[0]!.strongestSupporting).toEqual(["SP-1"]);
    expect(result.analyses[0]!.strongestOpposing).toEqual([]);
    expect(result.dropped).toContainEqual({
      legalIssueId: "LI-1",
      kind: "STRONGEST_OPPOSING",
      subject: "SP-2",
      unverifiedEvidenceIds: [],
    });
  });

  it("keeps the sample counts untouched — they are the trend of the analyzed set, not a quoted claim (§3.10)", () => {
    const result = enforceEvidencePolicy([crossFileAnalysis()], []);

    expect(result.analyses[0]!.supportingDecisions).toEqual(["SP-1"]);
    expect(result.analyses[0]!.opposingDecisions).toEqual(["SP-2"]);
    expect(result.analyses[0]!.conclusion).toBe("Conclusão.");
  });

  it("empties every claim when nothing at all was verified (critério de aceite 15)", () => {
    const result = enforceEvidencePolicy([crossFileAnalysis()], [evidence("EV-1", "SP-1", false)]);

    expect(result.analyses[0]!.risks).toEqual([]);
    expect(result.analyses[0]!.suggestedArguments).toEqual([]);
    expect(result.analyses[0]!.strongestSupporting).toEqual([]);
    expect(result.verifiedEvidenceIds).toEqual([]);
  });
});
