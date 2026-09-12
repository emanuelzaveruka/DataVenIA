import { createHash } from "node:crypto";
import type { CaseAnalysis } from "../../schemas/case-analysis.schema";
import type { CrossFileAnalysis } from "../../schemas/cross-file.schema";
import type { DecisionScratchpad, HoldingStance } from "../../schemas/scratchpad.schema";
import type { FinalReport } from "../../schemas/report.schema";
import type { ToolResult } from "../../errors/tool-result";
import { createFixtureProvider } from "../fixture";
import { verifyEvidence } from "../../services/evidence/verify-evidence";
import { enforceEvidencePolicy } from "../../services/evidence/enforce-evidence-policy";
import { buildReport } from "../../services/report/build-report";
import { FIXTURE_RAW_DECISIONS } from "./tjpr-demo-case";

/**
 * Demonstração do relatório final sobre a fixture versionada (HU-37/critério de aceite 16): as
 * Fases 6 e 7 rodam de verdade (verificação de citação + montagem), sem rede e sem modelo. O único
 * insumo fabricado é a saída do cross-file — que é texto de modelo e, por definição, não teria
 * como ser derivada deterministicamente aqui.
 *
 * Dados 100% fictícios, como toda a fixture. Não é referência jurídica.
 */

/** Posição de cada decisão da fixture quanto à tese "a negativa de cobertura é abusiva". */
const STANCE_BY_DECISION: Record<string, HoldingStance> = {
  "fixture-001": "SUPPORTS",
  "fixture-002": "SUPPORTS",
  "fixture-003": "SUPPORTS",
  "fixture-004": "OPPOSES",
  "fixture-005": "OPPOSES",
  "fixture-006": "OPPOSES",
  "fixture-007": "SUPPORTS",
  "fixture-008": "MIXED",
  "fixture-009": "SUPPORTS",
};

const DISTINGUISHING_BY_DECISION: Record<string, string[]> = {
  "fixture-008": ["Discute reembolso fora da rede credenciada, não negativa de cobertura em si."],
  "fixture-004": ["Carência regularmente pactuada e sem urgência demonstrada, ao contrário do caso analisado."],
};

/**
 * Cita literalmente a frase mais longa do acórdão. É deterministicamente um trecho real do texto,
 * então a verificação de HU-24 confirma a citação — que é justamente o que a demo precisa provar.
 */
function longestSentence(fullText: string): string {
  return fullText
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .reduce((longest, sentence) => (sentence.length > longest.length ? sentence : longest), "");
}

function scratchpadIdFor(index: number): string {
  return `SP-${String(index + 1).padStart(2, "0")}`;
}

function evidenceIdFor(index: number): string {
  return `EV-${String(index + 1).padStart(2, "0")}`;
}

function demoScratchpads(): DecisionScratchpad[] {
  return FIXTURE_RAW_DECISIONS.map((decision, index) => {
    const fullText = decision.fullText!;
    const stance = STANCE_BY_DECISION[decision.id] ?? "NEUTRAL";

    return {
      scratchpadId: scratchpadIdFor(index),
      schemaVersion: "1.0.0",
      source: {
        provider: "TJPR",
        sourceId: decision.id,
        url: decision.sourceUrl,
        processNumber: decision.processNumber,
        court: decision.court,
        chamber: decision.judgingBody,
        judge: decision.rapporteur,
        judgmentDate: decision.judgmentDate,
        sourceHash: createHash("sha256").update(Buffer.from(fullText, "utf-8")).digest("hex"),
      },
      relevance: { score: 0.8, reason: "Mesma controvérsia de cobertura em plano de saúde." },
      caseSummary: decision.summary!,
      facts: [],
      legalIssues: ["Abusividade da negativa de cobertura"],
      holdings: [
        {
          proposition: "Abusividade da negativa de cobertura do tratamento prescrito",
          stance,
          reasoning: decision.summary!,
        },
      ],
      favorablePoints: stance === "SUPPORTS" ? [decision.summary!] : [],
      contraryPoints: stance === "OPPOSES" ? [decision.summary!] : [],
      distinguishingFacts: DISTINGUISHING_BY_DECISION[decision.id] ?? [],
      citedLaws: ["Lei 9.656/1998"],
      citedPrecedents: [],
      evidenceCandidates: [
        {
          id: evidenceIdFor(index),
          quote: longestSentence(fullText),
          context: "Trecho da ementa do acórdão.",
          purpose:
            stance === "OPPOSES"
              ? "Sustenta a validade da negativa de cobertura."
              : "Sustenta a abusividade da negativa de cobertura.",
        },
      ],
      confidence: 0.85,
      status: "VALID",
    };
  });
}

function idsWithStance(scratchpads: DecisionScratchpad[], stance: HoldingStance): string[] {
  return scratchpads
    .filter((scratchpad) => scratchpad.holdings[0]!.stance === stance)
    .map((scratchpad) => scratchpad.scratchpadId);
}

function evidenceIdOf(scratchpads: DecisionScratchpad[], scratchpadId: string): string {
  return scratchpads.find((scratchpad) => scratchpad.scratchpadId === scratchpadId)!
    .evidenceCandidates[0]!.id;
}

const DEMO_CASE_ANALYSIS: CaseAnalysis = {
  processNumber: "0009876-54.2025.8.16.0001",
  court: "TJPR",
  chamber: "9ª Câmara Cível",
  parties: { plaintiff: "[PARTE_1]", defendant: "[PARTE_2] Saúde S.A." },
  facts: [
    "Beneficiária teve negada a cobertura de procedimento cirúrgico prescrito pelo médico assistente.",
    "A negativa foi fundamentada em cláusula de exclusão contratual genérica.",
  ],
  requests: [
    "Cobertura integral do procedimento prescrito",
    "Indenização por danos morais",
  ],
  legalIssues: [
    {
      id: "LI-01",
      topic: "Abusividade da negativa de cobertura",
      question:
        "A negativa de cobertura de procedimento prescrito pelo médico assistente, baseada em exclusão contratual genérica, é abusiva?",
      relevance: "HIGH",
    },
  ],
  clientArguments: ["A prescrição do médico assistente prevalece sobre a exclusão contratual."],
  opposingArguments: ["O procedimento está expressamente excluído do contrato."],
  citedLaws: ["Lei 9.656/1998", "CDC, art. 51, IV"],
  citedPrecedents: ["Súmula 608 do STJ"],
  evidenceSummary: ["Relatório médico", "Negativa administrativa por escrito"],
};

function demoCrossFileAnalysis(scratchpads: DecisionScratchpad[]): CrossFileAnalysis {
  const supporting = idsWithStance(scratchpads, "SUPPORTS");
  const opposing = idsWithStance(scratchpads, "OPPOSES");
  const mixed = idsWithStance(scratchpads, "MIXED");

  return {
    legalIssueId: "LI-01",
    sampleCoverage: "COVERED",
    conclusion:
      "As Câmaras analisadas reconhecem a abusividade da negativa quando há prescrição do médico assistente e a exclusão contratual é genérica, mas mantêm a negativa quando a exclusão é específica ou a carência foi regularmente pactuada.",
    supportingDecisions: supporting,
    opposingDecisions: opposing,
    mixedDecisions: mixed,
    chamberPattern:
      "A 9ª Câmara Cível tende a reconhecer a abusividade; a 3ª Câmara Cível examina com mais rigor a especificidade da cláusula de exclusão.",
    recurringFactors: [
      "Prescrição expressa do médico assistente",
      "Generalidade da cláusula de exclusão",
      "Urgência ou risco de interrupção de tratamento em curso",
    ],
    strongestSupporting: [supporting[0]!, supporting[2]!],
    strongestOpposing: [opposing[0]!],
    risks: [
      {
        description:
          "Havendo exclusão contratual específica e ausência de urgência demonstrada, a negativa tende a ser mantida.",
        evidenceIds: [evidenceIdOf(scratchpads, opposing[0]!)],
      },
    ],
    suggestedArguments: [
      {
        argument:
          "Sustentar que a exclusão genérica não prevalece sobre a prescrição do médico assistente, invocando a abusividade reconhecida pela Câmara.",
        evidenceIds: [evidenceIdOf(scratchpads, supporting[0]!)],
      },
    ],
  };
}

export async function buildDemoReport(): Promise<ToolResult<FinalReport>> {
  const scratchpads = demoScratchpads();
  const analyses = [demoCrossFileAnalysis(scratchpads)];

  const verification = await verifyEvidence(analyses, scratchpads, createFixtureProvider());
  if (verification.isError) return verification;

  const policy = enforceEvidencePolicy(analyses, verification.data.evidences);

  return buildReport({
    caseAnalysis: DEMO_CASE_ANALYSIS,
    analyses: policy.analyses,
    evidences: verification.data.evidences,
    scratchpads,
    policyDropped: policy.dropped,
  });
}
