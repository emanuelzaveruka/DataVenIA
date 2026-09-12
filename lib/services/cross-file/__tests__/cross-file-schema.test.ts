import { describe, expect, it } from "vitest";
import {
  buildCrossFileAnalysisResponseSchema,
  type CrossFileAnalysis,
  type CrossFileReferenceContext,
} from "../../../schemas/cross-file.schema";

const context: CrossFileReferenceContext = {
  legalIssueIds: ["LI-1", "LI-2"],
  scratchpadIds: ["SP-1", "SP-2", "SP-3"],
  evidenceIds: ["EV-1", "EV-2"],
  hasOpposingHoldings: true,
};

function analysis(overrides: Partial<CrossFileAnalysis> = {}): CrossFileAnalysis {
  return {
    legalIssueId: "LI-1",
    sampleCoverage: "COVERED",
    conclusion: "A Câmara vem reconhecendo a abusividade da negativa.",
    supportingDecisions: ["SP-1"],
    opposingDecisions: ["SP-2"],
    mixedDecisions: [],
    recurringFactors: ["Prescrição médica expressa"],
    strongestSupporting: ["SP-1"],
    strongestOpposing: ["SP-2"],
    risks: [{ description: "Valor indenizatório pode ser reduzido.", evidenceIds: ["EV-2"] }],
    suggestedArguments: [{ argument: "Invocar a Súmula 608 do STJ.", evidenceIds: ["EV-1"] }],
    ...overrides,
  };
}

/**
 * A questão jurídica que a amostra simplesmente não trata — o estado que o schema tornava
 * irrepresentável e que empurrava o modelo a inventar um vínculo para conseguir responder.
 */
function uncovered(overrides: Partial<CrossFileAnalysis> = {}): CrossFileAnalysis {
  return analysis({
    legalIssueId: "LI-2",
    sampleCoverage: "NOT_COVERED",
    conclusion: "Nenhuma das decisões analisadas trata da competência do juizado.",
    supportingDecisions: [],
    opposingDecisions: [],
    mixedDecisions: [],
    strongestSupporting: [],
    strongestOpposing: [],
    recurringFactors: [],
    risks: [],
    suggestedArguments: [],
    ...overrides,
  });
}

function parse(analyses: CrossFileAnalysis[]) {
  return buildCrossFileAnalysisResponseSchema(context).safeParse({ analyses });
}

function messages(result: ReturnType<typeof parse>): string {
  return result.success ? "" : result.error.issues.map((issue) => issue.message).join(" | ");
}

describe("buildCrossFileAnalysisResponseSchema", () => {
  it("accepts one analysis per legal issue with only known ids", () => {
    const result = parse([analysis(), analysis({ legalIssueId: "LI-2" })]);
    expect(result.success).toBe(true);
  });

  it("rejects a scratchpadId that is not among the analyzed scratchpads (HU-21: nunca um ID inventado)", () => {
    const result = parse([
      analysis({ supportingDecisions: ["SP-1", "SP-99"] }),
      analysis({ legalIssueId: "LI-2" }),
    ]);
    expect(result.success).toBe(false);
    expect(messages(result)).toContain("SP-99");
  });

  it("rejects an evidenceId that no scratchpad produced (HU-23/HU-25)", () => {
    const result = parse([
      analysis({ risks: [{ description: "Risco inventado.", evidenceIds: ["EV-404"] }] }),
      analysis({ legalIssueId: "LI-2" }),
    ]);
    expect(result.success).toBe(false);
    expect(messages(result)).toContain("EV-404");
  });

  it("rejects a risk with no evidenceIds at all (HU-23)", () => {
    const result = parse([
      analysis({ risks: [{ description: "Afirmação genérica sem lastro.", evidenceIds: [] }] }),
      analysis({ legalIssueId: "LI-2" }),
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects an argument with no evidenceIds at all (HU-25)", () => {
    const result = parse([
      analysis({ suggestedArguments: [{ argument: "Tese sem fonte.", evidenceIds: [] }] }),
      analysis({ legalIssueId: "LI-2" }),
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects a legal issue left without analysis (HU-21)", () => {
    const result = parse([analysis()]);
    expect(result.success).toBe(false);
    expect(messages(result)).toContain("LI-2");
  });

  it("rejects a legal issue analyzed twice", () => {
    const result = parse([analysis(), analysis(), analysis({ legalIssueId: "LI-2" })]);
    expect(result.success).toBe(false);
    expect(messages(result)).toContain("mais de uma vez");
  });

  it("rejects a legalIssueId that does not belong to the case", () => {
    const result = parse([analysis(), analysis({ legalIssueId: "LI-2" }), analysis({ legalIssueId: "LI-9" })]);
    expect(result.success).toBe(false);
    expect(messages(result)).toContain("LI-9");
  });

  it("rejects a conclusion backed by no decision at all (HU-21)", () => {
    const result = parse([analysis(), uncovered({ sampleCoverage: "COVERED" })]);
    expect(result.success).toBe(false);
    expect(messages(result)).toContain("pelo menos uma decisão real");
  });

  it("points the retry at NOT_COVERED instead of only forbidding the empty analysis", () => {
    const result = parse([analysis(), uncovered({ sampleCoverage: "COVERED" })]);
    expect(messages(result)).toContain("NOT_COVERED");
  });

  it('accepts a legal issue the sample does not address at all, declared as "NOT_COVERED"', () => {
    const result = parse([analysis(), uncovered()]);
    expect(result.success).toBe(true);
  });

  it('rejects "NOT_COVERED" that still lists a decision — a contradiction, not a lacuna', () => {
    const result = parse([analysis(), uncovered({ supportingDecisions: ["SP-1"] })]);
    expect(result.success).toBe(false);
    expect(messages(result)).toContain("SP-1");
  });

  it('rejects "NOT_COVERED" that still asserts risks, arguments, factors or a chamber pattern', () => {
    const result = parse([
      analysis(),
      uncovered({
        risks: [{ description: "Risco sem amostra que o sustente.", evidenceIds: ["EV-1"] }],
        recurringFactors: ["Fator sem decisão de origem"],
        chamberPattern: "Padrão sem decisão analisada.",
      }),
    ]);
    expect(result.success).toBe(false);
    expect(messages(result)).toContain("risks");
    expect(messages(result)).toContain("recurringFactors");
    expect(messages(result)).toContain("chamberPattern");
  });

  it("does not demand contrary precedents from a reduce where nothing was covered (HU-22)", () => {
    const result = parse([
      uncovered({ legalIssueId: "LI-1" }),
      uncovered({ legalIssueId: "LI-2" }),
    ]);
    expect(result.success).toBe(true);
  });

  it("still demands contrary precedents as soon as one issue is covered (HU-22)", () => {
    const result = parse([
      analysis({ opposingDecisions: [], strongestOpposing: [] }),
      uncovered({ legalIssueId: "LI-2" }),
    ]);
    expect(result.success).toBe(false);
    expect(messages(result)).toContain("contrários");
  });

  it("treats a missing sampleCoverage as COVERED, so the old contract keeps its guarantees", () => {
    const { sampleCoverage, ...withoutField } = analysis();
    void sampleCoverage;
    const result = buildCrossFileAnalysisResponseSchema(context).safeParse({
      analyses: [withoutField, analysis({ legalIssueId: "LI-2" })],
    });
    expect(result.success).toBe(true);
    expect(result.data?.analyses[0]?.sampleCoverage).toBe("COVERED");
  });

  it("rejects strongestSupporting that was never listed as supporting or mixed", () => {
    const result = parse([analysis({ strongestSupporting: ["SP-3"] }), analysis({ legalIssueId: "LI-2" })]);
    expect(result.success).toBe(false);
    expect(messages(result)).toContain("SP-3");
  });

  it("rejects an analysis that drops every contrary precedent when the sample has OPPOSES holdings (HU-22)", () => {
    const onlyFavorable = analysis({ opposingDecisions: [], strongestOpposing: [] });
    const result = parse([onlyFavorable, { ...onlyFavorable, legalIssueId: "LI-2" }]);
    expect(result.success).toBe(false);
    expect(messages(result)).toContain("contrários");
  });

  it("accepts an analysis with no contrary precedent when the sample itself has none", () => {
    const withoutOpposition = buildCrossFileAnalysisResponseSchema({
      ...context,
      hasOpposingHoldings: false,
    }).safeParse({
      analyses: [
        analysis({ opposingDecisions: [], strongestOpposing: [] }),
        analysis({ legalIssueId: "LI-2", opposingDecisions: [], strongestOpposing: [] }),
      ],
    });
    expect(withoutOpposition.success).toBe(true);
  });
});
