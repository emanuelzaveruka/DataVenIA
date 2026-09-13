import { describe, expect, it } from "vitest";
import { buildCrossFilePrompt } from "../prompts";
import type { CaseAnalysis } from "../../../schemas/case-analysis.schema";
import type { DecisionScratchpad } from "../../../schemas/scratchpad.schema";

function caseAnalysis(): CaseAnalysis {
  return {
    parties: {},
    facts: ["Negativa de cobertura."],
    requests: ["Cobertura"],
    legalIssues: [
      { id: "LI-1", topic: "Abusividade", question: "A negativa é abusiva?", relevance: "HIGH" },
      { id: "LI-2", topic: "Dano moral", question: "Há dano moral?", relevance: "MEDIUM" },
    ],
    clientArguments: [],
    opposingArguments: [],
    citedLaws: [],
    citedPrecedents: [],
    evidenceSummary: [],
  };
}

function scratchpad(overrides: Partial<DecisionScratchpad> = {}): DecisionScratchpad {
  return {
    scratchpadId: "6f1c3d20-1111-4222-8333-444455556666",
    schemaVersion: "1.0.0",
    source: {
      provider: "TJPR",
      sourceId: "fixture-001",
      url: "https://tjpr.jus.br/fixture-001",
      sourceHash: "hash-1",
    },
    relevance: { score: 0.9, reason: "Mesma tese." },
    caseSummary: "Negativa reputada abusiva.",
    facts: [],
    legalIssues: [],
    holdings: [{ proposition: "Negativa abusiva", stance: "SUPPORTS", reasoning: "Prescrição prevalece." }],
    favorablePoints: [],
    contraryPoints: [],
    distinguishingFacts: [],
    citedLaws: [],
    citedPrecedents: [],
    evidenceCandidates: [
      { id: "EV-6f1c3d-1", quote: "A negativa é abusiva.", context: "Voto.", purpose: "Sustenta." },
    ],
    confidence: 0.9,
    status: "VALID",
    ...overrides,
  };
}

describe("buildCrossFilePrompt", () => {
  it("monta o exemplo de forma com os IDs reais da execução", () => {
    const prompt = buildCrossFilePrompt(caseAnalysis(), [scratchpad()]);

    // O exemplo trazia `LI-1`, `SP-1` e `EV-1` fixos, e um modelo pequeno copiava esses valores em
    // vez de ler os dados — devolvendo análises para questões jurídicas que não existiam no caso e
    // derrubando a resposta inteira na integridade referencial do schema (HU-21).
    const exemplo = prompt.slice(prompt.indexOf('{"legalIssueId"'));
    expect(exemplo).toContain('"legalIssueId":"LI-1"');
    expect(exemplo).toContain('"6f1c3d20-1111-4222-8333-444455556666"');
    expect(exemplo).toContain('"EV-6f1c3d-1"');
    expect(exemplo).not.toContain('"SP-1"');
    expect(exemplo).not.toContain('"EV-1"');
  });

  it("mostra risco e argumento vazios quando não há nenhum trecho candidato", () => {
    // O schema exige ao menos um evidenceId por risco (HU-23): sem citação disponível, o exemplo
    // precisa mostrar a lista vazia em vez de um id que o modelo copiaria e que não existe.
    const prompt = buildCrossFilePrompt(caseAnalysis(), [scratchpad({ evidenceCandidates: [] })]);

    const exemplo = prompt.slice(prompt.indexOf('{"legalIssueId"'));
    expect(exemplo).toContain('"risks":[]');
    expect(exemplo).toContain('"suggestedArguments":[]');
  });

  it("lista todas as questões jurídicas do caso, cada uma com o id que a resposta deve usar", () => {
    const prompt = buildCrossFilePrompt(caseAnalysis(), [scratchpad()]);

    expect(prompt).toContain("- LI-1 (relevância HIGH)");
    expect(prompt).toContain("- LI-2 (relevância MEDIUM)");
  });

  it("expõe os IDs autorizados em JSON para reduzir cópia de rótulos como '- scratchpadId:'", () => {
    const prompt = buildCrossFilePrompt(caseAnalysis(), [scratchpad()]);

    expect(prompt).toContain("<identificadores_autorizados>");
    expect(prompt).toContain('"scratchpadIds": [');
    expect(prompt).toContain('"6f1c3d20-1111-4222-8333-444455556666"');
    expect(prompt).toContain("Exemplo errado:");
    expect(prompt).toContain('Nunca abrevie IDs com "?"');
  });
});
