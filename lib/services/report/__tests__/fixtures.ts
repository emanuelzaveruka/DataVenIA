import type { CaseAnalysis } from "../../../schemas/case-analysis.schema";
import type { CrossFileAnalysis } from "../../../schemas/cross-file.schema";
import type { VerifiedEvidence } from "../../../schemas/evidence.schema";
import type { DecisionScratchpad } from "../../../schemas/scratchpad.schema";

export const OFFICIAL_URL = "https://portal.tjpr.jus.br/jurisprudencia/publico/#/decisao/fixture-001";

export function caseAnalysis(overrides: Partial<CaseAnalysis> = {}): CaseAnalysis {
  return {
    processNumber: "0009999-11.2025.8.16.0001",
    court: "TJPR",
    chamber: "9ª Câmara Cível",
    parties: { plaintiff: "[PARTE_1]", defendant: "Operadora de plano de saúde" },
    facts: ["Negativa de cobertura de cirurgia prescrita pelo médico assistente."],
    requests: ["Cobertura do procedimento", "Indenização por dano moral"],
    legalIssues: [
      { id: "LI-1", topic: "Abusividade da negativa", question: "A negativa é abusiva?", relevance: "HIGH" },
    ],
    clientArguments: ["Prescrição médica expressa."],
    opposingArguments: ["Exclusão contratual."],
    citedLaws: ["Lei 9.656/1998"],
    citedPrecedents: [],
    evidenceSummary: [],
    ...overrides,
  };
}

export function scratchpad(
  scratchpadId: string,
  overrides: Partial<DecisionScratchpad> = {},
): DecisionScratchpad {
  return {
    scratchpadId,
    schemaVersion: "1.0.0",
    source: {
      provider: "TJPR",
      sourceId: `fixture-${scratchpadId}`,
      url: OFFICIAL_URL,
      processNumber: "0001234-56.2023.8.16.0001",
      court: "TJPR",
      chamber: "9ª Câmara Cível",
      judge: "Des. Ricardo Almeida Neto",
      judgmentDate: "2023-11-14",
      sourceHash: "hash",
    },
    relevance: { score: 0.9, reason: "Mesma tese." },
    caseSummary: "Resumo.",
    facts: [],
    legalIssues: [],
    holdings: [{ proposition: "Negativa abusiva", stance: "SUPPORTS", reasoning: "Motivo." }],
    favorablePoints: [],
    contraryPoints: [],
    distinguishingFacts: [],
    citedLaws: [],
    citedPrecedents: [],
    evidenceCandidates: [],
    confidence: 0.9,
    status: "VALID",
    ...overrides,
  };
}

export function evidence(
  evidenceId: string,
  scratchpadId: string,
  overrides: Partial<VerifiedEvidence> = {},
): VerifiedEvidence {
  return {
    evidenceId,
    scratchpadId,
    proposition: "Sustenta a abusividade da negativa.",
    quote: "A negativa de cobertura de procedimento prescrito é abusiva.",
    context: "Ementa do acórdão.",
    source: {
      processNumber: "0001234-56.2023.8.16.0001",
      court: "TJPR",
      chamber: "9ª Câmara Cível",
      judge: "Des. Ricardo Almeida Neto",
      judgmentDate: "2023-11-14",
      url: OFFICIAL_URL,
      sourceHash: "hash",
    },
    verified: true,
    matchKind: "EXACT",
    similarity: 1,
    ...overrides,
  };
}

export function analysis(overrides: Partial<CrossFileAnalysis> = {}): CrossFileAnalysis {
  return {
    legalIssueId: "LI-1",
    sampleCoverage: "COVERED",
    conclusion: "A 9ª Câmara vem reconhecendo a abusividade da negativa de cobertura.",
    supportingDecisions: ["SP-1", "SP-2", "SP-3", "SP-4", "SP-5", "SP-6"],
    opposingDecisions: ["SP-7", "SP-8", "SP-9"],
    mixedDecisions: ["SP-10"],
    chamberPattern: "9ª Câmara Cível majoritariamente favorável à cobertura.",
    recurringFactors: ["Prescrição médica expressa"],
    strongestSupporting: ["SP-1"],
    strongestOpposing: ["SP-7"],
    risks: [{ description: "O dano moral pode ser afastado como mero inadimplemento.", evidenceIds: ["EV-7"] }],
    suggestedArguments: [{ argument: "Sustentar a abusividade com base na Súmula 608 do STJ.", evidenceIds: ["EV-1"] }],
    ...overrides,
  };
}
