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
import { createGuardedExecution } from "../../../lib/hooks/guarded-execution";
import { PIPELINE_VERSION, scratchpadVersions } from "../../../lib/config/versions";
import { createStageRecorder } from "../../../lib/workflow/pipeline-stage-event";
import type { WorkflowStage } from "../../../lib/workflow/state-machine";
import { MIN_VALID_SCRATCHPADS } from "../../../lib/config/limits";
import { createAppError, type AppError } from "../../../lib/errors/app-error";
import type { ToolResult } from "../../../lib/errors/tool-result";
import type { JurisprudenceSearchItem } from "../../../lib/schemas/search.schema";
import type { DataVeniaRepository } from "../../../lib/persistence/repository";

export const runtime = "nodejs";

const INITIAL_STAGE = "DOCUMENT_ANALYSIS" as const;

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
  let repository: DataVeniaRepository;
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
  let currentStage: WorkflowStage = INITIAL_STAGE;

  const guardedExecution = createGuardedExecution({
    getStage: () => currentStage,
    recorder: execution,
    onBlockedTool: async (error) => {
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
    },
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
    stage: INITIAL_STAGE,
    status: "UPLOADED",
    pipelineVersion: PIPELINE_VERSION,
    startedAt,
  });
  if (run.isError) return errorResponse(run.error);

  const receivedAt = Date.now();
  recorder.record("RECEIVED", "Arquivo Recebido", "COMPLETED", receivedAt, {
    nodeName: "01. Upload de Documento",
    input: { fileName: file.name, fileSize: file.size, mimeType: file.type },
    output: { status: "RECEIVED", sizeBytes: file.size },
    logs: [`[INFO] Arquivo ${file.name} carregado na API com sucesso.`],
  });

  const buffer = Buffer.from(await file.arrayBuffer());

  const tVal = Date.now();
  const validation = await guardedExecution.run("validateFile", () => validateFile(buffer, file.name));
  if (validation.isError) {
    recorder.record("VALIDATING", "Validação de Arquivo", "FAILED", tVal, {
      nodeName: "02. Validação do Formato",
      input: { fileName: file.name, bytes: buffer.length },
      error: { code: validation.error.code, message: validation.error.userMessage || validation.error.description || validation.error.code, description: validation.error.description },
      logs: [`[ERROR] Falha ao validar extensão ou formato: ${validation.error.description}`],
    });
    return failWith(validation.error);
  }
  recorder.record("VALIDATING", "Validação de Arquivo", "COMPLETED", tVal, {
    nodeName: "02. Validação do Formato",
    input: { fileName: file.name, bytes: buffer.length },
    output: validation.data,
    logs: [`[INFO] Extensão e MIME Type ${validation.data.mimeType} aprovados.`],
  });

  const tParse = Date.now();
  const parsed = await guardedExecution.run("parseDocument", () =>
    parseDocument(buffer, file.name, validation.data.mimeType),
  );
  if (parsed.isError) {
    recorder.record("PARSING", "Extração de Texto", "FAILED", tParse, {
      nodeName: "03. Parsing de PDF/DOCX",
      input: { fileName: file.name, mimeType: validation.data.mimeType },
      error: { code: parsed.error.code, message: parsed.error.userMessage || parsed.error.description || parsed.error.code, description: parsed.error.description },
      logs: [`[ERROR] Falha na extração de texto: ${parsed.error.description}`],
    });
    return failWith(parsed.error);
  }
  recorder.record("PARSING", "Extração de Texto", "COMPLETED", tParse, {
    nodeName: "03. Parsing de PDF/DOCX",
    input: { fileName: file.name, mimeType: validation.data.mimeType },
    output: { documentId: parsed.data.documentId, metadata: parsed.data.metadata, charCount: parsed.data.text.length },
    logs: [`[INFO] Texto extraído (${parsed.data.text.length} caracteres, ${parsed.data.metadata.pageCount} páginas).`],
  });

  const tSan = Date.now();
  const sanitized = await guardedExecution.run("sanitizeDocument", async () =>
    sanitizeDocument(parsed.data.documentId, parsed.data.text),
  );
  if (sanitized.isError) {
    recorder.record("SANITIZING", "Sanitização PII (HU-05)", "FAILED", tSan, {
      nodeName: "04. Sanitização LGPD/PII",
      input: { documentId: parsed.data.documentId },
      error: { code: sanitized.error.code, message: sanitized.error.userMessage || sanitized.error.description || sanitized.error.code, description: sanitized.error.description },
      logs: [`[ERROR] Falha na sanitização PII: ${sanitized.error.description}`],
    });
    return failWith(sanitized.error);
  }
  recorder.record("SANITIZING", "Sanitização PII (HU-05)", "COMPLETED", tSan, {
    nodeName: "04. Sanitização LGPD/PII",
    input: { rawLength: parsed.data.text.length },
    output: { redactionsCount: sanitized.data.redactions.length, sanitizedLength: sanitized.data.sanitizedText.length },
    logs: [`[INFO] ${sanitized.data.redactions.length} dados pessoais mascarados/sanitizados.`],
  });

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

  const tCase = Date.now();
  const caseAnalysis = await guardedExecution.run("analyzeCase", () =>
    analyzeCase(sanitized.data, llmProvider),
  );
  if (caseAnalysis.isError) {
    recorder.record("DOCUMENT_ANALYSIS", "Análise de Caso (LLM)", "FAILED", tCase, {
      nodeName: "05. Case Understanding (Fatos/Teses)",
      input: { sanitizedLength: sanitized.data.sanitizedText.length },
      error: { code: caseAnalysis.error.code, message: caseAnalysis.error.userMessage || caseAnalysis.error.description || caseAnalysis.error.code, description: caseAnalysis.error.description },
    });
    return failWith(caseAnalysis.error);
  }
  recorder.record("DOCUMENT_ANALYSIS", "Análise de Caso (LLM)", "COMPLETED", tCase, {
    nodeName: "05. Case Understanding (Fatos/Teses)",
    input: { sanitizedLength: sanitized.data.sanitizedText.length },
    output: { legalIssuesCount: caseAnalysis.data.legalIssues.length, factsCount: caseAnalysis.data.facts.length },
    logs: [`[INFO] Análise do caso concluída com ${caseAnalysis.data.legalIssues.length} teses jurídicas mapeadas.`],
  });

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
  currentStage = "QUERY_GENERATION";

  const tQueries = Date.now();
  const queryPlan = await guardedExecution.run("generateSearchQueries", () =>
    generateSearchQueries(caseAnalysis.data, llmProvider),
  );
  if (queryPlan.isError) {
    recorder.record("QUERY_GENERATION", "Geração de Queries", "FAILED", tQueries, {
      nodeName: "06. Query Builder (LLM)",
      input: { legalIssuesCount: caseAnalysis.data.legalIssues.length },
      error: { code: queryPlan.error.code, message: queryPlan.error.userMessage || queryPlan.error.description || queryPlan.error.code, description: queryPlan.error.description },
    });
    return failWith(queryPlan.error);
  }
  recorder.record("QUERY_GENERATION", "Geração de Queries", "COMPLETED", tQueries, {
    nodeName: "06. Query Builder (LLM)",
    input: { legalIssuesCount: caseAnalysis.data.legalIssues.length },
    output: { totalQueries: queryPlan.data.queries.length, queries: queryPlan.data.queries },
    logs: [`[INFO] ${queryPlan.data.queries.length} pesquisas jurídicas personalizadas foram criadas.`],
  });

  const queriesGenerated = await persist(
    repository.updateRun(runId, { stage: "SEARCH", status: "QUERIES_GENERATED" }),
    failWith,
  );
  if (queriesGenerated instanceof NextResponse) return queriesGenerated;
  currentStage = "SEARCH";

  const tSearch = Date.now();
  const foundItems: JurisprudenceSearchItem[] = [];
  const jurisprudenceSources = new Set<string>();
  for (const searchQuery of queryPlan.data.queries) {
    const query = { query: searchQuery.query };
    const searchResult = await guardedExecution.run("searchJurisprudence", () =>
      jurisprudenceProvider.search(query),
    );
    if (searchResult.isError) {
      recorder.record("SEARCH", "Busca Jurisprudencial", "FAILED", tSearch, {
        nodeName: "07. Busca & Pre-Ranking (TJPR)",
        input: { query: searchQuery.query },
        error: { code: searchResult.error.code, message: searchResult.error.userMessage || searchResult.error.description || searchResult.error.code },
      });
      return failWith(searchResult.error);
    }
    const searchProvider = searchResult.metadata?.source ?? sourceProvider.name;
    jurisprudenceSources.add(searchProvider);

    const savedSearch = await persist(repository.saveSearch({
      searchId: randomUUID(),
      runId,
      query,
      provider: searchProvider,
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
  if (selected.isError) {
    recorder.record("SEARCH", "Seleção de Julgados", "FAILED", tSearch, {
      nodeName: "07. Busca & Pre-Ranking (TJPR)",
      input: { totalFound: uniqueItems.length },
      error: { code: selected.error.code, message: selected.error.userMessage || selected.error.description || selected.error.code },
    });
    return failWith(selected.error);
  }

  recorder.record("SEARCH", "Busca Jurisprudencial", "COMPLETED", tSearch, {
    nodeName: "07. Busca & Pre-Ranking (TJPR)",
    input: { totalQueries: queryPlan.data.queries.length },
    output: { totalFound: uniqueItems.length, selectedCount: selected.data.length },
    logs: [`[INFO] ${uniqueItems.length} acórdãos encontrados; top ${selected.data.length} selecionados.`],
  });

  const searchComplete = await persist(
    repository.updateRun(runId, { stage: "SCRATCHPAD_GENERATION", status: "DECISIONS_SELECTED" }),
    failWith,
  );
  if (searchComplete instanceof NextResponse) return searchComplete;
  currentStage = "SCRATCHPAD_GENERATION";

  const tScratch = Date.now();
  const versions = scratchpadVersions(llmProvider);
  const scratchpadCache = createRepositoryScratchpadCache({ repository, runId, versions });
  const scratchpadBatch = await guardedExecution.run("generateScratchpads", () =>
    generateScratchpads(selected.data, llmProvider, jurisprudenceProvider, undefined, scratchpadCache),
  );
  if (scratchpadBatch.isError) {
    recorder.record("SCRATCHPAD_GENERATION", "Geração de Scratchpads", "FAILED", tScratch, {
      nodeName: "08. Extraction Scratchpads",
      input: { count: selected.data.length },
      error: { code: scratchpadBatch.error.code, message: scratchpadBatch.error.userMessage || scratchpadBatch.error.description || scratchpadBatch.error.code },
    });
    return failWith(scratchpadBatch.error);
  }

  const validScratchpads = scratchpadBatch.data.scratchpads.filter((scratchpad) => scratchpad.status === "VALID");
  if (validScratchpads.length < MIN_VALID_SCRATCHPADS) {
    recorder.record("SCRATCHPAD_GENERATION", "Geração de Scratchpads", "FAILED", tScratch, {
      nodeName: "08. Extraction Scratchpads",
      input: { count: selected.data.length },
      error: { code: "INSUFFICIENT_VALID_SCRATCHPADS", message: `Apenas ${validScratchpads.length} scratchpads válidos.` },
    });
    return failWith(insufficientScratchpadsError(validScratchpads.length));
  }

  recorder.record("SCRATCHPAD_GENERATION", "Geração de Scratchpads", "COMPLETED", tScratch, {
    nodeName: "08. Extraction Scratchpads",
    input: { selectedCount: selected.data.length },
    output: { validCount: validScratchpads.length, status: scratchpadBatch.data.status },
    logs: [`[INFO] ${validScratchpads.length} scratchpads gerados e validados por proposição.`],
  });

  const scratchpadsComplete = await persist(
    repository.updateRun(runId, { stage: "CROSS_FILE_ANALYSIS", status: "SCRATCHPADS_COMPLETE" }),
    failWith,
  );
  if (scratchpadsComplete instanceof NextResponse) return scratchpadsComplete;
  currentStage = "CROSS_FILE_ANALYSIS";

  const tCross = Date.now();
  const crossFile = await guardedExecution.run("analyzeCrossFile", () =>
    analyzeCrossFile(caseAnalysis.data, scratchpadBatch.data.scratchpads, llmProvider),
  );
  if (crossFile.isError) {
    recorder.record("CROSS_FILE_ANALYSIS", "Análise Cruzada", "FAILED", tCross, {
      nodeName: "09. Cross-File Analysis",
      input: { scratchpadsCount: scratchpadBatch.data.scratchpads.length },
      error: { code: crossFile.error.code, message: crossFile.error.userMessage || crossFile.error.description || crossFile.error.code },
    });
    return failWith(crossFile.error);
  }

  recorder.record("CROSS_FILE_ANALYSIS", "Análise Cruzada", "COMPLETED", tCross, {
    nodeName: "09. Cross-File Analysis",
    input: { scratchpadsCount: scratchpadBatch.data.scratchpads.length },
    output: { analysesCount: crossFile.data.analyses.length },
    logs: [`[INFO] Análise cruzada das teses e precedentes finalizada com sucesso.`],
  });

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
  currentStage = "EVIDENCE_VERIFICATION";

  const tEv = Date.now();
  const evidence = await guardedExecution.run("verifyEvidence", () =>
    verifyEvidence(crossFile.data.analyses, scratchpadBatch.data.scratchpads, sourceProvider),
  );
  if (evidence.isError) {
    recorder.record("EVIDENCE_VERIFICATION", "Verificação de Evidências", "FAILED", tEv, {
      nodeName: "10. Evidence Verification",
      input: { analysesCount: crossFile.data.analyses.length },
      error: { code: evidence.error.code, message: evidence.error.userMessage || evidence.error.description || evidence.error.code },
    });
    return failWith(evidence.error);
  }

  recorder.record("EVIDENCE_VERIFICATION", "Verificação de Evidências", "COMPLETED", tEv, {
    nodeName: "10. Evidence Verification",
    input: { analysesCount: crossFile.data.analyses.length },
    output: { verifiedCount: evidence.data.verifiedCount },
    logs: [`[INFO] ${evidence.data.verifiedCount} citações checadas e auditadas anti-alucinação.`],
  });

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
  currentStage = "REPORT_GENERATION";

  const tRep = Date.now();
  const evidencePolicy = enforceEvidencePolicy(crossFile.data.analyses, evidence.data.evidences);
  const report = await guardedExecution.run("buildReport", async () =>
    buildReport({
      caseAnalysis: caseAnalysis.data,
      analyses: evidencePolicy.analyses,
      evidences: evidence.data.evidences,
      scratchpads: scratchpadBatch.data.scratchpads,
      policyDropped: evidencePolicy.dropped,
    }),
  );
  if (report.isError) {
    recorder.record("REPORT_GENERATION", "Geração de Relatório", "FAILED", tRep, {
      nodeName: "11. Consolidação do Relatório",
      error: { code: report.error.code, message: report.error.userMessage || report.error.description || report.error.code },
    });
    return failWith(report.error);
  }

  recorder.record("REPORT_GENERATION", "Geração de Relatório", "COMPLETED", tRep, {
    nodeName: "11. Consolidação do Relatório",
    output: { reportId: report.data.reportId, status: "READY" },
    logs: [`[INFO] Relatório final consolidado e pronto para visualização.`],
  });

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
      jurisprudence: Array.from(jurisprudenceSources).join(", ") || sourceProvider.name,
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
