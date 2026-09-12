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
    const result = parse([
      analysis(),
      analysis({
        legalIssueId: "LI-2",
        supportingDecisions: [],
        opposingDecisions: [],
        mixedDecisions: [],
        strongestSupporting: [],
        strongestOpposing: [],
      }),
    ]);
    expect(result.success).toBe(false);
    expect(messages(result)).toContain("pelo menos uma decisão real");
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
