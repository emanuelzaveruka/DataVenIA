import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getLlmProvider } from "../../../lib/llm/get-llm-provider";
import { getJurisprudenceProvider } from "../../../lib/providers/get-jurisprudence-provider";
import { createCachedJurisprudenceProvider } from "../../../lib/providers/cached-jurisprudence-provider";
import { validateFile } from "../../../lib/services/document/validate-file";
import { parseDocument } from "../../../lib/services/document/parse-document";
import { sanitizeDocument } from "../../../lib/services/document/sanitize";
import { analyzeCase } from "../../../lib/services/case-analysis/analyze-case";
import { generateSearchQueries } from "../../../lib/services/query-generation/generate-queries";
import { applySearchFunnel } from "../../../lib/services/jurisprudence/search-funnel";
import { buildPreRankingContext, rankCandidates } from "../../../lib/services/jurisprudence/pre-rank";
import { selectForScratchpad } from "../../../lib/services/jurisprudence/select-candidates";
import { generateScratchpads } from "../../../lib/services/scratchpad/generate-scratchpads";
import { analyzeCrossFile } from "../../../lib/services/cross-file/analyze-cross-file";
import { verifyEvidence } from "../../../lib/services/evidence/verify-evidence";
import { enforceEvidencePolicy } from "../../../lib/services/evidence/enforce-evidence-policy";
import { buildReport } from "../../../lib/services/report/build-report";
import { getRepository } from "../../../lib/persistence/get-repository";
import { createRepositoryScratchpadCache } from "../../../lib/persistence/scratchpad-cache";
import { createExecutionRecorder } from "../../../lib/observability/execution-recorder";
import { buildPipelineProgress } from "../../../lib/observability/pipeline-progress";
import { PIPELINE_VERSION, scratchpadVersions } from "../../../lib/config/versions";
import { createStageRecorder } from "../../../lib/workflow/pipeline-stage-event";
import { MIN_VALID_SCRATCHPADS } from "../../../lib/config/limits";
import { createAppError, type AppError } from "../../../lib/errors/app-error";
import type { ToolResult } from "../../../lib/errors/tool-result";
import type { JurisprudenceSearchItem } from "../../../lib/schemas/search.schema";
import type { JurisFlowRepository } from "../../../lib/persistence/repository";

export const runtime = "nodejs";

const STAGE = "DOCUMENT_ANALYSIS" as const;

function errorResponse(error: AppError) {
  const status =
    error.category === "VALIDATION" || error.category === "PARSING"
      ? 422
      : error.category === "RATE_LIMIT"
        ? 429
        : error.category === "AUTH"
          ? 401
          : 500;
  return NextResponse.json({ error }, { status });
}

async function persist<T>(
  result: Promise<ToolResult<T>>,
  failWith: (error: AppError) => Promise<NextResponse>,
): Promise<T | NextResponse> {
  const saved = await result;
  if (saved.isError) return failWith(saved.error);
  return saved.data;
}

function unexpectedError(operation: string, cause: unknown): AppError {
  return createAppError({
    code: "PIPELINE_UNEXPECTED_ERROR",
    category: "INTERNAL",
    severity: "FATAL",
    description: `${operation} failed unexpectedly: ${cause instanceof Error ? cause.message : String(cause)}`,
    userMessage: "Não foi possível concluir a análise por uma falha inesperada do pipeline.",
    isRetryable: false,
    operation,
  });
}

function insufficientScratchpadsError(validCount: number): AppError {
  return createAppError({
    code: "INSUFFICIENT_VALID_SCRATCHPADS",
    category: "BUSINESS_RULE",
    severity: "ERROR",
    description: `Only ${validCount} valid scratchpads were produced; minimum required is ${MIN_VALID_SCRATCHPADS}`,
    userMessage:
      "Não houve decisões analisadas com qualidade suficiente para consolidar um relatório confiável.",
    isRetryable: false,
    operation: "generateScratchpads",
    metadata: { validCount, minValidScratchpads: MIN_VALID_SCRATCHPADS },
  });
}

function dedupeSearchItems(items: JurisprudenceSearchItem[]): JurisprudenceSearchItem[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

export async function POST(request: Request) {
  const recorder = createStageRecorder();
  let repository: JurisFlowRepository;
  try {
    repository = getRepository();
  } catch (cause) {
    return errorResponse(unexpectedError("getRepository", cause));
  }

  // Uma execução (§11.8) e um traceId por requisição: é o que amarra documento, logs de tool e
  // erros na mesma linha do tempo auditável (HU-34/HU-35).
  const runId = randomUUID();
  const traceId = randomUUID();
  const startedAt = new Date().toISOString();

  const execution = createExecutionRecorder({
    traceId,
    workflowId: runId,
    sink: (log) => void repository.saveToolExecution(log),
  });

  async function failWith(error: AppError) {
    await repository.saveError({
      runId,
      traceId,
      code: error.code,
      category: error.category,
      severity: error.severity,
      description: error.description,
      userMessage: error.userMessage,
      isRetryable: error.isRetryable,
      operation: error.operation,
      metadata: error.metadata,
      occurredAt: new Date().toISOString(),
    });
    await repository.updateRun(runId, { status: "FAILED", finishedAt: new Date().toISOString() });
    return errorResponse(error);
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: { code: "MISSING_FILE", userMessage: "Envie um arquivo no campo \"file\"." } },
      { status: 400 },
    );
  }

  const run = await repository.createRun({
    runId,
    traceId,
    stage: STAGE,
    status: "UPLOADED",
    pipelineVersion: PIPELINE_VERSION,
    startedAt,
  });
  if (run.isError) return errorResponse(run.error);

  const receivedAt = Date.now();
  recorder.record("RECEIVED", "Arquivo recebido", "COMPLETED", receivedAt);

  const buffer = Buffer.from(await file.arrayBuffer());

  const validation = await execution.run("validateFile", () => validateFile(buffer, file.name));
  if (validation.isError) {
    recorder.record("VALIDATING", "Validando arquivo", "FAILED", receivedAt);
    return failWith(validation.error);
  }
  recorder.record("VALIDATING", "Validando arquivo", "COMPLETED", receivedAt);

  const parsed = await execution.run("parseDocument", () =>
    parseDocument(buffer, file.name, validation.data.mimeType),
  );
  if (parsed.isError) {
    recorder.record("PARSING", "Extraindo texto", "FAILED", receivedAt);
    return failWith(parsed.error);
  }
  recorder.record("PARSING", "Extraindo texto", "COMPLETED", receivedAt);

  const sanitized = await execution.run("sanitizeDocument", async () =>
    sanitizeDocument(parsed.data.documentId, parsed.data.text),
  );
  if (sanitized.isError) {
    recorder.record("SANITIZING", "Sanitizando dados pessoais", "FAILED", receivedAt);
    return failWith(sanitized.error);
  }
  recorder.record("SANITIZING", "Sanitizando dados pessoais", "COMPLETED", receivedAt);

  // Só o texto sanitizado é persistido (HU-05/HU-34): `parsed.data.text` (bruto) morre aqui, no
  // escopo da requisição, e não existe coluna capaz de recebê-lo.
  const document = await persist(repository.saveDocument({
    documentId: parsed.data.documentId,
    runId,
    fileName: parsed.data.fileName,
    mimeType: parsed.data.mimeType,
    contentHash: parsed.data.metadata.hash,
    pageCount: parsed.data.metadata.pageCount,
    sanitizedText: sanitized.data.sanitizedText,
    redactions: sanitized.data.redactions,
    createdAt: new Date().toISOString(),
  }), failWith);
  if (document instanceof NextResponse) return document;

  const documentParsed = await persist(repository.updateRun(runId, { status: "DOCUMENT_PARSED" }), failWith);
  if (documentParsed instanceof NextResponse) return documentParsed;

  let llmProvider;
  try {
    llmProvider = getLlmProvider();
  } catch (cause) {
    return failWith(unexpectedError("getLlmProvider", cause));
  }

  const sourceProvider = getJurisprudenceProvider();
  const jurisprudenceProvider = createCachedJurisprudenceProvider(sourceProvider, repository);

  const caseAnalysis = await execution.run("analyzeCase", () =>
    analyzeCase(sanitized.data, llmProvider),
  );
  if (caseAnalysis.isError) return failWith(caseAnalysis.error);

  const savedCaseAnalysis = await persist(repository.saveCaseAnalysis({
    runId,
    documentId: parsed.data.documentId,
    content: caseAnalysis.data,
    createdAt: new Date().toISOString(),
  }), failWith);
  if (savedCaseAnalysis instanceof NextResponse) return savedCaseAnalysis;

  const caseAnalyzed = await persist(
    repository.updateRun(runId, { stage: "QUERY_GENERATION", status: "CASE_ANALYZED" }),
    failWith,
  );
  if (caseAnalyzed instanceof NextResponse) return caseAnalyzed;

  const queryPlan = await execution.run("generateSearchQueries", () =>
    generateSearchQueries(caseAnalysis.data, llmProvider),
  );
  if (queryPlan.isError) return failWith(queryPlan.error);

  const queriesGenerated = await persist(repository.updateRun(runId, { status: "QUERIES_GENERATED" }), failWith);
  if (queriesGenerated instanceof NextResponse) return queriesGenerated;

  const foundItems: JurisprudenceSearchItem[] = [];
  for (const searchQuery of queryPlan.data.queries) {
    const query = { query: searchQuery.query };
    const searchResult = await execution.run("searchJurisprudence", () =>
      jurisprudenceProvider.search(query),
    );
    if (searchResult.isError) return failWith(searchResult.error);

    const savedSearch = await persist(repository.saveSearch({
      searchId: randomUUID(),
      runId,
      query,
      provider: sourceProvider.name,
      totalCount: searchResult.data.totalCount,
      items: searchResult.data.items,
      createdAt: new Date().toISOString(),
    }), failWith);
    if (savedSearch instanceof NextResponse) return savedSearch;

    const funneled = applySearchFunnel(searchResult.data);
    if (funneled.isError) return failWith(funneled.error);
    foundItems.push(...funneled.data);
  }

  const uniqueItems = dedupeSearchItems(foundItems);
  const ranked = rankCandidates(uniqueItems, buildPreRankingContext(caseAnalysis.data));
  const selected = selectForScratchpad(ranked);
  if (selected.isError) return failWith(selected.error);

  const searchComplete = await persist(
    repository.updateRun(runId, { stage: "SCRATCHPAD_GENERATION", status: "DECISIONS_SELECTED" }),
    failWith,
  );
  if (searchComplete instanceof NextResponse) return searchComplete;

  const versions = scratchpadVersions(llmProvider);
  const scratchpadCache = createRepositoryScratchpadCache({ repository, runId, versions });
  const scratchpadBatch = await execution.run("generateScratchpads", () =>
    generateScratchpads(selected.data, llmProvider, jurisprudenceProvider, undefined, scratchpadCache),
  );
  if (scratchpadBatch.isError) return failWith(scratchpadBatch.error);

  const validScratchpads = scratchpadBatch.data.scratchpads.filter((scratchpad) => scratchpad.status === "VALID");
  if (validScratchpads.length < MIN_VALID_SCRATCHPADS) {
    return failWith(insufficientScratchpadsError(validScratchpads.length));
  }

  const scratchpadsComplete = await persist(
    repository.updateRun(runId, { stage: "CROSS_FILE_ANALYSIS", status: "SCRATCHPADS_COMPLETE" }),
    failWith,
  );
  if (scratchpadsComplete instanceof NextResponse) return scratchpadsComplete;

  const crossFile = await execution.run("analyzeCrossFile", () =>
    analyzeCrossFile(caseAnalysis.data, scratchpadBatch.data.scratchpads, llmProvider),
  );
  if (crossFile.isError) return failWith(crossFile.error);

  const savedCrossFile = await persist(repository.saveCrossFileAnalyses(
    crossFile.data.analyses.map((analysis) => ({
      runId,
      legalIssueId: analysis.legalIssueId,
      content: analysis,
      createdAt: new Date().toISOString(),
    })),
  ), failWith);
  if (savedCrossFile instanceof NextResponse) return savedCrossFile;

  const crossFileComplete = await persist(
    repository.updateRun(runId, { stage: "EVIDENCE_VERIFICATION", status: "CROSSFILE_COMPLETE" }),
    failWith,
  );
  if (crossFileComplete instanceof NextResponse) return crossFileComplete;

  const evidence = await execution.run("verifyEvidence", () =>
    verifyEvidence(crossFile.data.analyses, scratchpadBatch.data.scratchpads, sourceProvider),
  );
  if (evidence.isError) return failWith(evidence.error);

  const savedEvidences = await persist(repository.saveEvidences(
    evidence.data.evidences.map((item) => ({
      runId,
      content: item,
      createdAt: new Date().toISOString(),
    })),
  ), failWith);
  if (savedEvidences instanceof NextResponse) return savedEvidences;

  const evidenceVerified = await persist(
    repository.updateRun(runId, { stage: "REPORT_GENERATION", status: "EVIDENCE_VERIFIED" }),
    failWith,
  );
  if (evidenceVerified instanceof NextResponse) return evidenceVerified;

  const evidencePolicy = enforceEvidencePolicy(crossFile.data.analyses, evidence.data.evidences);
  const report = await execution.run("buildReport", async () =>
    buildReport({
      caseAnalysis: caseAnalysis.data,
      analyses: evidencePolicy.analyses,
      evidences: evidence.data.evidences,
      scratchpads: scratchpadBatch.data.scratchpads,
      policyDropped: evidencePolicy.dropped,
    }),
  );
  if (report.isError) return failWith(report.error);

  const savedReport = await persist(repository.saveReport({
    reportId: report.data.reportId,
    runId,
    content: report.data,
    createdAt: new Date().toISOString(),
  }), failWith);
  if (savedReport instanceof NextResponse) return savedReport;

  const reportComplete = await persist(
    repository.updateRun(runId, {
      status: scratchpadBatch.data.status === "PARTIAL_SUCCESS" ? "PARTIAL_SUCCESS" : "REPORT_COMPLETE",
      finishedAt: new Date().toISOString(),
    }),
    failWith,
  );
  if (reportComplete instanceof NextResponse) return reportComplete;

  return NextResponse.json({
    runId,
    traceId,
    documentId: parsed.data.documentId,
    fileName: parsed.data.fileName,
    mimeType: parsed.data.mimeType,
    metadata: parsed.data.metadata,
    sanitizedTextPreview: sanitized.data.sanitizedText.slice(0, 2000),
    redactions: sanitized.data.redactions,
    stages: recorder.events,
    progress: buildPipelineProgress({
      documentParsed: true,
      queriesGenerated: queryPlan.data.queries.length,
      candidatesFound: uniqueItems.length,
      decisionsSelected: selected.data.length,
      validScratchpads: validScratchpads.length,
      crossFileComplete: true,
      verifiedEvidences: evidence.data.verifiedCount,
      reportReady: true,
    }),
    provider: {
      llm: llmProvider.name,
      model: llmProvider.model,
      jurisprudence: sourceProvider.name,
    },
    scratchpads: {
      requested: scratchpadBatch.data.requested,
      processed: scratchpadBatch.data.processed,
      failed: scratchpadBatch.data.failed,
      status: scratchpadBatch.data.status,
    },
    report: report.data,
  });
}
