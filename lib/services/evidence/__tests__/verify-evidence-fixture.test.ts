import { describe, expect, it } from "vitest";
import { verifyEvidence } from "../verify-evidence";
import { enforceEvidencePolicy } from "../enforce-evidence-policy";
import { crossFileAnalysis, hashOf } from "./fixtures";
import { createFixtureProvider } from "../../../providers/fixture";
import type { DecisionScratchpad, EvidenceCandidate } from "../../../schemas/scratchpad.schema";

const provider = createFixtureProvider();

async function scratchpadOverFixture(
  scratchpadId: string,
  sourceId: string,
  evidenceCandidates: EvidenceCandidate[],
): Promise<DecisionScratchpad> {
  const decision = await provider.fetchDecision(sourceId);
  if (decision.isError) throw new Error(`fixture ${sourceId} missing`);

  return {
    scratchpadId,
    schemaVersion: "1.0.0",
    source: {
      provider: "TJPR",
      sourceId,
      url: decision.data.sourceUrl,
      processNumber: decision.data.processNumber,
      court: decision.data.court,
      chamber: decision.data.judgingBody,
      judge: decision.data.rapporteur,
      judgmentDate: decision.data.judgmentDate,
      sourceHash: hashOf(decision.data.fullText!),
    },
    relevance: { score: 0.9, reason: "Mesma tese." },
    caseSummary: decision.data.summary!,
    facts: [],
    legalIssues: [],
    holdings: [{ proposition: "Proposição", stance: "SUPPORTS", reasoning: "Motivo." }],
    favorablePoints: [],
    contraryPoints: [],
    distinguishingFacts: [],
    citedLaws: [],
    citedPrecedents: [],
    evidenceCandidates,
    confidence: 0.9,
    status: "VALID",
  };
}

/**
 * Fecha o ciclo Fase 5 → Fase 6 sobre a fixture versionada (HU-37/critério de aceite 16): as
 * citações são conferidas contra o mesmo texto que o provider devolve, sem rede.
 */
describe("verifyEvidence over the versioned fixture", () => {
  it("verifies real quotes, rejects a fabricated one and lets HU-25 remove the claim that depended on it", async () => {
    const supporting = await scratchpadOverFixture("SP-1", "fixture-001", [
      {
        id: "EV-1",
        quote: "A negativa de cobertura de procedimento prescrito por médico assistente, sem justificativa técnica idônea, configura falha na prestação do serviço",
        context: "Ementa do acórdão.",
        purpose: "Sustenta a responsabilidade da operadora.",
      },
    ]);
    const opposing = await scratchpadOverFixture("SP-2", "fixture-002", [
      {
        id: "EV-2",
        quote: "A operadora foi condenada a indenizar em R$ 100.000,00 por danos morais presumidos",
        context: "Trecho inexistente.",
        purpose: "Sustenta o valor pedido.",
      },
    ]);

    const analyses = [crossFileAnalysis()];
    const result = await verifyEvidence(analyses, [supporting, opposing], provider);

    expect(result.isError).toBe(false);
    if (result.isError) return;
    expect(result.data.staleScratchpadIds).toEqual([]);
    expect(result.data.failures).toEqual([]);

    const byId = new Map(result.data.evidences.map((evidence) => [evidence.evidenceId, evidence]));
    expect(byId.get("EV-1")?.verified).toBe(true);
    expect(byId.get("EV-2")?.verified).toBe(false);
    expect(byId.get("EV-1")?.source.url).toContain("portal.tjpr.jus.br");

    const policy = enforceEvidencePolicy(analyses, result.data.evidences);
    expect(policy.analyses[0]!.suggestedArguments).toHaveLength(1);
    expect(policy.analyses[0]!.risks).toHaveLength(0);
    expect(policy.analyses[0]!.strongestOpposing).toEqual([]);
  });
});
