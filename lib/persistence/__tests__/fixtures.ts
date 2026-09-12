import type {
  AnalysisRunRecord,
  CaseAnalysisRecord,
  CrossFileAnalysisRecord,
  DecisionScratchpadRecord,
  ErrorRecord,
  FinalReportRecord,
  JurisprudenceDecisionRecord,
  JurisprudenceSearchRecord,
  ToolExecutionLog,
  UploadedDocumentRecord,
  VerifiedEvidenceRecord,
} from "../../schemas/persistence.schema";
import type { CaseAnalysis } from "../../schemas/case-analysis.schema";
import type { CrossFileAnalysis } from "../../schemas/cross-file.schema";
import type { DecisionScratchpad } from "../../schemas/scratchpad.schema";
import type { VerifiedEvidence } from "../../schemas/evidence.schema";

export const RUN_ID = "run-1";
export const NOW = "2026-09-12T10:00:00.000Z";

export function runRecord(overrides: Partial<AnalysisRunRecord> = {}): AnalysisRunRecord {
  return {
    runId: RUN_ID,
    traceId: "trace-1",
    stage: "DOCUMENT_ANALYSIS",
    status: "UPLOADED",
    pipelineVersion: "1.0.0",
    startedAt: NOW,
    ...overrides,
  };
}

export function documentRecord(
  overrides: Partial<UploadedDocumentRecord> = {},
): UploadedDocumentRecord {
  return {
    documentId: "doc-1",
    runId: RUN_ID,
    fileName: "peticao.pdf",
    mimeType: "application/pdf",
    contentHash: "a".repeat(64),
    sanitizedText: "Texto sanitizado com [CPF_1] e [NOME_1].",
    redactions: [{ type: "CPF_CNPJ", marker: "[CPF_1]", count: 1 }],
    createdAt: NOW,
    ...overrides,
  };
}

export function caseAnalysis(): CaseAnalysis {
  return {
    parties: { plaintiff: "[NOME_1]", defendant: "Operadora" },
    facts: ["Negativa de cobertura."],
    requests: ["Cobertura do tratamento"],
    legalIssues: [
      { id: "LI-1", topic: "Abusividade", question: "A negativa é abusiva?", relevance: "HIGH" },
    ],
    clientArguments: [],
    opposingArguments: [],
    citedLaws: [],
    citedPrecedents: [],
    evidenceSummary: [],
  };
}

export function caseAnalysisRecord(): CaseAnalysisRecord {
  return { runId: RUN_ID, documentId: "doc-1", content: caseAnalysis(), createdAt: NOW };
}

export function searchRecord(): JurisprudenceSearchRecord {
  return {
    searchId: "search-1",
    runId: RUN_ID,
    query: { query: "plano de saúde negativa de cobertura" },
    provider: "fixture",
    totalCount: 9,
    items: [
      {
        id: "fixture-001",
        court: "TJPR",
        chamber: "9ª Câmara Cível",
        url: "https://portal.tjpr.jus.br/jurisprudencia/publico/#/decisao/fixture-001",
        source: "TJPR",
      },
    ],
    createdAt: NOW,
  };
}

export function decisionRecord(
  overrides: Partial<JurisprudenceDecisionRecord> = {},
): JurisprudenceDecisionRecord {
  return {
    provider: "fixture",
    sourceId: "fixture-001",
    url: "https://portal.tjpr.jus.br/jurisprudencia/publico/#/decisao/fixture-001",
    court: "TJPR",
    chamber: "9ª Câmara Cível",
    rawText: "EMENTA: a negativa de cobertura é abusiva.",
    sourceHash: "b".repeat(64),
    fetchedAt: NOW,
    ...overrides,
  };
}

export function scratchpad(overrides: Partial<DecisionScratchpad> = {}): DecisionScratchpad {
  return {
    scratchpadId: "SP-1",
    schemaVersion: "1.0.0",
    source: {
      provider: "TJPR",
      sourceId: "fixture-001",
      url: "https://portal.tjpr.jus.br/jurisprudencia/publico/#/decisao/fixture-001",
      sourceHash: "b".repeat(64),
    },
    relevance: { score: 0.9, reason: "Mesma tese." },
    caseSummary: "Negativa reputada abusiva.",
    facts: [],
    legalIssues: [],
    holdings: [{ proposition: "Negativa abusiva", stance: "SUPPORTS", reasoning: "Prescrição médica." }],
    favorablePoints: [],
    contraryPoints: [],
    distinguishingFacts: [],
    citedLaws: [],
    citedPrecedents: [],
    evidenceCandidates: [
      { id: "EV-1", quote: "é abusiva", context: "Ementa.", purpose: "Sustenta a tese." },
    ],
    confidence: 0.9,
    status: "VALID",
    ...overrides,
  };
}

export function scratchpadRecord(
  overrides: Partial<DecisionScratchpadRecord> = {},
): DecisionScratchpadRecord {
  const content = overrides.content ?? scratchpad();
  return {
    scratchpadId: content.scratchpadId,
    runId: RUN_ID,
    decisionId: "fixture-001",
    idempotencyKey: "c".repeat(64),
    schemaVersion: "1.0.0",
    pipelineVersion: "1.0.0",
    promptVersion: "1.0.0",
    modelVersion: "fake-model",
    status: content.status,
    createdAt: NOW,
    ...overrides,
    content,
  };
}

export function crossFileAnalysis(): CrossFileAnalysis {
  return {
    legalIssueId: "LI-1",
    conclusion: "A Câmara reconhece a abusividade.",
    supportingDecisions: ["SP-1"],
    opposingDecisions: [],
    mixedDecisions: [],
    recurringFactors: [],
    strongestSupporting: ["SP-1"],
    strongestOpposing: [],
    risks: [],
    suggestedArguments: [{ argument: "Sustentar a abusividade.", evidenceIds: ["EV-1"] }],
  };
}

export function crossFileRecord(): CrossFileAnalysisRecord {
  return { runId: RUN_ID, legalIssueId: "LI-1", content: crossFileAnalysis(), createdAt: NOW };
}

export function verifiedEvidence(): VerifiedEvidence {
  return {
    evidenceId: "EV-1",
    scratchpadId: "SP-1",
    proposition: "Sustenta a tese.",
    quote: "é abusiva",
    context: "Ementa.",
    source: {
      url: "https://portal.tjpr.jus.br/jurisprudencia/publico/#/decisao/fixture-001",
      sourceHash: "b".repeat(64),
    },
    verified: true,
    matchKind: "EXACT",
    similarity: 1,
  };
}

export function evidenceRecord(): VerifiedEvidenceRecord {
  return { runId: RUN_ID, content: verifiedEvidence(), createdAt: NOW };
}

export function reportRecord(): FinalReportRecord {
  return {
    reportId: "report-1",
    runId: RUN_ID,
    content: {
      reportId: "report-1",
      schemaVersion: "1.0.0",
      generatedAt: NOW,
      disclaimer:
        "Resultado de apoio à pesquisa. Confirme a fonte e realize revisão jurídica independente.",
      caseSummary: {
        parties: {},
        requests: ["Cobertura do tratamento"],
        facts: ["Negativa de cobertura."],
      },
      issues: [
        {
          legalIssueId: "LI-1",
          topic: "Abusividade",
          question: "A negativa é abusiva?",
          relevance: "HIGH",
          classification: "TENDENCIA_FAVORAVEL",
          classificationReason: "Convergência moderada na amostra.",
          trend: {
            analyzedCount: 1,
            supportingCount: 1,
            opposingCount: 0,
            mixedCount: 0,
            summary: "1 de 1 decisão analisada sustenta a tese, 0 contrárias, 0 mistas.",
            convergence: "AMOSTRA_INSUFICIENTE",
          },
          recurringFactors: [],
          favorablePoints: [],
          contraryPoints: [],
          contraryPointsNotice: "Nenhum precedente contrário identificado na amostra.",
          risks: [],
          distinguishing: [],
          suggestedArguments: [],
        },
      ],
      sample: { analyzedDecisions: 1, verifiedEvidence: 1, omittedItems: 0 },
      omissions: [],
    },
    createdAt: NOW,
  };
}

export function toolExecutionLog(overrides: Partial<ToolExecutionLog> = {}): ToolExecutionLog {
  return {
    traceId: "trace-1",
    workflowId: RUN_ID,
    toolName: "validateFile",
    attempt: 1,
    startedAt: NOW,
    durationMs: 12,
    success: true,
    ...overrides,
  };
}

export function errorRecord(overrides: Partial<ErrorRecord> = {}): ErrorRecord {
  return {
    runId: RUN_ID,
    traceId: "trace-1",
    code: "UPSTREAM_UNAVAILABLE",
    category: "UPSTREAM",
    severity: "ERROR",
    description: "TJPR responded 503 for /jurisprudencia",
    userMessage: "A fonte está instável no momento.",
    isRetryable: true,
    occurredAt: NOW,
    ...overrides,
  };
}
