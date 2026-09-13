import { describe, expect, it } from "vitest";
import {
  buildCrossFileAnalysisResponseSchema,
  type CrossFileAnalysis,
  type CrossFileReferenceContext,
} from "../../../schemas/cross-file.schema";
import { normalizeModelOutput } from "../../../llm/normalize-model-output";

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

  it("normaliza linhas copiadas do prompt quando contêm exatamente um scratchpadId conhecido", () => {
    const result = parse([
      analysis({
        supportingDecisions: ["- scratchpadId: SP-1"],
        opposingDecisions: ["scratchpadId: SP-2"],
        strongestSupporting: ["  - scratchpadId: SP-1  "],
        strongestOpposing: ["SP-2"],
      }),
      analysis({ legalIssueId: "LI-2" }),
    ]);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.analyses[0]!.supportingDecisions).toEqual(["SP-1"]);
    expect(result.data.analyses[0]!.opposingDecisions).toEqual(["SP-2"]);
    expect(result.data.analyses[0]!.strongestSupporting).toEqual(["SP-1"]);
  });

  it("continua rejeitando fragmentos ou IDs ambíguos que não podem ser normalizados com segurança", () => {
    const result = parse([
      analysis({
        opposingDecisions: ["ef?"],
        strongestOpposing: ["SP-1 e SP-2"],
      }),
      analysis({ legalIssueId: "LI-2" }),
    ]);

    expect(result.success).toBe(false);
    expect(messages(result)).toContain("ef?");
    expect(messages(result)).toContain("SP-1 e SP-2");
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

  it("completa legalIssue omitida como NOT_COVERED em vez de derrubar o run", () => {
    const result = parse([analysis()]);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.analyses).toHaveLength(2);
    expect(result.data.analyses[1]).toMatchObject({
      legalIssueId: "LI-2",
      sampleCoverage: "NOT_COVERED",
      supportingDecisions: [],
      risks: [],
    });
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

  it('corrige "NOT_COVERED" com decisão listada para "COVERED"', () => {
    const result = parse([analysis(), uncovered({ supportingDecisions: ["SP-1"] })]);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.analyses[1]!.sampleCoverage).toBe("COVERED");
  });

  it('continua rejeitando conteúdo sem nenhuma decisão real que o sustente', () => {
    const result = parse([
      analysis(),
      uncovered({
        risks: [{ description: "Risco sem amostra que o sustente.", evidenceIds: ["EV-1"] }],
        recurringFactors: ["Fator sem decisão de origem"],
        chamberPattern: "Padrão sem decisão analisada.",
      }),
    ]);
    expect(result.success).toBe(false);
    expect(messages(result)).toContain("pelo menos uma decisão real");
  });

  it('corrige "NOT_COVERED" contraditório para "COVERED" quando o modelo lista decisões e fundamentos', () => {
    const schema = buildCrossFileAnalysisResponseSchema(context);
    const result = schema.safeParse({
      analyses: [
        analysis(),
        uncovered({
          supportingDecisions: ["SP-1", "SP-3"],
          strongestSupporting: ["SP-1"],
          recurringFactors: ["Prescrição médica expressa"],
          chamberPattern: "Padrão favorável à cobertura.",
          risks: [{ description: "Risco de afastamento do dano moral.", evidenceIds: ["EV-2"] }],
          suggestedArguments: [{ argument: "Distinguir exclusão genérica.", evidenceIds: ["EV-1"] }],
        }),
      ],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.analyses[1]!.sampleCoverage).toBe("COVERED");
    expect(result.data.analyses[1]!.supportingDecisions).toEqual(["SP-1", "SP-3"]);
  });

  it("does not demand contrary precedents from a reduce where nothing was covered (HU-22)", () => {
    const result = parse([
      uncovered({ legalIssueId: "LI-1" }),
      uncovered({ legalIssueId: "LI-2" }),
    ]);
    expect(result.success).toBe(true);
  });

  it("não bloqueia por padrão quando a amostra tem OPPOSES/MIXED mas o reduce só achou favoráveis", () => {
    const result = parse([
      analysis({ opposingDecisions: [], strongestOpposing: [] }),
      uncovered({ legalIssueId: "LI-2" }),
    ]);
    expect(result.success).toBe(true);
  });

  /**
   * O incidente real: o modelo devolveu `strongest*` como string nas duas análises e um risco com
   * `evidenceIds` vazio. Cinco violações derrubaram as duas análises e esgotaram as 3 tentativas.
   * Depois da correção, os quatro erros de forma somem na normalização e sobra só o de conteúdo —
   * agora com uma mensagem que diz ao modelo o que fazer.
   */
  it("survives the exact payload of the incident: only the semantic error is left", () => {
    const raw = {
      analyses: [
        { ...analysis(), strongestSupporting: "SP-1", strongestOpposing: "SP-2" },
        {
          ...analysis({ legalIssueId: "LI-2" }),
          strongestSupporting: "SP-1",
          strongestOpposing: "SP-2",
          risks: [{ description: "Risco sem nenhuma citação que o sustente.", evidenceIds: [] }],
        },
      ],
    };

    const schema = buildCrossFileAnalysisResponseSchema(context);
    const { value } = normalizeModelOutput(schema, raw);
    const result = schema.safeParse(value);
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0]!.path.join(".")).toBe("analyses.1.risks.0.evidenceIds");
    expect(result.error.issues[0]!.message).toContain("REMOVA a afirmação");
  });

  it("normaliza chamberPattern=null mesmo com o preprocess contextual de IDs", () => {
    const schema = buildCrossFileAnalysisResponseSchema(context);
    const { value, repairs } = normalizeModelOutput(schema, {
      analyses: [
        analysis({ chamberPattern: null as unknown as string }),
        analysis({ legalIssueId: "LI-2", chamberPattern: null as unknown as string }),
      ],
    });

    expect(repairs.map((repair) => repair.path)).toEqual([
      "analyses.0.chamberPattern",
      "analyses.1.chamberPattern",
    ]);
    expect(schema.safeParse(value).success).toBe(true);
  });

  it("tells the model to remove an unsupported claim instead of leaving evidenceIds empty (HU-23)", () => {
    const result = parse([
      analysis({ risks: [{ description: "Afirmação genérica sem lastro.", evidenceIds: [] }] }),
      analysis({ legalIssueId: "LI-2" }),
    ]);

    expect(messages(result)).toContain("REMOVA a afirmação");
    // A instrução precisa fechar as duas saídas erradas: preencher com id falso e deixar vazio.
    expect(messages(result)).toContain("nunca invente um id");
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

  it("em strict rejeita análise que some com todo precedente contrário quando a amostra tem OPPOSES (HU-22)", () => {
    const onlyFavorable = analysis({ opposingDecisions: [], strongestOpposing: [] });
    const result = buildCrossFileAnalysisResponseSchema(context, { oppositionGuard: "strict" }).safeParse({
      analyses: [onlyFavorable, { ...onlyFavorable, legalIssueId: "LI-2" }],
    });
    expect(result.success).toBe(false);
    expect(result.success ? "" : result.error.issues.map((issue) => issue.message).join(" | ")).toContain(
      "contrários",
    );
  });

  it("em warn aceita a guarda global HU-22 sem relaxar validações estruturais", () => {
    const onlyFavorable = analysis({ opposingDecisions: [], strongestOpposing: [] });
    const result = buildCrossFileAnalysisResponseSchema(context, { oppositionGuard: "warn" }).safeParse({
      analyses: [onlyFavorable, { ...onlyFavorable, legalIssueId: "LI-2" }],
    });

    expect(result.success).toBe(true);
  });

  it("em modo warn continua rejeitando erros estruturais e IDs inventados", () => {
    const result = buildCrossFileAnalysisResponseSchema(context, { oppositionGuard: "warn" }).safeParse({
      analyses: [
        analysis({ supportingDecisions: ["SP-INVENTADO"] }),
        analysis({ legalIssueId: "LI-2" }),
      ],
    });

    expect(result.success).toBe(false);
    expect(result.success ? "" : result.error.issues.map((issue) => issue.message).join(" | ")).toContain(
      "SP-INVENTADO",
    );
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
