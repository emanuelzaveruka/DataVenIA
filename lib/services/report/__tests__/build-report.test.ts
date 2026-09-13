import { describe, expect, it } from "vitest";
import {
  buildReport,
  ISSUE_NOT_COVERED_NOTICE,
  ISSUE_NOT_COVERED_REASON,
  NO_ANALYSIS_OPPOSING_NOTICE,
  UNVERIFIED_OPPOSING_PRECEDENTS_NOTICE,
} from "../build-report";
import { analysis, caseAnalysis, evidence, OFFICIAL_URL, scratchpad } from "./fixtures";
import {
  NO_OPPOSING_PRECEDENTS_NOTICE,
  RESEARCH_DISCLAIMER,
  type FinalReport,
} from "../../../schemas/report.schema";

const scratchpads = [
  scratchpad("SP-1"),
  scratchpad("SP-7", { distinguishingFacts: ["Contrato coletivo empresarial, não individual."] }),
];

const evidences = [evidence("EV-1", "SP-1"), evidence("EV-7", "SP-7")];

function build(overrides: Partial<Parameters<typeof buildReport>[0]> = {}) {
  return buildReport({
    caseAnalysis: caseAnalysis(),
    analyses: [analysis()],
    evidences,
    scratchpads,
    ...overrides,
  });
}

function expectReport(result: ReturnType<typeof buildReport>): FinalReport {
  expect(result.isError).toBe(false);
  if (result.isError) throw new Error(result.error.description);
  return result.data;
}

describe("buildReport — seções do §3.10 (HU-26)", () => {
  it("produces every section of the final report for each legal issue", () => {
    const report = expectReport(build());
    const issue = report.issues[0]!;

    expect(report.caseSummary.requests).toContain("Indenização por dano moral");
    expect(issue.conclusion).toContain("abusividade");
    expect(issue.trend.summary).toBe("6 de 10 decisões analisadas sustentam a tese, 3 contrárias, 1 mista.");
    expect(issue.trend.convergence).toBe("MODERADA");
    expect(issue.favorablePoints).toHaveLength(1);
    expect(issue.contraryPoints).toHaveLength(1);
    expect(issue.risks).toHaveLength(1);
    expect(issue.distinguishing).toHaveLength(1);
    expect(issue.suggestedArguments).toHaveLength(1);
    expect(issue.recurringFactors).toEqual(["Prescrição médica expressa"]);
  });

  it("gives every displayed precedent argument, chamber, judge, date, quote and official URL", () => {
    const report = expectReport(build());
    const point = report.issues[0]!.favorablePoints[0]!;

    expect(point.argument).toBe("Sustentar a abusividade com base na Súmula 608 do STJ.");
    expect(point.quote).toBeTruthy();
    expect(point.source.processNumber).toBe("0001234-56.2023.8.16.0001");
    expect(point.source.chamber).toBe("9ª Câmara Cível");
    expect(point.source.judge).toBe("Des. Ricardo Almeida Neto");
    expect(point.source.judgmentDate).toBe("2023-11-14");
    expect(point.source.url).toBe(OFFICIAL_URL);
  });

  it("falls back to the evidence proposition when no suggested argument cites that quote", () => {
    const report = expectReport(build({ analyses: [analysis({ suggestedArguments: [] })] }));
    expect(report.issues[0]!.favorablePoints[0]!.argument).toBe("Sustenta a abusividade da negativa.");
  });

  it("never exposes a percentage of success anywhere in the serialized report (critério de aceite 11)", () => {
    const report = expectReport(build());
    // A URL canônica do portal é percent-encoded (`…/d%c3%bavida/…`), e "3%" casaria com o padrão
    // de percentual sem ter nada a ver com métrica de êxito. O critério 11 é sobre o que o
    // relatório *afirma*, então a varredura cobre o texto — não o endereço da fonte.
    const serialized = JSON.stringify(report, (key, value) => (key === "url" ? undefined : value)).toLowerCase();

    expect(serialized).not.toContain("chance de");
    expect(serialized).not.toContain("probabilidade de êxito");
    expect(serialized).not.toMatch(/\d+\s*%/);
  });

  it("suppresses a model-written conclusion that smuggles in a chance-of-winning metric", () => {
    const report = expectReport(
      build({ analyses: [analysis({ conclusion: "Há 83% de chance de ganhar a demanda." })] }),
    );
    const issue = report.issues[0]!;

    expect(issue.conclusion).toBeUndefined();
    expect(issue.conclusionBlockedReason).toContain("probabilidade de êxito");
    expect(report.omissions.some((omission) => omission.kind === "FORBIDDEN_METRIC")).toBe(true);
  });

  it("suppresses a risk or argument written as a probability of winning", () => {
    const report = expectReport(
      build({
        analyses: [
          analysis({
            risks: [{ description: "Chance de derrota estimada em 40%.", evidenceIds: ["EV-7"] }],
          }),
        ],
      }),
    );

    expect(report.issues[0]!.risks).toHaveLength(0);
  });
});

describe("buildReport — rastreabilidade (HU-27)", () => {
  it("blocks only the item whose source URL is not the official TJPR portal, not the report", () => {
    const offSite = evidence("EV-1", "SP-1", {
      source: { ...evidence("EV-1", "SP-1").source, url: "https://exemplo.com/decisao" },
    });

    const report = expectReport(build({ evidences: [offSite, evidence("EV-7", "SP-7")] }));
    const issue = report.issues[0]!;

    expect(issue.favorablePoints).toHaveLength(0);
    expect(issue.contraryPoints).toHaveLength(1);
    expect(report.omissions.some((omission) => omission.kind === "UNOFFICIAL_SOURCE_URL")).toBe(true);
  });

  it("blocks an item missing chamber, judge or judgment date", () => {
    const incomplete = evidence("EV-1", "SP-1", {
      source: { ...evidence("EV-1", "SP-1").source, chamber: undefined, judge: undefined },
    });

    const report = expectReport(build({ evidences: [incomplete, evidence("EV-7", "SP-7")] }));

    expect(report.issues[0]!.favorablePoints).toHaveLength(0);
    const omission = report.omissions.find((item) => item.kind === "MISSING_PROVENANCE")!;
    expect(omission.reason).toContain("chamber");
    expect(omission.reason).toContain("judge");
  });

  it("records each omission once, even when the same evidence is rejected in several sections", () => {
    const offSite = evidence("EV-1", "SP-1", {
      source: { ...evidence("EV-1", "SP-1").source, url: "http://portal.tjpr.jus.br/x" },
    });

    const report = expectReport(build({ evidences: [offSite, evidence("EV-7", "SP-7")] }));
    const unofficial = report.omissions.filter((omission) => omission.kind === "UNOFFICIAL_SOURCE_URL");

    expect(unofficial).toHaveLength(1);
  });

  it("keeps the sourceHash of every displayed item, so the quote can be re-checked later (§14)", () => {
    const report = expectReport(build());
    expect(report.issues[0]!.favorablePoints[0]!.source.sourceHash).toBe("hash");
  });
});

describe("buildReport — regra anti-alucinação na exibição (HU-25)", () => {
  it("removes a claim whose evidence was not verified, even if the caller forgot to filter it", () => {
    const unverified = evidence("EV-7", "SP-7", { verified: false, matchKind: "NOT_FOUND", similarity: 0 });

    const report = expectReport(build({ evidences: [evidence("EV-1", "SP-1"), unverified] }));
    const issue = report.issues[0]!;

    expect(issue.risks).toHaveLength(0);
    expect(issue.contraryPoints).toHaveLength(0);
    expect(report.omissions.some((omission) => omission.kind === "UNVERIFIED_EVIDENCE")).toBe(true);
  });

  it("carries the upstream policy omissions into the report audit trail (§14)", () => {
    const report = expectReport(
      build({
        policyDropped: [
          {
            legalIssueId: "LI-1",
            kind: "SUGGESTED_ARGUMENT",
            subject: "Tese sem lastro.",
            unverifiedEvidenceIds: ["EV-99"],
          },
        ],
      }),
    );

    expect(report.omissions.some((omission) => omission.subject === "Tese sem lastro.")).toBe(true);
  });

  it("only shows distinguishing facts from decisions that have a verified quote", () => {
    const report = expectReport(
      build({ evidences: [evidence("EV-1", "SP-1")] }),
    );

    expect(report.issues[0]!.distinguishing).toHaveLength(0);
  });
});

describe("buildReport — contrários e classificação (HU-22/HU-29)", () => {
  it("declares explicitly that the sample had no contrary precedent", () => {
    const report = expectReport(
      build({
        analyses: [
          analysis({
            opposingDecisions: [],
            mixedDecisions: [],
            strongestOpposing: [],
            risks: [{ description: "Valor da indenização pode ser reduzido.", evidenceIds: ["EV-1"] }],
          }),
        ],
      }),
    );

    expect(report.issues[0]!.contraryPoints).toHaveLength(0);
    expect(report.issues[0]!.contraryPointsNotice).toBe(NO_OPPOSING_PRECEDENTS_NOTICE);
  });

  it("does not claim the sample was unanimous when the contrary precedents merely failed verification", () => {
    const unverified = evidence("EV-7", "SP-7", { verified: false, matchKind: "NOT_FOUND", similarity: 0 });

    const report = expectReport(build({ evidences: [evidence("EV-1", "SP-1"), unverified] }));

    expect(report.issues[0]!.contraryPointsNotice).toBe(UNVERIFIED_OPPOSING_PRECEDENTS_NOTICE);
  });

  it("classifies a dominant, well-sampled issue as a favorable trend", () => {
    const report = expectReport(
      build({ analyses: [analysis({ opposingDecisions: ["SP-7"], mixedDecisions: [] })] }),
    );

    expect(report.issues[0]!.classification).toBe("TENDENCIA_FAVORAVEL");
    expect(report.issues[0]!.classificationReason).toContain("Convergência alta");
  });

  it("returns INDETERMINADA — never a forced side — when the sample is too small (HU-29)", () => {
    const report = expectReport(
      build({
        analyses: [
          analysis({
            supportingDecisions: ["SP-1"],
            opposingDecisions: ["SP-7"],
            mixedDecisions: [],
          }),
        ],
      }),
    );

    expect(report.issues[0]!.classification).toBe("INDETERMINADA");
    expect(report.issues[0]!.classificationReason).toContain("Amostra pequena");
  });

  it("returns INDETERMINADA when nothing displayable survived verification (HU-29)", () => {
    const report = expectReport(build({ evidences: [] }));

    expect(report.issues[0]!.classification).toBe("INDETERMINADA");
    expect(report.issues[0]!.classificationReason).toContain("Nenhum precedente com trecho verificado");
  });

  it("reports an even split as divided jurisprudence instead of picking a winner", () => {
    const report = expectReport(
      build({
        analyses: [
          analysis({
            supportingDecisions: ["SP-1", "SP-2", "SP-3"],
            opposingDecisions: ["SP-7", "SP-8", "SP-9"],
            mixedDecisions: [],
          }),
        ],
      }),
    );

    expect(report.issues[0]!.classification).toBe("JURISPRUDENCIA_DIVIDIDA");
  });

  it("still reports a legal issue the cross-file left out, as INDETERMINADA", () => {
    const twoIssues = caseAnalysis({
      legalIssues: [
        { id: "LI-1", topic: "Abusividade", question: "É abusiva?", relevance: "HIGH" },
        { id: "LI-2", topic: "Dano moral", question: "Há dano moral?", relevance: "MEDIUM" },
      ],
    });

    const report = expectReport(build({ caseAnalysis: twoIssues }));

    expect(report.issues).toHaveLength(2);
    expect(report.issues[1]!.classification).toBe("INDETERMINADA");
    expect(report.issues[1]!.classificationReason).toContain("não produziu resultado");
    // Sem análise cruzada, nada se sabe sobre a amostra: dizer "nenhum precedente contrário
    // identificado" afirmaria um fato sobre decisões que nunca foram reduzidas (HU-22).
    expect(report.issues[1]!.contraryPointsNotice).toBe(NO_ANALYSIS_OPPOSING_NOTICE);
    expect(report.issues[1]!.contraryPointsNotice).not.toBe(NO_OPPOSING_PRECEDENTS_NOTICE);
  });

  it('reports an issue the sample does not address as INDETERMINADA, blaming the search and not the verification', () => {
    const twoIssues = caseAnalysis({
      legalIssues: [
        { id: "LI-1", topic: "Abusividade", question: "É abusiva?", relevance: "HIGH" },
        { id: "LI-2", topic: "Competência", question: "Cabe ao juizado?", relevance: "LOW" },
      ],
    });

    const report = expectReport(
      build({
        caseAnalysis: twoIssues,
        analyses: [
          analysis(),
          analysis({
            legalIssueId: "LI-2",
            sampleCoverage: "NOT_COVERED",
            conclusion: "As decisões analisadas tratam de cobertura, não de competência.",
            supportingDecisions: [],
            opposingDecisions: [],
            mixedDecisions: [],
            chamberPattern: undefined,
            recurringFactors: [],
            strongestSupporting: [],
            strongestOpposing: [],
            risks: [],
            suggestedArguments: [],
          }),
        ],
      }),
    );

    const uncovered = report.issues[1]!;
    expect(uncovered.classification).toBe("INDETERMINADA");
    expect(uncovered.classificationReason).toBe(ISSUE_NOT_COVERED_REASON);
    expect(uncovered.trend.analyzedCount).toBe(0);
    // A conclusão do modelo sobrevive: é ela que diz ao leitor do que a amostra tratava.
    expect(uncovered.conclusion).toContain("não de competência");
    // Os três avisos de ausência de contrários são distintos de propósito — o desta questão não
    // pode ser lido como "a amostra foi checada e não havia contrário".
    expect(uncovered.contraryPointsNotice).toBe(ISSUE_NOT_COVERED_NOTICE);
    expect(uncovered.contraryPointsNotice).not.toBe(NO_OPPOSING_PRECEDENTS_NOTICE);
    expect(uncovered.contraryPointsNotice).not.toBe(NO_ANALYSIS_OPPOSING_NOTICE);
  });
});

describe("buildReport — aviso e contrato (HU-28)", () => {
  it("always carries the exact research-support disclaimer", () => {
    const report = expectReport(build());
    expect(report.disclaimer).toBe(RESEARCH_DISCLAIMER);
  });

  it("refuses to build a report for a case with no legal issues", () => {
    const result = build({ caseAnalysis: caseAnalysis({ legalIssues: [] }) });

    expect(result.isError).toBe(true);
    if (result.isError) expect(result.error.code).toBe("NO_LEGAL_ISSUES_FOR_REPORT");
  });

  it("summarizes the sample so the reader knows how much was analyzed and omitted", () => {
    const report = expectReport(build());

    expect(report.sample.analyzedDecisions).toBe(2);
    expect(report.sample.verifiedEvidence).toBe(2);
    expect(report.sample.omittedItems).toBe(report.omissions.length);
  });
});
