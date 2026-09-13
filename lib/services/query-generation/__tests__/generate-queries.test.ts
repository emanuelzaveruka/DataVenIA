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

  return { name: "fake", model: "fake-model", generateStructured };
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

  it("orienta o modelo a gerar keywords curtas para o TJPR", async () => {
    const provider = fakeProviderFromRawResponses([
      {
        queries: [
          { query: "plano saude negativa cobertura", reason: "Busca pela tese principal.", intent: "MAIN_THESIS", legalIssueId: "issue-1" },
          { query: "exclusao contratual valida", reason: "Busca por decisões contrárias.", intent: "CONTRARY", legalIssueId: "issue-1" },
        ],
      },
    ]);

    await generateSearchQueries(caseAnalysis, provider);

    const params = vi.mocked(provider.generateStructured).mock.calls[0]![0];
    expect(params.system).toContain("exatamente 2 queries");
    expect(params.system).toContain("formato keyword");
    expect(params.system).toContain("plano saude");
    expect(params.prompt).toContain("keywords curtas");
  });

  it("rejects a query set that does not contain exactly two queries", async () => {
    const provider = fakeProviderFromRawResponses([{ queries: [] }, { queries: [] }, { queries: [] }]);

    const result = await generateSearchQueries(caseAnalysis, provider);

    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.category).toBe("STRUCTURED_OUTPUT");
    }
  });

  it("rejects extra related query variations to keep the TJPR search small", async () => {
    const provider = fakeProviderFromRawResponses([
      {
        queries: [
          { query: "dano moral negativação", reason: "Busca pela tese principal.", intent: "MAIN_THESIS", legalIssueId: "issue-1" },
          { query: "mero aborrecimento consumidor", reason: "Busca por decisões contrárias.", intent: "CONTRARY", legalIssueId: "issue-1" },
          { query: "serasa inscrição indevida", reason: "Variação correlata.", intent: "MAIN_THESIS", legalIssueId: "issue-1" },
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
  });

  it("retries when the model returns RELATED because user extraTerms are added outside this step", async () => {
    const provider = fakeProviderFromRawResponses([
      {
        queries: [
          { query: "dano moral negativação", reason: "Busca pela tese principal.", intent: "MAIN_THESIS", legalIssueId: "issue-1" },
          { query: "serasa inscrição indevida", reason: "Termo correlato.", intent: "RELATED", legalIssueId: "issue-1" },
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
