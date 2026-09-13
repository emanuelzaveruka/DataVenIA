import { randomUUID } from "node:crypto";
import { createCachedJurisprudenceProvider } from "../providers/cached-jurisprudence-provider";
import { validateFile } from "../services/document/validate-file";
import { parseDocument } from "../services/document/parse-document";
import { sanitizeDocument } from "../services/document/sanitize";
import { analyzeCase } from "../services/case-analysis/analyze-case";
import { generateSearchQueries } from "../services/query-generation/generate-queries";
import { applySearchFunnel } from "../services/jurisprudence/search-funnel";
import { buildPreRankingContext, rankCandidates } from "../services/jurisprudence/pre-rank";
import { selectForScratchpad } from "../services/jurisprudence/select-candidates";
import { generateScratchpads } from "../services/scratchpad/generate-scratchpads";
import { analyzeCrossFile } from "../services/cross-file/analyze-cross-file";
import { verifyEvidence } from "../services/evidence/verify-evidence";
import { enforceEvidencePolicy } from "../services/evidence/enforce-evidence-policy";
import { buildReport } from "../services/report/build-report";
import { createRepositoryScratchpadCache } from "../persistence/scratchpad-cache";
import { createExecutionRecorder } from "../observability/execution-recorder";
import {
  buildPipelineProgress,
  type PipelineProgressInput,
  type PipelineProgressStep,
} from "../observability/pipeline-progress";
import { createGuardedExecution } from "../hooks/guarded-execution";
import {
  validateEvidenceHandoff,
  validateReportHandoff,
  validateSanitizationHandoff,
  validateScratchpadBatchHandoff,
} from "./handoff-validators";
import { PIPELINE_VERSION, scratchpadVersions } from "../config/versions";
import { MIN_VALID_SCRATCHPADS } from "../config/limits";
import { createAppError, type AppError } from "../errors/app-error";
import { statusForError } from "../errors/http-status";
import { createStageRecorder, type NodeExecutionDetail, type PipelineStageEvent } from "./pipeline-stage-event";
import type { WorkflowStage } from "./state-machine";
import type { JurisprudenceSearchItem } from "../schemas/search.schema";
import type { DataVeniaRepository } from "../persistence/repository";
import type { LlmProvider } from "../llm/provider";
import type { JurisprudenceProvider } from "../providers/jurisprudence-provider";
import type { FinalReport } from "../schemas/report.schema";
import type { RedactionSummary } from "../schemas/sanitization.schema";
import type { SearchQuery } from "../schemas/query-generation.schema";
import type { JurisprudenceQueryFilters } from "../schemas/search.schema";

const INITIAL_STAGE = "DOCUMENT_ANALYSIS" as const;

/**
 * Ids fixos por nó. Precisam ser estáveis entre o evento `RUNNING` e o `COMPLETED`/`FAILED` do
 * mesmo nó: é por eles que quem acompanha ao vivo substitui o card em vez de empilhar dois.
 */
const NODE = {
  received: "node-01-received",
  validating: "node-02-validating",
  parsing: "node-03-parsing",
  sanitizing: "node-04-sanitizing",
  documentAnalysis: "node-05-document-analysis",
  queryGeneration: "node-06-query-generation",
  search: "node-07-search",
  scratchpads: "node-08-scratchpad-generation",
  crossFile: "node-09-cross-file-analysis",
  evidence: "node-10-evidence-verification",
  report: "node-11-report-generation",
} as const;

export interface PipelineFileInput {
  name: string;
  size: number;
  type: string;
  bytes: Buffer;
}

export interface RunPipelineInput {
  runId: string;
  traceId: string;
  file: PipelineFileInput;
  /**
   * Termos escritos pelo usuário na tela de envio. **Somam** às queries de `generateSearchQueries`,
   * nunca as substituem — é o que mantém de graça a garantia de HU-11 (existe busca por
   * jurisprudência contrária) sem precisar validar nada do que o usuário digitou: o conjunto do
   * modelo continua inteiro ali dentro.
   */
  extraTerms?: string[];
  /** Recorte escolhido pelo usuário (Câmara, período). Vale para TODAS as queries do plano. */
  filters?: JurisprudenceQueryFilters;
}

export interface RunPipelineDeps {
  repository: DataVeniaRepository;
  llmProvider: LlmProvider;
  /**
   * Modelo do cross-file, quando ele não é o mesmo do resto do pipeline. Default: `llmProvider`.
   * A etapa REDUCE (§3.8) é a saída estruturada mais difícil do pipeline — schema construído por
   * execução e a maior parte das regras em `superRefine`, que o modelo nunca vê no JSON Schema —,
   * então vale poder rodá-la em um modelo mais capaz sem encarecer o MAP, que faz uma chamada por
   * decisão.
   */
  crossFileLlmProvider?: LlmProvider;
  /**
   * A fonte **sem cache**. O cache de decisão bruta (§11.8) é montado aqui por cima dela, mas
   * `verifyEvidence` recebe a fonte crua de propósito: servida pelo cache, HU-24 compararia o hash
   * com ele mesmo e "a fonte mudou desde a coleta" nunca dispararia.
   */
  jurisprudenceProvider: JurisprudenceProvider;
  signal?: AbortSignal;
}

/** Exatamente o corpo que a rota sempre devolveu — extraído como tipo, não redesenhado. */
export interface PipelineResultPayload {
  runId: string;
  traceId: string;
  documentId: string;
  fileName: string;
  mimeType: string;
  metadata: { pageCount?: number; hash: string };
  sanitizedTextPreview: string;
  redactions: RedactionSummary[];
  stages: PipelineStageEvent[];
  progress: PipelineProgressStep[];
  provider: { llm: string; model: string; crossFileModel?: string; jurisprudence: string };
  scratchpads: { requested: number; processed: number; failed: number; status: string };
  report: FinalReport;
}

export type PipelineEvent =
  | { type: "start"; runId: string; traceId: string }
  | { type: "stage"; event: PipelineStageEvent }
  | { type: "progress"; steps: PipelineProgressStep[] }
  | { type: "result"; payload: PipelineResultPayload }
  | { type: "error"; httpStatus: number; error: AppError };

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

function errorDetail(error: AppError): NodeExecutionDetail["error"] {
  return {
    code: error.code,
    message: error.userMessage || error.description || error.code,
    description: error.description,
  };
}

/**
 * O pipeline inteiro (§2.3 Map → Reduce → Verify), desacoplado de HTTP.
 *
 * É um async generator porque observar a execução *enquanto ela acontece* é requisito de HU-04 e
 * HU-35 ("dado um upload em andamento..."), e porque o mesmo fluxo precisa servir a rota (que o
 * serializa como NDJSON) e o script de terminal (que faz `for await`) sem adaptador no meio. O
 * consumidor dita o ritmo: nada é bufferizado esperando o fim.
 */
export async function* runPipeline(
  input: RunPipelineInput,
  deps: RunPipelineDeps,
): AsyncGenerator<PipelineEvent, void> {
  const { repository, llmProvider, jurisprudenceProvider: sourceProvider, signal } = deps;
  const crossFileLlmProvider = deps.crossFileLlmProvider ?? llmProvider;
  const { runId, traceId, file } = input;
  const filtrosDoUsuario = input.filters;

  const recorder = createStageRecorder();
  const startedAt = new Date().toISOString();
  const progress: PipelineProgressInput = {};

  // Uma execução (§11.8) e um traceId por requisição: é o que amarra documento, logs de tool e
  // erros na mesma linha do tempo auditável (HU-34/HU-35).
  const execution = createExecutionRecorder({
    traceId,
    workflowId: runId,
    sink: (log) => void repository.saveToolExecution(log),
  });
  let currentStage: WorkflowStage = INITIAL_STAGE;

  async function persistError(error: AppError): Promise<void> {
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
  }

  const guardedExecution = createGuardedExecution({
    getStage: () => currentStage,
    recorder: execution,
    onBlockedTool: persistError,
  });

  /** Mesmos efeitos do antigo `failWith`: persiste o erro, marca a run como FAILED, encerra. */
  async function* failRun(error: AppError): AsyncGenerator<PipelineEvent, void> {
    await persistError(error);
    await repository.updateRun(runId, { status: "FAILED", finishedAt: new Date().toISOString() });
    // Último progresso antes do erro: sem ele o painel congela com tudo pendente e o usuário não
    // sabe em que etapa parou. Como `failStage` termina aqui, todo caminho de falha fica coberto.
    progress.failed = true;
    yield progressEvent();
    yield { type: "error", httpStatus: statusForError(error), error };
  }

  /** `failRun` precedido do evento de nó que falhou, para o inspector marcar onde parou. */
  async function* failStage(
    stage: string,
    label: string,
    startedAtMs: number,
    error: AppError,
    detail: Partial<NodeExecutionDetail>,
  ): AsyncGenerator<PipelineEvent, void> {
    yield {
      type: "stage",
      event: recorder.record(stage, label, "FAILED", startedAtMs, {
        ...detail,
        error: errorDetail(error),
      }),
    };
    yield* failRun(error);
  }

  function progressEvent(): PipelineEvent {
    return { type: "progress", steps: buildPipelineProgress(progress) };
  }

  yield { type: "start", runId, traceId };

  const run = await repository.createRun({
    runId,
    traceId,
    stage: INITIAL_STAGE,
    status: "UPLOADED",
    pipelineVersion: PIPELINE_VERSION,
    startedAt,
  });
  if (run.isError) {
    yield { type: "error", httpStatus: statusForError(run.error), error: run.error };
    return;
  }

  yield progressEvent();

  // ---------------------------------------------------------------- 01. Upload
  const receivedAt = Date.now();
  yield {
    type: "stage",
    event: recorder.record("RECEIVED", "Arquivo Recebido", "COMPLETED", receivedAt, {
      id: NODE.received,
      nodeName: "01. Upload de Documento",
      input: { fileName: file.name, fileSize: file.size, mimeType: file.type },
      output: { status: "RECEIVED", sizeBytes: file.size },
      logs: [`[INFO] Arquivo ${file.name} carregado na API com sucesso.`],
    }),
  };

  const buffer = file.bytes;

  // ---------------------------------------------------------------- 02. Validação
  const validatingDetail = {
    id: NODE.validating,
    nodeName: "02. Validação do Formato",
    input: { fileName: file.name, bytes: buffer.length },
  };
  yield { type: "stage", event: recorder.start("VALIDATING", "Validação de Arquivo", validatingDetail) };
  const tVal = Date.now();
  const validation = await guardedExecution.run("validateFile", () => validateFile(buffer, file.name));
  if (validation.isError) {
    yield* failStage("VALIDATING", "Validação de Arquivo", tVal, validation.error, {
      ...validatingDetail,
      logs: [`[ERROR] Falha ao validar extensão ou formato: ${validation.error.description}`],
    });
    return;
  }
  yield {
    type: "stage",
    event: recorder.record("VALIDATING", "Validação de Arquivo", "COMPLETED", tVal, {
      ...validatingDetail,
      output: validation.data,
      logs: [`[INFO] Extensão e MIME Type ${validation.data.mimeType} aprovados.`],
    }),
  };

  // ---------------------------------------------------------------- 03. Parsing
  const parsingDetail = {
    id: NODE.parsing,
    nodeName: "03. Parsing de PDF/DOCX",
    input: { fileName: file.name, mimeType: validation.data.mimeType },
  };
  yield { type: "stage", event: recorder.start("PARSING", "Extração de Texto", parsingDetail) };
  const tParse = Date.now();
  const parsed = await guardedExecution.run("parseDocument", () =>
    parseDocument(buffer, file.name, validation.data.mimeType),
  );
  if (parsed.isError) {
    yield* failStage("PARSING", "Extração de Texto", tParse, parsed.error, {
      ...parsingDetail,
      logs: [`[ERROR] Falha na extração de texto: ${parsed.error.description}`],
    });
    return;
  }
  yield {
    type: "stage",
    event: recorder.record("PARSING", "Extração de Texto", "COMPLETED", tParse, {
      ...parsingDetail,
      output: {
        documentId: parsed.data.documentId,
        metadata: parsed.data.metadata,
        charCount: parsed.data.text.length,
      },
      logs: [
        `[INFO] Texto extraído (${parsed.data.text.length} caracteres, ${parsed.data.metadata.pageCount} páginas).`,
      ],
    }),
  };

  // ---------------------------------------------------------------- 04. Sanitização
  const sanitizingDetail = {
    id: NODE.sanitizing,
    nodeName: "04. Sanitização LGPD/PII",
    input: { documentId: parsed.data.documentId, rawLength: parsed.data.text.length },
  };
  yield { type: "stage", event: recorder.start("SANITIZING", "Sanitização PII (HU-05)", sanitizingDetail) };
  const tSan = Date.now();
  const sanitized = await guardedExecution.run(
    "sanitizeDocument",
    async () => sanitizeDocument(parsed.data.documentId, parsed.data.text),
    validateSanitizationHandoff({ documentId: parsed.data.documentId }),
  );
  if (sanitized.isError) {
    yield* failStage("SANITIZING", "Sanitização PII (HU-05)", tSan, sanitized.error, {
      ...sanitizingDetail,
      logs: [`[ERROR] Falha na sanitização PII: ${sanitized.error.description}`],
    });
    return;
  }
  yield {
    type: "stage",
    event: recorder.record("SANITIZING", "Sanitização PII (HU-05)", "COMPLETED", tSan, {
      ...sanitizingDetail,
      output: {
        redactionsCount: sanitized.data.redactions.length,
        sanitizedLength: sanitized.data.sanitizedText.length,
      },
      logs: [`[INFO] ${sanitized.data.redactions.length} dados pessoais mascarados/sanitizados.`],
    }),
  };

  // Só o texto sanitizado é persistido (HU-05/HU-34): `parsed.data.text` (bruto) morre aqui, no
  // escopo da requisição, e não existe coluna capaz de recebê-lo.
  const document = await repository.saveDocument({
    documentId: parsed.data.documentId,
    runId,
    fileName: parsed.data.fileName,
    mimeType: parsed.data.mimeType,
    contentHash: parsed.data.metadata.hash,
    pageCount: parsed.data.metadata.pageCount,
    sanitizedText: sanitized.data.sanitizedText,
    redactions: sanitized.data.redactions,
    createdAt: new Date().toISOString(),
  });
  if (document.isError) {
    yield* failRun(document.error);
    return;
  }

  const documentParsed = await repository.updateRun(runId, { status: "DOCUMENT_PARSED" });
  if (documentParsed.isError) {
    yield* failRun(documentParsed.error);
    return;
  }

  progress.documentParsed = true;
  yield progressEvent();

  const jurisprudenceProvider = createCachedJurisprudenceProvider(sourceProvider, repository);

  // ---------------------------------------------------------------- 05. Case Understanding
  const caseDetail = {
    id: NODE.documentAnalysis,
    nodeName: "05. Case Understanding (Fatos/Teses)",
    input: { sanitizedLength: sanitized.data.sanitizedText.length },
  };
  yield { type: "stage", event: recorder.start("DOCUMENT_ANALYSIS", "Análise de Caso (LLM)", caseDetail) };
  const tCase = Date.now();
  const caseAnalysis = await guardedExecution.run("analyzeCase", () =>
    analyzeCase(sanitized.data, llmProvider, signal),
  );
  if (caseAnalysis.isError) {
    yield* failStage("DOCUMENT_ANALYSIS", "Análise de Caso (LLM)", tCase, caseAnalysis.error, caseDetail);
    return;
  }
  yield {
    type: "stage",
    event: recorder.record("DOCUMENT_ANALYSIS", "Análise de Caso (LLM)", "COMPLETED", tCase, {
      ...caseDetail,
      output: {
        legalIssuesCount: caseAnalysis.data.legalIssues.length,
        factsCount: caseAnalysis.data.facts.length,
      },
      logs: [
        `[INFO] Análise do caso concluída com ${caseAnalysis.data.legalIssues.length} teses jurídicas mapeadas.`,
      ],
    }),
  };

  const savedCaseAnalysis = await repository.saveCaseAnalysis({
    runId,
    documentId: parsed.data.documentId,
    content: caseAnalysis.data,
    createdAt: new Date().toISOString(),
  });
  if (savedCaseAnalysis.isError) {
    yield* failRun(savedCaseAnalysis.error);
    return;
  }

  const caseAnalyzed = await repository.updateRun(runId, {
    stage: "QUERY_GENERATION",
    status: "CASE_ANALYZED",
  });
  if (caseAnalyzed.isError) {
    yield* failRun(caseAnalyzed.error);
    return;
  }
  currentStage = "QUERY_GENERATION";

  // ---------------------------------------------------------------- 06. Query Builder
  const queryDetail = {
    id: NODE.queryGeneration,
    nodeName: "06. Query Builder (LLM)",
    input: { legalIssuesCount: caseAnalysis.data.legalIssues.length },
  };
  yield { type: "stage", event: recorder.start("QUERY_GENERATION", "Geração de Queries", queryDetail) };
  const tQueries = Date.now();
  const queryPlan = await guardedExecution.run("generateSearchQueries", () =>
    generateSearchQueries(caseAnalysis.data, llmProvider, signal),
  );
  if (queryPlan.isError) {
    yield* failStage("QUERY_GENERATION", "Geração de Queries", tQueries, queryPlan.error, queryDetail);
    return;
  }
  yield {
    type: "stage",
    event: recorder.record("QUERY_GENERATION", "Geração de Queries", "COMPLETED", tQueries, {
      ...queryDetail,
      output: { totalQueries: queryPlan.data.queries.length, queries: queryPlan.data.queries },
      logs: [`[INFO] ${queryPlan.data.queries.length} pesquisas jurídicas personalizadas foram criadas.`],
    }),
  };

  const queriesGenerated = await repository.updateRun(runId, {
    stage: "SEARCH",
    status: "QUERIES_GENERATED",
  });
  if (queriesGenerated.isError) {
    yield* failRun(queriesGenerated.error);
    return;
  }
  currentStage = "SEARCH";

  /**
   * Termos do usuário viram queries como as outras, com `intent: "RELATED"` — não são a tese dele
   * nem a contrária, são recortes que ele quer ver cobertos. Ficam amarrados à primeira questão
   * jurídica identificada porque `legalIssueId` é obrigatório para rastreabilidade (HU-11) e quem
   * digitou um termo solto não escolheu questão nenhuma.
   */
  const questaoPadrao = caseAnalysis.data.legalIssues[0]?.id;
  const termosDoUsuario: SearchQuery[] = (input.extraTerms ?? [])
    .map((termo) => termo.trim())
    .filter((termo, indice, todos) => termo.length > 0 && todos.indexOf(termo) === indice)
    .filter((termo) => !queryPlan.data.queries.some((existente) => existente.query === termo))
    .map((termo) => ({
      query: termo,
      reason: "Termo informado pelo usuário na tela de envio.",
      intent: "RELATED" as const,
      legalIssueId: questaoPadrao ?? "",
    }))
    .filter((query) => query.legalIssueId.length > 0);

  const queriesParaBuscar = [...queryPlan.data.queries, ...termosDoUsuario];

  progress.queriesGenerated = queriesParaBuscar.length;
  yield progressEvent();

  // ---------------------------------------------------------------- 07. Busca e pré-ranking
  const searchDetail = {
    id: NODE.search,
    nodeName: "07. Busca & Pre-Ranking (TJPR)",
    input: { totalQueries: queriesParaBuscar.length, termosDoUsuario: termosDoUsuario.length },
  };
  yield { type: "stage", event: recorder.start("SEARCH", "Busca Jurisprudencial", searchDetail) };
  const tSearch = Date.now();
  const foundItems: JurisprudenceSearchItem[] = [];
  const jurisprudenceSources = new Set<string>();
  for (const searchQuery of queriesParaBuscar) {
    if (signal?.aborted) break;
    // O recorte acompanha TODA query: o funil de HU-13 conta o total por busca, e aplicar em
    // só algumas daria um total que não corresponde a recorte nenhum.
    const query = { query: searchQuery.query, filters: filtrosDoUsuario };
    const searchResult = await guardedExecution.run("searchJurisprudence", () =>
      jurisprudenceProvider.search(query),
    );
    if (searchResult.isError) {
      yield* failStage("SEARCH", "Busca Jurisprudencial", tSearch, searchResult.error, {
        ...searchDetail,
        input: { query: searchQuery.query },
      });
      return;
    }
    const searchProvider = searchResult.metadata?.source ?? sourceProvider.name;
    jurisprudenceSources.add(searchProvider);

    const savedSearch = await repository.saveSearch({
      searchId: randomUUID(),
      runId,
      query,
      provider: searchProvider,
      totalCount: searchResult.data.totalCount,
      items: searchResult.data.items,
      createdAt: new Date().toISOString(),
    });
    if (savedSearch.isError) {
      yield* failRun(savedSearch.error);
      return;
    }

    const funneled = applySearchFunnel(searchResult.data);
    if (funneled.isError) {
      yield* failRun(funneled.error);
      return;
    }
    foundItems.push(...funneled.data);
  }

  const uniqueItems = dedupeSearchItems(foundItems);
  const ranked = rankCandidates(uniqueItems, buildPreRankingContext(caseAnalysis.data));
  const selected = selectForScratchpad(ranked);
  if (selected.isError) {
    yield* failStage("SEARCH", "Seleção de Julgados", tSearch, selected.error, {
      ...searchDetail,
      nodeName: "07. Busca & Pre-Ranking (TJPR)",
      input: { totalFound: uniqueItems.length },
    });
    return;
  }

  yield {
    type: "stage",
    event: recorder.record("SEARCH", "Busca Jurisprudencial", "COMPLETED", tSearch, {
      ...searchDetail,
      output: { totalFound: uniqueItems.length, selectedCount: selected.data.length },
      logs: [`[INFO] ${uniqueItems.length} acórdãos encontrados; top ${selected.data.length} selecionados.`],
    }),
  };

  const searchComplete = await repository.updateRun(runId, {
    stage: "SCRATCHPAD_GENERATION",
    status: "DECISIONS_SELECTED",
  });
  if (searchComplete.isError) {
    yield* failRun(searchComplete.error);
    return;
  }
  currentStage = "SCRATCHPAD_GENERATION";

  progress.candidatesFound = uniqueItems.length;
  progress.decisionsSelected = selected.data.length;
  yield progressEvent();

  // ---------------------------------------------------------------- 08. Scratchpads
  const scratchpadDetail = {
    id: NODE.scratchpads,
    nodeName: "08. Extraction Scratchpads",
    input: { selectedCount: selected.data.length },
  };
  yield { type: "stage", event: recorder.start("SCRATCHPAD_GENERATION", "Geração de Scratchpads", scratchpadDetail) };
  const tScratch = Date.now();
  const versions = scratchpadVersions(llmProvider);
  const scratchpadCache = createRepositoryScratchpadCache({ repository, runId, versions });
  const scratchpadBatch = await guardedExecution.run(
    "generateScratchpads",
    () =>
      generateScratchpads(selected.data, llmProvider, jurisprudenceProvider, undefined, scratchpadCache, signal),
    validateScratchpadBatchHandoff({
      selectedCandidateIds: selected.data.map((candidate) => candidate.item.id),
    }),
  );
  if (scratchpadBatch.isError) {
    yield* failStage(
      "SCRATCHPAD_GENERATION",
      "Geração de Scratchpads",
      tScratch,
      scratchpadBatch.error,
      { ...scratchpadDetail, input: { count: selected.data.length } },
    );
    return;
  }

  const validScratchpads = scratchpadBatch.data.scratchpads.filter(
    (scratchpad) => scratchpad.status === "VALID",
  );
  if (validScratchpads.length < MIN_VALID_SCRATCHPADS) {
    yield* failStage(
      "SCRATCHPAD_GENERATION",
      "Geração de Scratchpads",
      tScratch,
      insufficientScratchpadsError(validScratchpads.length),
      { ...scratchpadDetail, input: { count: selected.data.length } },
    );
    return;
  }

  yield {
    type: "stage",
    event: recorder.record("SCRATCHPAD_GENERATION", "Geração de Scratchpads", "COMPLETED", tScratch, {
      ...scratchpadDetail,
      output: { validCount: validScratchpads.length, status: scratchpadBatch.data.status },
      logs: [`[INFO] ${validScratchpads.length} scratchpads gerados e validados por proposição.`],
    }),
  };

  const scratchpadsComplete = await repository.updateRun(runId, {
    stage: "CROSS_FILE_ANALYSIS",
    status: "SCRATCHPADS_COMPLETE",
  });
  if (scratchpadsComplete.isError) {
    yield* failRun(scratchpadsComplete.error);
    return;
  }
  currentStage = "CROSS_FILE_ANALYSIS";

  progress.validScratchpads = validScratchpads.length;
  yield progressEvent();

  // ---------------------------------------------------------------- 09. Cross-File
  const crossFileDetail = {
    id: NODE.crossFile,
    nodeName: "09. Cross-File Analysis",
    input: { scratchpadsCount: scratchpadBatch.data.scratchpads.length },
  };
  yield { type: "stage", event: recorder.start("CROSS_FILE_ANALYSIS", "Análise Cruzada", crossFileDetail) };
  const tCross = Date.now();
  const crossFile = await guardedExecution.run("analyzeCrossFile", () =>
    analyzeCrossFile(caseAnalysis.data, scratchpadBatch.data.scratchpads, crossFileLlmProvider, signal),
  );
  if (crossFile.isError) {
    yield* failStage("CROSS_FILE_ANALYSIS", "Análise Cruzada", tCross, crossFile.error, crossFileDetail);
    return;
  }

  yield {
    type: "stage",
    event: recorder.record("CROSS_FILE_ANALYSIS", "Análise Cruzada", "COMPLETED", tCross, {
      ...crossFileDetail,
      output: { analysesCount: crossFile.data.analyses.length },
      logs: [`[INFO] Análise cruzada das teses e precedentes finalizada com sucesso.`],
    }),
  };

  const savedCrossFile = await repository.saveCrossFileAnalyses(
    crossFile.data.analyses.map((analysis) => ({
      runId,
      legalIssueId: analysis.legalIssueId,
      content: analysis,
      createdAt: new Date().toISOString(),
    })),
  );
  if (savedCrossFile.isError) {
    yield* failRun(savedCrossFile.error);
    return;
  }

  const crossFileComplete = await repository.updateRun(runId, {
    stage: "EVIDENCE_VERIFICATION",
    status: "CROSSFILE_COMPLETE",
  });
  if (crossFileComplete.isError) {
    yield* failRun(crossFileComplete.error);
    return;
  }
  currentStage = "EVIDENCE_VERIFICATION";

  progress.crossFileComplete = true;
  yield progressEvent();

  // ---------------------------------------------------------------- 10. Evidence Verification
  const evidenceDetail = {
    id: NODE.evidence,
    nodeName: "10. Evidence Verification",
    input: { analysesCount: crossFile.data.analyses.length },
  };
  yield { type: "stage", event: recorder.start("EVIDENCE_VERIFICATION", "Verificação de Evidências", evidenceDetail) };
  const tEv = Date.now();
  const evidence = await guardedExecution.run(
    "verifyEvidence",
    () => verifyEvidence(crossFile.data.analyses, scratchpadBatch.data.scratchpads, sourceProvider),
    validateEvidenceHandoff({ scratchpads: scratchpadBatch.data.scratchpads }),
  );
  if (evidence.isError) {
    yield* failStage("EVIDENCE_VERIFICATION", "Verificação de Evidências", tEv, evidence.error, evidenceDetail);
    return;
  }

  yield {
    type: "stage",
    event: recorder.record("EVIDENCE_VERIFICATION", "Verificação de Evidências", "COMPLETED", tEv, {
      ...evidenceDetail,
      output: { verifiedCount: evidence.data.verifiedCount },
      logs: [`[INFO] ${evidence.data.verifiedCount} citações checadas e auditadas anti-alucinação.`],
    }),
  };

  const savedEvidences = await repository.saveEvidences(
    evidence.data.evidences.map((item) => ({
      runId,
      content: item,
      createdAt: new Date().toISOString(),
    })),
  );
  if (savedEvidences.isError) {
    yield* failRun(savedEvidences.error);
    return;
  }

  const evidenceVerified = await repository.updateRun(runId, {
    stage: "REPORT_GENERATION",
    status: "EVIDENCE_VERIFIED",
  });
  if (evidenceVerified.isError) {
    yield* failRun(evidenceVerified.error);
    return;
  }
  currentStage = "REPORT_GENERATION";

  progress.verifiedEvidences = evidence.data.verifiedCount;
  yield progressEvent();

  // ---------------------------------------------------------------- 11. Relatório
  const reportDetail = { id: NODE.report, nodeName: "11. Consolidação do Relatório" };
  yield { type: "stage", event: recorder.start("REPORT_GENERATION", "Geração de Relatório", reportDetail) };
  const tRep = Date.now();
  const evidencePolicy = enforceEvidencePolicy(crossFile.data.analyses, evidence.data.evidences);
  const report = await guardedExecution.run(
    "buildReport",
    async () =>
      buildReport({
        caseAnalysis: caseAnalysis.data,
        analyses: evidencePolicy.analyses,
        evidences: evidence.data.evidences,
        scratchpads: scratchpadBatch.data.scratchpads,
        policyDropped: evidencePolicy.dropped,
      }),
    validateReportHandoff({
      evidences: evidence.data.evidences,
      scratchpads: scratchpadBatch.data.scratchpads,
    }),
  );
  if (report.isError) {
    yield* failStage("REPORT_GENERATION", "Geração de Relatório", tRep, report.error, reportDetail);
    return;
  }

  yield {
    type: "stage",
    event: recorder.record("REPORT_GENERATION", "Geração de Relatório", "COMPLETED", tRep, {
      ...reportDetail,
      output: { reportId: report.data.reportId, status: "READY" },
      logs: [`[INFO] Relatório final consolidado e pronto para visualização.`],
    }),
  };

  const savedReport = await repository.saveReport({
    reportId: report.data.reportId,
    runId,
    content: report.data,
    createdAt: new Date().toISOString(),
  });
  if (savedReport.isError) {
    yield* failRun(savedReport.error);
    return;
  }

  const reportComplete = await repository.updateRun(runId, {
    status: scratchpadBatch.data.status === "PARTIAL_SUCCESS" ? "PARTIAL_SUCCESS" : "REPORT_COMPLETE",
    finishedAt: new Date().toISOString(),
  });
  if (reportComplete.isError) {
    yield* failRun(reportComplete.error);
    return;
  }

  progress.reportReady = true;
  yield progressEvent();

  yield {
    type: "result",
    payload: {
      runId,
      traceId,
      documentId: parsed.data.documentId,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      metadata: parsed.data.metadata,
      sanitizedTextPreview: sanitized.data.sanitizedText.slice(0, 2000),
      redactions: sanitized.data.redactions,
      stages: recorder.events,
      progress: buildPipelineProgress(progress),
      provider: {
        llm: llmProvider.name,
        model: llmProvider.model,
        // Só aparece quando o cross-file roda em outro modelo — senão a linha diria duas vezes a
        // mesma coisa. §14 exige saber qual modelo produziu cada etapa.
        crossFileModel:
          crossFileLlmProvider.model === llmProvider.model ? undefined : crossFileLlmProvider.model,
        jurisprudence: Array.from(jurisprudenceSources).join(", ") || sourceProvider.name,
      },
      scratchpads: {
        requested: scratchpadBatch.data.requested,
        processed: scratchpadBatch.data.processed,
        failed: scratchpadBatch.data.failed,
        status: scratchpadBatch.data.status,
      },
      report: report.data,
    },
  };
}

export { unexpectedError as pipelineUnexpectedError };
