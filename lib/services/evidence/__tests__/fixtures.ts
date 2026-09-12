import { createHash } from "node:crypto";
import type { CrossFileAnalysis } from "../../../schemas/cross-file.schema";
import type { DecisionScratchpad } from "../../../schemas/scratchpad.schema";

export const DECISION_TEXT_1 =
  "A negativa de cobertura do tratamento prescrito pelo médico assistente é abusiva, nos termos da Súmula 608 do STJ.";
export const DECISION_TEXT_2 =
  "O mero inadimplemento contratual não gera dano moral indenizável, salvo circunstância excepcional.";

export function hashOf(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf-8")).digest("hex");
}

export function scratchpadFor(
  id: string,
  sourceId: string,
  text: string,
  candidates: DecisionScratchpad["evidenceCandidates"],
  overrides: Partial<DecisionScratchpad> = {},
): DecisionScratchpad {
  return {
    scratchpadId: id,
    schemaVersion: "1.0.0",
    source: {
      provider: "TJPR",
      sourceId,
      url: `https://tjpr.jus.br/${sourceId}`,
      processNumber: "0001234-56.2024.8.16.0001",
      court: "TJPR",
      chamber: "5ª Câmara Cível",
      judge: "Des. Fulano",
      judgmentDate: "2024-03-10",
      sourceHash: hashOf(text),
    },
    relevance: { score: 0.9, reason: "Mesma tese." },
    caseSummary: "Resumo.",
    facts: [],
    legalIssues: [],
    holdings: [{ proposition: "Proposição", stance: "SUPPORTS", reasoning: "Motivo." }],
    favorablePoints: [],
    contraryPoints: [],
    distinguishingFacts: [],
    citedLaws: [],
    citedPrecedents: [],
    evidenceCandidates: candidates,
    confidence: 0.9,
    status: "VALID",
    ...overrides,
  };
}

export function crossFileAnalysis(overrides: Partial<CrossFileAnalysis> = {}): CrossFileAnalysis {
  return {
    legalIssueId: "LI-1",
    sampleCoverage: "COVERED",
    conclusion: "Conclusão.",
    supportingDecisions: ["SP-1"],
    opposingDecisions: ["SP-2"],
    mixedDecisions: [],
    recurringFactors: [],
    strongestSupporting: ["SP-1"],
    strongestOpposing: ["SP-2"],
    risks: [{ description: "Dano moral pode ser afastado.", evidenceIds: ["EV-2"] }],
    suggestedArguments: [{ argument: "Sustentar a abusividade.", evidenceIds: ["EV-1"] }],
    ...overrides,
  };
}
