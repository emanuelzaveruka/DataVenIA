import { describe, expect, it, vi } from "vitest";
import { analyzeCrossFile, hasOpposingPrecedents } from "../analyze-cross-file";
import { parseStructuredOutput } from "../../../llm/validate-structured-output";
import type { GenerateStructuredParams, LlmProvider } from "../../../llm/provider";
import type { CaseAnalysis } from "../../../schemas/case-analysis.schema";
import type { DecisionScratchpad } from "../../../schemas/scratchpad.schema";
import type { CrossFileAnalysis } from "../../../schemas/cross-file.schema";

function fakeProviderFromRawResponses(rawResponses: unknown[]): LlmProvider {
  let index = 0;
  const generateStructured = vi.fn(async (params: GenerateStructuredParams<unknown>) => {
    const raw = rawResponses[Math.min(index, rawResponses.length - 1)];
    index += 1;
    return parseStructuredOutput(params.schema, params.schemaName, raw, "fake");
  }) as unknown as LlmProvider["generateStructured"];

  return { name: "fake", model: "fake-model", generateStructured };
}

function caseAnalysis(): CaseAnalysis {
  return {
    parties: { plaintiff: "Autor", defendant: "Operadora" },
    facts: ["Negativa de cobertura de home care."],
    requests: ["Cobertura do tratamento", "Dano moral"],
    legalIssues: [
      { id: "LI-1", topic: "Abusividade da negativa", question: "A negativa é abusiva?", relevance: "HIGH" },
    ],
    clientArguments: ["Prescrição médica expressa."],
    opposingArguments: ["Exclusão contratual."],
    citedLaws: ["Lei 9.656/1998"],
    citedPrecedents: [],
    evidenceSummary: [],
  };
}

function scratchpad(overrides: Partial<DecisionScratchpad> = {}): DecisionScratchpad {
  return {
    scratchpadId: "SP-1",
    schemaVersion: "1.0.0",
    source: {
      provider: "TJPR",
      sourceId: "fixture-001",
      url: "https://tjpr.jus.br/fixture-001",
      chamber: "5ª Câmara Cível",
      sourceHash: "hash-1",
    },
    relevance: { score: 0.9, reason: "Mesma tese." },
    caseSummary: "Negativa de cobertura reputada abusiva.",
    facts: ["Home care negado."],
    legalIssues: ["Abusividade"],
    holdings: [
      { proposition: "Negativa abusiva", stance: "SUPPORTS", reasoning: "Prescrição médica prevalece." },
    ],
    favorablePoints: ["Abusividade reconhecida."],
    contraryPoints: [],
    distinguishingFacts: [],
    citedLaws: [],
    citedPrecedents: [],
    evidenceCandidates: [
      { id: "EV-1", quote: "A negativa é abusiva.", context: "Voto do relator.", purpose: "Sustenta a abusividade." },
    ],
    confidence: 0.9,
    status: "VALID",
    ...overrides,
  };
}

function opposingScratchpad(): DecisionScratchpad {
  return scratchpad({
    scratchpadId: "SP-2",
    source: { ...scratchpad().source, sourceId: "fixture-002", url: "https://tjpr.jus.br/fixture-002" },
    holdings: [
      { proposition: "Dano moral in re ipsa", stance: "OPPOSES", reasoning: "Mero inadimplemento não gera dano moral." },
    ],
    favorablePoints: [],
    contraryPoints: ["Dano moral afastado."],
    evidenceCandidates: [
      { id: "EV-2", quote: "O mero inadimplemento não gera dano moral.", context: "Voto.", purpose: "Afasta o dano moral." },
    ],
  });
}

function analysisResponse(overrides: Partial<CrossFileAnalysis> = {}): { analyses: CrossFileAnalysis[] } {
  return {
    analyses: [
      {
        legalIssueId: "LI-1",
        conclusion: "A Câmara reconhece a abusividade, mas divide-se quanto ao dano moral.",
        supportingDecisions: ["SP-1"],
        opposingDecisions: ["SP-2"],
        mixedDecisions: [],
        chamberPattern: "5ª Câmara Cível favorável à cobertura.",
        recurringFactors: ["Prescrição médica expressa"],
        strongestSupporting: ["SP-1"],
        strongestOpposing: ["SP-2"],
        risks: [{ description: "Dano moral pode ser afastado.", evidenceIds: ["EV-2"] }],
        suggestedArguments: [{ argument: "Sustentar a abusividade da negativa.", evidenceIds: ["EV-1"] }],
        ...overrides,
      },
    ],
  };
}

describe("analyzeCrossFile", () => {
  it("produces one analysis per legal issue and reports that contrary precedents exist (HU-21/HU-22)", async () => {
    const provider = fakeProviderFromRawResponses([analysisResponse()]);

    const result = await analyzeCrossFile(caseAnalysis(), [scratchpad(), opposingScratchpad()], provider);

    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.data.analyses).toHaveLength(1);
      expect(result.data.analyses[0]!.strongestOpposing).toEqual(["SP-2"]);
      expect(result.data.opposingPrecedentsFound).toBe(true);
    }
    expect(provider.generateStructured).toHaveBeenCalledTimes(1);
  });

  it("sends only Scratchpads and case data to the model — never the original decision text (§3.8/§2.3)", async () => {
    const provider = fakeProviderFromRawResponses([analysisResponse()]);

    await analyzeCrossFile(caseAnalysis(), [scratchpad(), opposingScratchpad()], provider);

    const params = vi.mocked(provider.generateStructured).mock.calls[0]![0] as GenerateStructuredParams<unknown>;
    expect(params.prompt).toContain("SP-1");
    expect(params.prompt).toContain("EV-1");
    expect(params.prompt).toContain("LI-1");
    expect(params.prompt).not.toContain("fullText");
    expect(params.system).toContain("NÃO tem acesso ao texto integral");
  });

  it("ignores PARTIAL/FAILED scratchpads, reducing only over valid ones (HU-19)", async () => {
    const provider = fakeProviderFromRawResponses([analysisResponse()]);
    const partial = scratchpad({ scratchpadId: "SP-PARTIAL", status: "PARTIAL", holdings: [] });

    const result = await analyzeCrossFile(
      caseAnalysis(),
      [scratchpad(), opposingScratchpad(), partial],
      provider,
    );

    expect(result.isError).toBe(false);
    const params = vi.mocked(provider.generateStructured).mock.calls[0]![0] as GenerateStructuredParams<unknown>;
    expect(params.prompt).not.toContain("SP-PARTIAL");
  });

  it("flags the absence of contrary precedents instead of leaving it implicit (HU-22)", async () => {
    const onlyFavorable = analysisResponse({
      opposingDecisions: [],
      strongestOpposing: [],
      risks: [{ description: "Amostra pequena, sem contrários identificados.", evidenceIds: ["EV-1"] }],
    });
    const provider = fakeProviderFromRawResponses([onlyFavorable]);

    const result = await analyzeCrossFile(caseAnalysis(), [scratchpad()], provider);

    expect(result.isError).toBe(false);
    if (!result.isError) expect(result.data.opposingPrecedentsFound).toBe(false);
  });

  it("fails with INVALID_CROSS_FILE_ANALYSIS after exhausting retries on hallucinated ids (HU-21)", async () => {
    const provider = fakeProviderFromRawResponses([analysisResponse({ supportingDecisions: ["SP-INVENTADO"] })]);

    const result = await analyzeCrossFile(caseAnalysis(), [scratchpad(), opposingScratchpad()], provider);

    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("INVALID_CROSS_FILE_ANALYSIS");
      expect(result.error.description).toContain("SP-INVENTADO");
      expect(result.error.metadata?.scratchpadCount).toBe(2);
    }
    expect(provider.generateStructured).toHaveBeenCalledTimes(3);
  });

  it("feeds the previous validation error back into the retry prompt (HU-20/§11.7)", async () => {
    const provider = fakeProviderFromRawResponses([
      analysisResponse({ supportingDecisions: ["SP-INVENTADO"] }),
      analysisResponse(),
    ]);

    const result = await analyzeCrossFile(caseAnalysis(), [scratchpad(), opposingScratchpad()], provider);

    expect(result.isError).toBe(false);
    const retryParams = vi.mocked(provider.generateStructured).mock.calls[1]![0] as GenerateStructuredParams<unknown>;
    expect(retryParams.prompt).toContain("SP-INVENTADO");
  });

  it("refuses to run without any valid scratchpad", async () => {
    const provider = fakeProviderFromRawResponses([analysisResponse()]);

    const result = await analyzeCrossFile(caseAnalysis(), [scratchpad({ status: "FAILED", holdings: [] })], provider);

    expect(result.isError).toBe(true);
    if (result.isError) expect(result.error.code).toBe("NO_VALID_SCRATCHPADS");
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it("refuses to run when the case has no legal issues", async () => {
    const provider = fakeProviderFromRawResponses([analysisResponse()]);

    const result = await analyzeCrossFile({ ...caseAnalysis(), legalIssues: [] }, [scratchpad()], provider);

    expect(result.isError).toBe(true);
    if (result.isError) expect(result.error.code).toBe("NO_LEGAL_ISSUES_TO_ANALYZE");
  });
});

describe("hasOpposingPrecedents", () => {
  it("counts mixed decisions as contrary evidence present in the sample", () => {
    const base = analysisResponse({ opposingDecisions: [], strongestOpposing: [], mixedDecisions: ["SP-2"] });
    expect(hasOpposingPrecedents(base.analyses)).toBe(true);
  });
});
