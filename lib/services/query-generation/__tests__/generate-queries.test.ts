import { describe, expect, it, vi } from "vitest";
import { generateSearchQueries } from "../generate-queries";
import { parseStructuredOutput } from "../../../llm/validate-structured-output";
import type { GenerateStructuredParams, LlmProvider } from "../../../llm/provider";
import type { CaseAnalysis } from "../../../schemas/case-analysis.schema";

function fakeProviderFromRawResponses(rawResponses: unknown[]): LlmProvider {
  let index = 0;
  const generateStructured = vi.fn(async (params: GenerateStructuredParams<unknown>) => {
    const raw = rawResponses[index];
    index += 1;
    return parseStructuredOutput(params.schema, params.schemaName, raw, "fake");
  }) as unknown as LlmProvider["generateStructured"];

  return { name: "fake", generateStructured };
}

const caseAnalysis: CaseAnalysis = {
  parties: { plaintiff: "Fulano", defendant: "Ciclano" },
  facts: ["Negativação indevida em 2024."],
  requests: ["Indenização por danos morais."],
  legalIssues: [
    { id: "issue-1", topic: "Dano moral", question: "Há dano moral por negativação indevida?", relevance: "HIGH" },
  ],
  clientArguments: ["A negativação foi indevida."],
  opposingArguments: [],
  citedLaws: [],
  citedPrecedents: [],
  evidenceSummary: [],
};

describe("generateSearchQueries", () => {
  it("accepts a query set containing an explicit CONTRARY query tied to a real legalIssue (HU-11)", async () => {
    const provider = fakeProviderFromRawResponses([
      {
        queries: [
          { query: "dano moral negativação", reason: "Busca pela tese principal.", intent: "MAIN_THESIS", legalIssueId: "issue-1" },
          { query: "mero aborrecimento consumidor", reason: "Busca por decisões contrárias.", intent: "CONTRARY", legalIssueId: "issue-1" },
        ],
      },
    ]);

    const result = await generateSearchQueries(caseAnalysis, provider);

    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.data.queries.some((q) => q.intent === "CONTRARY")).toBe(true);
    }
  });

  it("rejects an empty query set", async () => {
    const provider = fakeProviderFromRawResponses([{ queries: [] }, { queries: [] }, { queries: [] }]);

    const result = await generateSearchQueries(caseAnalysis, provider);

    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.category).toBe("STRUCTURED_OUTPUT");
    }
  });

  it("retries with feedback and succeeds when the first attempt lacks a CONTRARY query", async () => {
    const provider = fakeProviderFromRawResponses([
      {
        queries: [
          { query: "dano moral negativação", reason: "Busca pela tese principal.", intent: "MAIN_THESIS", legalIssueId: "issue-1" },
        ],
      },
      {
        queries: [
          { query: "dano moral negativação", reason: "Busca pela tese principal.", intent: "MAIN_THESIS", legalIssueId: "issue-1" },
          { query: "mero aborrecimento consumidor", reason: "Busca por decisões contrárias.", intent: "CONTRARY", legalIssueId: "issue-1" },
        ],
      },
    ]);

    const result = await generateSearchQueries(caseAnalysis, provider);

    expect(result.isError).toBe(false);
    expect(provider.generateStructured).toHaveBeenCalledTimes(2);
    const secondCallParams = vi.mocked(provider.generateStructured).mock.calls[1]![0];
    expect(secondCallParams.prompt).toContain("CONTRARY");
  });

  it("rejects a query that references a legalIssueId not present in the CaseAnalysis", async () => {
    const provider = fakeProviderFromRawResponses([
      {
        queries: [
          { query: "dano moral negativação", reason: "Busca pela tese principal.", intent: "MAIN_THESIS", legalIssueId: "issue-1" },
          { query: "algo contrário", reason: "Busca por decisões contrárias.", intent: "CONTRARY", legalIssueId: "issue-999" },
        ],
      },
      {
        queries: [
          { query: "dano moral negativação", reason: "Busca pela tese principal.", intent: "MAIN_THESIS", legalIssueId: "issue-1" },
          { query: "algo contrário", reason: "Busca por decisões contrárias.", intent: "CONTRARY", legalIssueId: "issue-1" },
        ],
      },
    ]);

    const result = await generateSearchQueries(caseAnalysis, provider);

    expect(result.isError).toBe(false);
    expect(provider.generateStructured).toHaveBeenCalledTimes(2);
  });
});
