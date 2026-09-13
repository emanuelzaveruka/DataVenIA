import { randomUUID } from "node:crypto";
import { createCachedJurisprudenceProvider } from "../providers/cached-jurisprudence-provider";
import { validateFile } from "../services/document/validate-file";
import { parseDocument } from "../services/document/parse-document";
import { sanitizeDocument } from "../services/document/sanitize";
import { analyzeCase } from "../services/case-analysis/analyze-case";
import { applySearchFunnel } from "../services/jurisprudence/search-funnel";
import { buildPreRankingContext, rankCandidates } from "../services/jurisprudence/pre-rank";
import { selectForScratchpad } from "../services/jurisprudence/select-candidates";
import { normalizeTjprKeywordQuery } from "../services/jurisprudence/normalize-query";
import {
  generateScratchpads,
  type ScratchpadBatchResult,
} from "../services/scratchpad/generate-scratchpads";
import { analyzeCrossFile } from "../services/cross-file/analyze-cross-file";
import { verifyEvidence } from "../services/evidence/verify-evidence";
import { enforceEvidencePolicy } from "../services/evidence/enforce-evidence-policy";
import { buildReport } from "../services/report/build-report";
import { createRepositoryScratchpadCache } from "../persistence/scratchpad-cache";
import { createExecutionRecorder } from "../observability/execution-recorder";
import {
  createPipelineLogger,
  NO_PIPELINE_LOG,
  type PipelineLogger,
} from "../observability/pipeline-logger";
import {
  buildPipelineProgress,
  type PipelineProgressInput,
  type PipelineProgressStep,
} from "../observability/pipeline-progress";
import { createGuardedExecution } from "../hooks/guarded-execution";
import { PIPELINE_VERSION, scratchpadVersions } from "../config/versions";
import {
  MAX_USER_KEYWORDS,
  MIN_VALID_SCRATCHPADS,
  SCRATCHPAD_LIMIT,
  SEARCH_CANDIDATE_LIMIT,
  SEARCH_COLLECTED_ITEMS_CAP,
} from "../config/limits";
import { createAppError, type AppError } from "../errors/app-error";
import type { ToolResult } from "../errors/tool-result";
import { statusForError } from "../errors/http-status";
import { createAuditedLlmProvider, type LlmCallRecord } from "../llm/audited-llm-provider";
import { auditsArtifacts, auditsRawText, type AuditLevel } from "../config/audit";
import { type LogLevel } from "../config/logging";
import { withLiveEvents } from "./live-events";
import {
  createStageRecorder,
  type AgentTaskInfo,
  type NodeExecutionDetail,
  type PipelineStageEvent,
} from "./pipeline-stage-event";
import type { WorkflowStage } from "./state-machine";
import type { JurisprudenceSearchItem } from "../schemas/search.schema";
import type { DataVeniaRepository } from "../persistence/repository";
import type { LlmProvider } from "../llm/provider";
import type { JurisprudenceProvider } from "../providers/jurisprudence-provider";
import type { FinalReport } from "../schemas/report.schema";
import type { RedactionSummary } from "../schemas/sanitization.schema";
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
   * Palavras-chave escolhidas pelo usuário na tela de envio — sugeridas a partir da peça (sem
   * modelo, `suggestSearchTerms`) ou digitadas por ele, até `MAX_USER_KEYWORDS`.
   *
   * Decisão de 2026-09-13: deixaram de ser um extra que **somava** às queries de uma LLM. Não há
   * mais LLM gerando query nenhuma — estas palavras são, sozinhas, a única busca feita no TJPR.
   * Sem elas o pipeline não tem o que buscar e falha na etapa QUERY_GENERATION.
   */
  keywords?: string[];
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
  /**
   * Modo auditoria (§14). Em `"off"` — o default — cada nó emite exatamente as contagens que sempre
   * emitiu; acima disso, emite também o artefato que produziu e as chamadas de modelo que fez.
   * Ligar isto muda o que sai no stream, nunca o que o pipeline calcula ou persiste.
   */
  auditLevel?: AuditLevel;
  /**
   * Log no console do servidor (§14). Canal diferente do `auditLevel`: aquele decide o que sai no
   * stream para o usuário, este o que sai no terminal de quem roda o servidor. Default `"off"` —
   * quem quer log (a rota, a partir de `PIPELINE_LOG`) pede.
   */
  logLevel?: LogLevel;
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

/** Ordem preservada, sem vazio e sem repetição — mesma regra que os termos do usuário já seguiam. */
function dedupeKeywords(keywords: string[]): string[] {
  return keywords
    .map((keyword) => keyword.trim())
    .filter((keyword, index, all) => keyword.length > 0 && all.indexOf(keyword) === index);
}

function missingKeywordsError(): AppError {
  return createAppError({
    code: "MISSING_SEARCH_KEYWORDS",
    category: "BUSINESS_RULE",
    severity: "ERROR",
    description: "No keyword was selected to build the single TJPR search query",
    userMessage: "Selecione ao menos uma palavra-chave de busca antes de analisar.",
    isRetryable: false,
    operation: "buildSearchQuery",
  });
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
  const logger = deps.logLevel && deps.logLevel !== "off"
    ? createPipelineLogger({ runId: input.runId, level: deps.logLevel })
    : NO_PIPELINE_LOG;
  const startedAtMs = Date.now();

  // O log do servidor é escrito aqui, no ponto por onde todo evento já passava, e não espalhado
  // etapa a etapa: o pipeline não ganhou uma segunda voz para manter em dia, e o que aparece no
  // terminal é exatamente o que foi para o stream.
  for await (const event of pipelineEvents(input, deps, logger)) {
    switch (event.type) {
      case "start":
        logger.runStarted(event.traceId);
        break;
      case "stage": {
        const node = event.event.nodeDetail;
        const name = node?.nodeName ?? event.event.label;
        if (event.event.status === "RUNNING") {
          if (node?.output === undefined) logger.stageStarted(name, node?.input);
          else logger.stageProgress(name, node.output);
        } else {
          logger.stageFinished(
            name,
            event.event.status !== "FAILED",
            event.event.durationMs,
            node?.output,
            node?.error?.code,
          );
        }
        break;
      }
      case "error":
        logger.runFailed(event.error.code, event.error.description);
        break;
      case "result":
        logger.runFinished(Date.now() - startedAtMs);
        break;
      default:
        break;
    }
    yield event;
  }
}

async function* pipelineEvents(
  input: RunPipelineInput,
  deps: RunPipelineDeps,
  logger: PipelineLogger,
): AsyncGenerator<PipelineEvent, void> {
  const { repository, jurisprudenceProvider: sourceProvider, signal } = deps;
  const { runId, traceId, file } = input;
  const filtrosDoUsuario = input.filters;

  const auditLevel = deps.auditLevel ?? "off";
  const audit = auditsArtifacts(auditLevel);
  const auditRaw = auditsRawText(auditLevel);

  // Buffer das chamadas de modelo desde a última etapa. É drenado por `llmSubTasks`, de modo que
  // cada nó leva as chamadas que ele mesmo fez — incluindo as tentativas repetidas do
  // retry-com-contexto (§11.7), que é onde o ciclo de correção fica visível.
  const pendingLlmCalls: LlmCallRecord[] = [];
  // O mesmo decorator serve aos dois canais: sob auditoria a chamada vira sub-tarefa no stream, sob
  // `PIPELINE_LOG=calls` vira uma linha no terminal. Sem nenhum dos dois ele não é composto.
  const auditLlm = (provider: LlmProvider): LlmProvider =>
    audit || logger.logsCalls
      ? createAuditedLlmProvider(provider, (record) => {
          if (audit) pendingLlmCalls.push(record);
          logger.llmCall(record);
        })
      : provider;

  const llmProvider = auditLlm(deps.llmProvider);
  // Envolver o mesmo objeto duas vezes registraria cada chamada em duplicata; quando o cross-file
  // roda no mesmo modelo, ele reusa o provider já auditado.
  const crossFileLlmProvider =
    deps.crossFileLlmProvider && deps.crossFileLlmProvider !== deps.llmProvider
      ? auditLlm(deps.crossFileLlmProvider)
      : llmProvider;

  /**
   * Combina a saída resumida (o que o stream sempre carregou) com o artefato completo, só no modo
   * auditoria. O resumo nunca é substituído: quem lê o painel continua vendo a contagem no mesmo
   * lugar, e quem audita ganha o conteúdo ao lado.
   */
  function auditOutput(
    summary: Record<string, unknown>,
    full: () => Record<string, unknown>,
  ): Record<string, unknown> {
    return audit ? { ...summary, ...full() } : summary;
  }

  /** As chamadas de modelo acumuladas viram sub-tarefas do nó que está fechando. */
  function llmSubTasks(): AgentTaskInfo[] | undefined {
    if (!audit || pendingLlmCalls.length === 0) return undefined;
    const drained = pendingLlmCalls.splice(0, pendingLlmCalls.length);
    return drained.map((call) => ({
      id: `llm-${call.callIndex}-${call.schemaName}`,
      name: `${call.schemaName} · tentativa ${call.callIndex} · ${call.respondedBy ?? call.model}`,
      status: call.outcome === "OK" ? "COMPLETED" : "FAILED",
      durationMs: call.durationMs,
      input: {
        provider: call.provider,
        model: call.model,
        respondedBy: call.respondedBy,
        maxOutputTokens: call.maxOutputTokens,
        system: call.system,
        prompt: call.prompt,
      },
      output: call.output,
      error: call.outcome === "ERROR" ? { code: call.errorCode, description: call.errorDescription } : undefined,
    }));
  }

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
        // As chamadas de modelo pendentes entram aqui mesmo quando a etapa falha — é justamente o
        // momento em que ver o prompt que produziu a saída recusada tem mais valor.
        subTasks: detail.subTasks ?? llmSubTasks(),
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
      output: auditOutput(
        {
          documentId: parsed.data.documentId,
          metadata: parsed.data.metadata,
          charCount: parsed.data.text.length,
        },
        () => ({ rawText: auditRaw ? parsed.data.text : undefined }),
      ),
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
  const sanitized = await guardedExecution.run("sanitizeDocument", async () =>
    sanitizeDocument(parsed.data.documentId, parsed.data.text),
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
      output: auditOutput(
        {
          redactionsCount: sanitized.data.redactions.length,
          sanitizedLength: sanitized.data.sanitizedText.length,
        },
        () => ({
          redactions: sanitized.data.redactions,
          sanitizedText: sanitized.data.sanitizedText,
        }),
      ),
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
      output: auditOutput(
        {
          legalIssuesCount: caseAnalysis.data.legalIssues.length,
          factsCount: caseAnalysis.data.facts.length,
        },
        () => ({ caseAnalysis: caseAnalysis.data }),
      ),
      subTasks: llmSubTasks(),
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

  /**
   * Decisão de 2026-09-13: a LLM deixou de gerar as queries de busca. O usuário escolhe até
   * `MAX_USER_KEYWORDS` palavras-chave na tela de envio — sugeridas a partir da peça, sem modelo
   * (`suggestSearchTerms`), ou digitadas por ele — e elas viram, sozinhas, a ÚNICA query enviada ao
   * TJPR (nunca mais de uma busca por execução). `lib/providers/tjpr.ts` relaxa a query internamente
   * quando ela zera (a busca do TJPR é AND estrito), o que cobre o caso de o usuário empilhar as 5
   * palavras e a combinação inteira não bater em nada.
   */
  const keywordsSelecionadas = dedupeKeywords(input.keywords ?? []).slice(0, MAX_USER_KEYWORDS);

  // ---------------------------------------------------------------- 06. Query Builder
  const queryDetail = {
    id: NODE.queryGeneration,
    nodeName: "06. Query Builder",
    input: { keywordsRecebidas: keywordsSelecionadas },
  };
  yield { type: "stage", event: recorder.start("QUERY_GENERATION", "Montagem da Query", queryDetail) };
  const tQueries = Date.now();

  if (keywordsSelecionadas.length === 0) {
    const error = missingKeywordsError();
    yield* failStage("QUERY_GENERATION", "Montagem da Query", tQueries, error, queryDetail);
    return;
  }

  const criterioPesquisa = keywordsSelecionadas
    .map((keyword) => normalizeTjprKeywordQuery(keyword))
    .filter(Boolean)
    .join(" ");

  yield {
    type: "stage",
    event: recorder.record("QUERY_GENERATION", "Montagem da Query", "COMPLETED", tQueries, {
      ...queryDetail,
      output: { keywords: keywordsSelecionadas, query: criterioPesquisa },
      logs: [`[INFO] Query única montada a partir de ${keywordsSelecionadas.length} palavra(s)-chave.`],
    }),
  };

  const queryBuilt = await repository.updateRun(runId, {
    stage: "SEARCH",
    status: "QUERIES_GENERATED",
  });
  if (queryBuilt.isError) {
    yield* failRun(queryBuilt.error);
    return;
  }
  currentStage = "SEARCH";

  progress.keywordsSelected = keywordsSelecionadas.length;
  yield progressEvent();

  // ---------------------------------------------------------------- 07. Busca e pré-ranking
  const searchDetail = {
    id: NODE.search,
    nodeName: "07. Busca & Pre-Ranking (TJPR)",
    input: { keywords: keywordsSelecionadas, query: criterioPesquisa },
  };
  yield { type: "stage", event: recorder.start("SEARCH", "Busca Jurisprudencial", searchDetail) };
  const tSearch = Date.now();
  const jurisprudenceSources = new Set<string>();
  /** A fixture respondeu no lugar da fonte configurada — ver o `[AVISO]` da etapa. */
  const degradedSources: string[] = [];

  const query = { query: criterioPesquisa, filters: filtrosDoUsuario };
  const searchResult = await guardedExecution.run("searchJurisprudence", () =>
    jurisprudenceProvider.search(query),
  );

  // Uma sub-tarefa só, para a mesma URL que o código consultou poder ser comparada com o portal
  // em vez de reconstruída à mão — o formato de lista sobrevive de quando havia várias queries.
  const searchSubTasks: AgentTaskInfo[] = [];

  if (searchResult.isError) {
    searchSubTasks.push({
      id: "busca-1",
      name: criterioPesquisa,
      status: "FAILED",
      durationMs: Date.now() - tSearch,
      input: { keywords: keywordsSelecionadas, queryEnviada: criterioPesquisa },
      error: { code: searchResult.error.code, description: searchResult.error.description },
    });
    yield* failStage("SEARCH", "Busca Jurisprudencial", tSearch, searchResult.error, {
      ...searchDetail,
      subTasks: audit ? searchSubTasks : undefined,
    });
    return;
  }

  const searchProvider = searchResult.metadata?.source ?? sourceProvider.name;
  jurisprudenceSources.add(searchProvider);
  // Só acontece no modo `tjpr+fixture`, que é opt-in: o provider primário falhou e a resposta veio
  // do fallback. Precisa de aviso, não de uma string discreta no rodapé — a fixture nunca devolve
  // vazio, então uma degradação despercebida entrega um relatório completo sobre acórdãos que não
  // existem. Comparar com o nome do provider configurado é o que torna o desvio detectável.
  if (sourceProvider.name !== "fixture" && searchProvider === "fixture") {
    degradedSources.push(criterioPesquisa);
  }

  searchSubTasks.push({
    id: "busca-1",
    name: criterioPesquisa,
    status: "COMPLETED",
    durationMs: Date.now() - tSearch,
    input: {
      keywords: keywordsSelecionadas,
      queryEnviada: criterioPesquisa,
      // Vazio na fixture, que não fala HTTP; presente sempre que a fonte for o portal real.
      url: searchResult.metadata?.url,
    },
    output: {
      provider: searchProvider,
      // O total que a fonte declarou ter, que não é o que veio: o portal responde por página.
      totalCount: searchResult.data.totalCount,
      itemsReturned: searchResult.data.items.length,
      // Quantas páginas o portal realmente entregou. Ficar em 1 com `SEARCH_MAX_PAGES = 3`
      // significa que o parâmetro de paginação ainda não está configurado (HU-38).
      pagesFetched: searchResult.metadata?.pagesFetched,
      // Quantas palavras do fim de `queryEnviada` o provider descartou até achar algum
      // resultado — a busca do TJPR é AND estrito e zera sozinha com poucos termos a mais.
      relaxations: searchResult.metadata?.relaxations,
      collectedCap: SEARCH_COLLECTED_ITEMS_CAP,
      items: audit ? searchResult.data.items : undefined,
    },
  });

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

  const uniqueItems = dedupeSearchItems(applySearchFunnel(searchResult.data));
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
      output: auditOutput(
        {
          totalFound: uniqueItems.length,
          selectedCount: selected.data.length,
          // O que o TJPR declara ter no acervo para esta query — quase sempre bem maior que
          // `totalFound`, porque a coleta para no teto (`SEARCH_COLLECTED_ITEMS_CAP`). Sempre
          // visível, mesmo fora do modo auditoria: sem isto, "60 encontrados" parece o universo
          // inteiro em vez de uma amostra de um acervo de centenas de milhares.
          declaradoPeloTjpr: searchResult.data.totalCount,
        },
        () => ({
          rankedCap: SEARCH_CANDIDATE_LIMIT,
          scratchpadCap: SCRATCHPAD_LIMIT,
          collectedCap: SEARCH_COLLECTED_ITEMS_CAP,
          // O score e sua composição por critério: é o que explica por que um acórdão entrou e
          // outro ficou de fora, sem reabrir `pre-rank.ts`.
          ranked: ranked.map((candidate) => ({
            id: candidate.item.id,
            processNumber: candidate.item.processNumber,
            chamber: candidate.item.chamber,
            judgmentDate: candidate.item.judgmentDate,
            url: candidate.item.url,
            score: candidate.score,
            scoreBreakdown: candidate.scoreBreakdown,
            selected: selected.data.some((item) => item.item.id === candidate.item.id),
          })),
        }),
      ),
      subTasks: audit ? searchSubTasks : undefined,
      logs: [
        `[INFO] ${uniqueItems.length} acórdãos coletados (de ${searchResult.data.totalCount.toLocaleString("pt-BR")} declarados pelo TJPR para esta busca); top ${selected.data.length} selecionados.`,
        ...(degradedSources.length > 0
          ? [
              `[AVISO] A fonte configurada (${sourceProvider.name}) falhou em ${degradedSources.length} busca(s) e a fixture respondeu no lugar. Decisões de fixture são fictícias: não serão exibidas como fonte.`,
            ]
          : []),
      ],
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
  /**
   * Contagem da onda em curso. É o que transforma os minutos mudos da etapa MAP — uma chamada de
   * modelo por decisão, em ondas de `SCRATCHPAD_CONCURRENCY` — em uma atualização por decisão
   * concluída, no mesmo nó e com o mesmo id, que o painel substitui no lugar.
   */
  const tally = {
    total: selected.data.length,
    processed: 0,
    failed: 0,
    fromCache: 0,
    queued: 0,
    fetching: 0,
    generating: 0,
    last: undefined as string | undefined,
    lastErrorCode: undefined as string | undefined,
    lastPhase: undefined as string | undefined,
    lastFetchMs: undefined as number | undefined,
    lastModelMs: undefined as number | undefined,
  };

  const scratchpadProgressEvent = (): PipelineEvent => ({
    type: "stage",
    event: recorder.progress("SCRATCHPAD_GENERATION", "Geração de Scratchpads", tScratch, {
      ...scratchpadDetail,
      output: {
        total: tally.total,
        processed: tally.processed,
        failed: tally.failed,
        fromCache: tally.fromCache,
        queued: tally.queued,
        fetching: tally.fetching,
        generating: tally.generating,
        inFlight: tally.fetching + tally.generating,
        elapsedMs: Date.now() - tScratch,
        last: tally.last,
        lastErrorCode: tally.lastErrorCode,
        lastPhase: tally.lastPhase,
        lastFetchMs: tally.lastFetchMs,
        lastModelMs: tally.lastModelMs,
      },
      logs: [
        `[INFO] ${tally.processed + tally.failed}/${tally.total} decisões analisadas` +
          (tally.failed > 0 ? ` · ${tally.failed} falha(s)` : ""),
      ],
    }),
  });

  const scratchpadBatch = yield* withLiveEvents<PipelineEvent, ToolResult<ScratchpadBatchResult>>((emit) =>
    guardedExecution.run(
      "generateScratchpads",
      () =>
        generateScratchpads(selected.data, llmProvider, jurisprudenceProvider, {
          cache: scratchpadCache,
          signal,
          onEvent: (event) => {
            const label = event.processNumber ?? event.candidateId;
            if (event.type === "STARTED") {
              tally.queued += 1;
              return;
            }
            if (event.type === "FETCHING") {
              tally.queued = Math.max(0, tally.queued - 1);
              tally.fetching += 1;
              emit(scratchpadProgressEvent());
              return;
            }
            if (event.type === "GENERATING") {
              tally.fetching = Math.max(0, tally.fetching - 1);
              tally.generating += 1;
              emit(scratchpadProgressEvent());
              return;
            }

            if (event.type === "FINISHED") {
              if (event.source === "cache") tally.queued = Math.max(0, tally.queued - 1);
              else tally.generating = Math.max(0, tally.generating - 1);
              tally.processed += 1;
              if (event.source === "cache") tally.fromCache += 1;
              tally.lastFetchMs = event.timing?.fetchMs;
              tally.lastModelMs = event.timing?.modelMs;
              tally.lastPhase = event.source;
              tally.last = `${label} ${event.status} ${(event.durationMs / 1000).toFixed(1)}s${
                event.source === "cache" ? " (cache)" : ""
              }`;
            } else {
              if (event.phase === "fetch") tally.fetching = Math.max(0, tally.fetching - 1);
              else if (event.phase === "model") tally.generating = Math.max(0, tally.generating - 1);
              else tally.queued = Math.max(0, tally.queued - 1);
              tally.failed += 1;
              tally.lastErrorCode = event.error.code;
              tally.lastPhase = event.phase;
              tally.last = `${label} ✖ ${(event.durationMs / 1000).toFixed(1)}s`;
            }

            emit(scratchpadProgressEvent());
          },
      }),
    ),
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

  // Uma sub-tarefa por decisão: é onde o pool de `SCRATCHPAD_CONCURRENCY` workers (uma chamada de
  // modelo por decisão, nunca em lote — HU-17) fica visível como trabalho paralelo de fato.
  const scratchpadSubTasks: AgentTaskInfo[] | undefined = audit
    ? [
        ...scratchpadBatch.data.scratchpads.map((scratchpad) => ({
          id: scratchpad.scratchpadId,
          name: `${scratchpad.source.processNumber ?? scratchpad.source.sourceId} · ${scratchpad.status}`,
          status: (scratchpad.status === "VALID" ? "COMPLETED" : "FAILED") as AgentTaskInfo["status"],
          input: { decisionId: scratchpad.source.sourceId, url: scratchpad.source.url },
          output: scratchpad,
        })),
        ...scratchpadBatch.data.failures.map((failure) => ({
          id: `falha-${failure.candidateId}`,
          name: `${failure.candidateId} · ${failure.error.code}`,
          status: "FAILED" as AgentTaskInfo["status"],
          input: { decisionId: failure.candidateId },
          error: { code: failure.error.code, description: failure.error.description, metadata: failure.error.metadata },
        })),
        // As chamadas de modelo da etapa MAP — uma por decisão (HU-17) — entram aqui junto com o
        // resultado de cada uma. Sem drená-las neste nó elas vazariam para o cross-file, que
        // apareceria carregando prompts que não são dele.
        ...(llmSubTasks() ?? []),
      ]
    : undefined;

  yield {
    type: "stage",
    event: recorder.record("SCRATCHPAD_GENERATION", "Geração de Scratchpads", "COMPLETED", tScratch, {
      ...scratchpadDetail,
      subTasks: scratchpadSubTasks,
      output: auditOutput(
        { validCount: validScratchpads.length, status: scratchpadBatch.data.status },
        () => ({
          requested: scratchpadBatch.data.requested,
          processed: scratchpadBatch.data.processed,
          failed: scratchpadBatch.data.failed,
          failures: scratchpadBatch.data.failures,
        }),
      ),
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
      output: auditOutput(
        { analysesCount: crossFile.data.analyses.length },
        () => ({
          analyses: crossFile.data.analyses,
          // Derivado em código, nunca perguntado ao modelo (HU-22) — vale registrar qual foi.
          opposingPrecedentsFound: crossFile.data.opposingPrecedentsFound,
          warnings: crossFile.data.warnings,
        }),
      ),
      subTasks: llmSubTasks(),
      logs: [
        `[INFO] Análise cruzada das teses e precedentes finalizada com sucesso.`,
        ...(crossFile.data.warnings ?? []).map((warning) => `[AVISO] ${warning}`),
      ],
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
  const evidence = await guardedExecution.run("verifyEvidence", () =>
    verifyEvidence(crossFile.data.analyses, scratchpadBatch.data.scratchpads, sourceProvider),
  );
  if (evidence.isError) {
    yield* failStage("EVIDENCE_VERIFICATION", "Verificação de Evidências", tEv, evidence.error, evidenceDetail);
    return;
  }

  // Uma sub-tarefa por decisão reaberta, com o veredito de cada citação. Sem `matchKind` e
  // `similarity` ao lado do trecho, "8 evidências verificadas" não é conferível: é justamente aqui
  // que se vê uma citação que o modelo aproximou demais, ou uma fonte que mudou desde a coleta.
  const evidenceSubTasks: AgentTaskInfo[] | undefined = audit
    ? [
        ...Object.entries(
          evidence.data.evidences.reduce<Record<string, typeof evidence.data.evidences>>((acc, item) => {
            (acc[item.scratchpadId] ??= []).push(item);
            return acc;
          }, {}),
        ).map(([scratchpadId, items]) => ({
          id: scratchpadId,
          name: `${items[0]?.source.processNumber ?? scratchpadId} · ${items.filter((i) => i.verified).length}/${items.length} conferidas`,
          status: (items.some((i) => i.verified) ? "COMPLETED" : "FAILED") as AgentTaskInfo["status"],
          input: {
            url: items[0]?.source.url,
            sourceHashNoScratchpad: items[0]?.source.sourceHash,
            fonteAlterada: evidence.data.staleScratchpadIds.includes(scratchpadId),
          },
          output: items.map((item) => ({
            evidenceId: item.evidenceId,
            verified: item.verified,
            matchKind: item.matchKind,
            similarity: item.similarity,
            quote: item.quote,
          })),
        })),
        ...evidence.data.failures.map((failure) => ({
          id: `falha-${failure.scratchpadId}`,
          name: `${failure.scratchpadId} · ${failure.error.code}`,
          status: "FAILED" as AgentTaskInfo["status"],
          error: { code: failure.error.code, description: failure.error.description },
        })),
      ]
    : undefined;

  yield {
    type: "stage",
    event: recorder.record("EVIDENCE_VERIFICATION", "Verificação de Evidências", "COMPLETED", tEv, {
      ...evidenceDetail,
      subTasks: evidenceSubTasks,
      output: auditOutput(
        { verifiedCount: evidence.data.verifiedCount },
        () => ({
          rejectedCount: evidence.data.rejectedCount,
          staleScratchpadIds: evidence.data.staleScratchpadIds,
          failures: evidence.data.failures,
          evidences: evidence.data.evidences,
        }),
      ),
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
  );
  if (report.isError) {
    yield* failStage("REPORT_GENERATION", "Geração de Relatório", tRep, report.error, reportDetail);
    return;
  }

  yield {
    type: "stage",
    event: recorder.record("REPORT_GENERATION", "Geração de Relatório", "COMPLETED", tRep, {
      ...reportDetail,
      output: auditOutput(
        { reportId: report.data.reportId, status: "READY" },
        () => ({
          report: report.data,
          // O que a regra anti-alucinação de HU-25 removeu antes da tela, e por quê. Sem isto,
          // "por que isso não aparece no relatório" só se responde relendo o código.
          policyDropped: evidencePolicy.dropped,
          verifiedEvidenceIds: evidencePolicy.verifiedEvidenceIds,
        }),
      ),
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
