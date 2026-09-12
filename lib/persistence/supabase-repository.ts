import type { z } from "zod";
import { createAppError } from "../errors/app-error";
import { isRetryable } from "../errors/error-classifier";
import { toolFailure, toolSuccess, type ToolResult } from "../errors/tool-result";
import {
  AnalysisRunRecordSchema,
  CaseAnalysisRecordSchema,
  CrossFileAnalysisRecordSchema,
  DecisionScratchpadRecordSchema,
  ErrorRecordSchema,
  FinalReportRecordSchema,
  JurisprudenceDecisionRecordSchema,
  JurisprudenceSearchRecordSchema,
  ToolExecutionLogSchema,
  UploadedDocumentRecordSchema,
  VerifiedEvidenceRecordSchema,
} from "../schemas/persistence.schema";
import type { AnalysisRunSnapshot, JurisFlowRepository } from "./repository";
import { fromRow, toRow } from "./row-mapping";

export interface SupabaseRepositoryConfig {
  url: string;
  /**
   * Service role key. Roda só no servidor (as rotas são `runtime = "nodejs"`): esta chave ignora
   * RLS e nunca pode chegar ao browser — por isso a variável de ambiente não tem prefixo
   * `NEXT_PUBLIC_`.
   */
  serviceRoleKey: string;
  /** Injetável para teste: o repositório é exercitado sem rede, como os providers de §15. */
  fetchImpl?: typeof fetch;
}

type Row = Record<string, unknown>;

/**
 * Erro de persistência no contrato único de §11.3. `httpStatus` entra na classificação central
 * (`isRetryable`), então 503 do Supabase é retryable e 401 não — a decisão nunca é tomada aqui
 * (HU-32).
 */
function persistenceError(
  operation: string,
  description: string,
  httpStatus?: number,
  metadata?: Record<string, unknown>,
) {
  return createAppError({
    code: httpStatus === undefined ? "PERSISTENCE_UNREACHABLE" : "PERSISTENCE_REQUEST_FAILED",
    category: httpStatus === undefined ? "NETWORK" : "UPSTREAM",
    severity: "ERROR",
    description,
    userMessage: "Não foi possível registrar o resultado desta etapa.",
    isRetryable: isRetryable({
      category: httpStatus === undefined ? "NETWORK" : "UPSTREAM",
      httpStatus,
    }),
    source: "supabase",
    operation,
    metadata: { ...metadata, httpStatus },
  });
}

export function createSupabaseRepository(config: SupabaseRepositoryConfig): JurisFlowRepository {
  const doFetch = config.fetchImpl ?? fetch;
  const baseUrl = `${config.url.replace(/\/$/, "")}/rest/v1`;

  const headers: Record<string, string> = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  async function request(
    operation: string,
    path: string,
    init: RequestInit & { prefer?: string },
  ): Promise<ToolResult<Row[]>> {
    const { prefer, ...rest } = init;

    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        ...rest,
        headers: prefer ? { ...headers, Prefer: prefer } : headers,
      });
    } catch (cause) {
      return toolFailure(
        persistenceError(operation, `Supabase request failed before reaching the server: ${String(cause)}`),
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return toolFailure(
        persistenceError(
          operation,
          `Supabase responded ${response.status} for ${path}: ${body.slice(0, 500)}`,
          response.status,
          { path },
        ),
      );
    }

    const text = await response.text();
    if (text.trim().length === 0) return toolSuccess([]);

    try {
      const parsed: unknown = JSON.parse(text);
      return toolSuccess(Array.isArray(parsed) ? (parsed as Row[]) : [parsed as Row]);
    } catch (cause) {
      return toolFailure(
        persistenceError(operation, `Supabase returned a non-JSON payload for ${path}: ${String(cause)}`),
      );
    }
  }

  /**
   * Toda linha que volta do banco é revalidada pelo schema antes de virar objeto de domínio. É a
   * mesma postura de §11.7 aplicada ao storage: dado que entrou por outro caminho (migration
   * antiga, escrita manual, versão anterior do pipeline) não é confiado só por estar no banco.
   */
  function parseRow<T>(
    schema: z.ZodType<T>,
    row: Row | undefined,
    operation: string,
  ): ToolResult<T | undefined> {
    if (!row) return toolSuccess(undefined);

    const parsed = schema.safeParse(fromRow(row));
    if (!parsed.success) {
      return toolFailure(
        createAppError({
          code: "PERSISTED_ROW_INVALID",
          category: "VALIDATION",
          severity: "ERROR",
          description: `Row read from Supabase failed schema validation in ${operation}: ${parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ")}`,
          userMessage: "Um registro salvo anteriormente está em formato incompatível.",
          isRetryable: false,
          source: "supabase",
          operation,
        }),
      );
    }

    return toolSuccess(parsed.data);
  }

  async function upsert<T>(
    operation: string,
    table: string,
    schema: z.ZodType<T>,
    record: T,
  ): Promise<ToolResult<T>> {
    const result = await request(operation, `/${table}`, {
      method: "POST",
      body: JSON.stringify(toRow(record as Record<string, unknown>)),
      prefer: "resolution=merge-duplicates,return=representation",
    });
    if (result.isError) return result;

    const parsed = parseRow(schema, result.data[0], operation);
    if (parsed.isError) return parsed;
    // PostgREST com `return=representation` sempre devolve a linha gravada; se não devolveu, o que
    // se tem em mãos é o que foi enviado, e é isso que se propaga.
    return toolSuccess(parsed.data ?? record);
  }

  async function insertMany<T>(
    operation: string,
    table: string,
    records: T[],
  ): Promise<ToolResult<number>> {
    if (records.length === 0) return toolSuccess(0);

    const result = await request(operation, `/${table}`, {
      method: "POST",
      body: JSON.stringify(records.map((record) => toRow(record as Record<string, unknown>))),
      prefer: "resolution=merge-duplicates",
    });
    if (result.isError) return result;

    return toolSuccess(records.length);
  }

  async function selectMany<T>(
    operation: string,
    table: string,
    filter: string,
    schema: z.ZodType<T>,
  ): Promise<ToolResult<T[]>> {
    const result = await request(operation, `/${table}?${filter}`, { method: "GET" });
    if (result.isError) return result;

    const rows: T[] = [];
    for (const row of result.data) {
      const parsed = parseRow(schema, row, operation);
      if (parsed.isError) return parsed;
      if (parsed.data !== undefined) rows.push(parsed.data);
    }
    return toolSuccess(rows);
  }

  async function selectOne<T>(
    operation: string,
    table: string,
    filter: string,
    schema: z.ZodType<T>,
  ): Promise<ToolResult<T | undefined>> {
    const result = await selectMany(operation, table, `${filter}&limit=1`, schema);
    if (result.isError) return result;
    return toolSuccess(result.data[0]);
  }

  return {
    name: "supabase",

    createRun(run) {
      return upsert("createRun", "analysis_runs", AnalysisRunRecordSchema, run);
    },

    async updateRun(runId, patch) {
      const result = await request("updateRun", `/analysis_runs?run_id=eq.${encodeURIComponent(runId)}`, {
        method: "PATCH",
        body: JSON.stringify(toRow(patch as Record<string, unknown>)),
        prefer: "return=representation",
      });
      if (result.isError) return result;

      const parsed = parseRow(AnalysisRunRecordSchema, result.data[0], "updateRun");
      if (parsed.isError) return parsed;
      if (!parsed.data) {
        return toolFailure(
          createAppError({
            code: "RUN_NOT_FOUND",
            category: "NOT_FOUND",
            severity: "ERROR",
            description: `Analysis run "${runId}" was not found for update`,
            userMessage: "A execução solicitada não foi encontrada.",
            isRetryable: false,
            source: "supabase",
            operation: "updateRun",
            metadata: { runId },
          }),
        );
      }
      return toolSuccess(parsed.data);
    },

    saveDocument(record) {
      return upsert("saveDocument", "uploaded_documents", UploadedDocumentRecordSchema, record);
    },

    getDocument(documentId) {
      return selectOne(
        "getDocument",
        "uploaded_documents",
        `document_id=eq.${encodeURIComponent(documentId)}&select=*`,
        UploadedDocumentRecordSchema,
      );
    },

    saveCaseAnalysis(record) {
      return upsert("saveCaseAnalysis", "case_analyses", CaseAnalysisRecordSchema, record);
    },

    saveSearch(record) {
      return upsert("saveSearch", "jurisprudence_searches", JurisprudenceSearchRecordSchema, record);
    },

    saveDecision(record) {
      return upsert(
        "saveDecision",
        "jurisprudence_decisions",
        JurisprudenceDecisionRecordSchema,
        record,
      );
    },

    findDecision(provider, sourceId) {
      return selectOne(
        "findDecision",
        "jurisprudence_decisions",
        `provider=eq.${encodeURIComponent(provider)}&source_id=eq.${encodeURIComponent(sourceId)}&select=*`,
        JurisprudenceDecisionRecordSchema,
      );
    },

    saveScratchpad(record) {
      return upsert(
        "saveScratchpad",
        "decision_scratchpads",
        DecisionScratchpadRecordSchema,
        record,
      );
    },

    findScratchpadByIdempotencyKey(key) {
      return selectOne(
        "findScratchpadByIdempotencyKey",
        "decision_scratchpads",
        `idempotency_key=eq.${encodeURIComponent(key)}&select=*`,
        DecisionScratchpadRecordSchema,
      );
    },

    saveCrossFileAnalyses(records) {
      return insertMany("saveCrossFileAnalyses", "cross_file_analyses", records);
    },

    saveEvidences(records) {
      return insertMany("saveEvidences", "verified_evidence", records);
    },

    saveReport(record) {
      return upsert("saveReport", "final_reports", FinalReportRecordSchema, record);
    },

    saveToolExecution(log) {
      return upsert("saveToolExecution", "tool_executions", ToolExecutionLogSchema, log);
    },

    saveError(record) {
      return upsert("saveError", "errors", ErrorRecordSchema, record);
    },

    async loadRun(runId) {
      const filter = `run_id=eq.${encodeURIComponent(runId)}&select=*`;

      const run = await selectOne("loadRun", "analysis_runs", filter, AnalysisRunRecordSchema);
      if (run.isError) return run;
      if (!run.data) return toolSuccess(undefined);

      const document = await selectOne("loadRun", "uploaded_documents", filter, UploadedDocumentRecordSchema);
      if (document.isError) return document;

      const caseAnalysis = await selectOne("loadRun", "case_analyses", filter, CaseAnalysisRecordSchema);
      if (caseAnalysis.isError) return caseAnalysis;

      const searches = await selectMany("loadRun", "jurisprudence_searches", filter, JurisprudenceSearchRecordSchema);
      if (searches.isError) return searches;

      const scratchpads = await selectMany("loadRun", "decision_scratchpads", filter, DecisionScratchpadRecordSchema);
      if (scratchpads.isError) return scratchpads;

      const crossFileAnalyses = await selectMany("loadRun", "cross_file_analyses", filter, CrossFileAnalysisRecordSchema);
      if (crossFileAnalyses.isError) return crossFileAnalyses;

      const evidences = await selectMany("loadRun", "verified_evidence", filter, VerifiedEvidenceRecordSchema);
      if (evidences.isError) return evidences;

      const report = await selectOne("loadRun", "final_reports", filter, FinalReportRecordSchema);
      if (report.isError) return report;

      const toolExecutions = await selectMany(
        "loadRun",
        "tool_executions",
        `workflow_id=eq.${encodeURIComponent(runId)}&select=*`,
        ToolExecutionLogSchema,
      );
      if (toolExecutions.isError) return toolExecutions;

      const errors = await selectMany("loadRun", "errors", filter, ErrorRecordSchema);
      if (errors.isError) return errors;

      // As decisões trazidas são as que a execução realmente usou. `jurisprudence_decisions` é
      // global (cache público de HU-33) e não pertence a nenhum run.
      const usedIds = [...new Set(scratchpads.data.map((row) => row.decisionId))];
      const decisions = usedIds.length === 0
        ? toolSuccess([])
        : await selectMany(
            "loadRun",
            "jurisprudence_decisions",
            `source_id=in.(${usedIds.map((id) => encodeURIComponent(id)).join(",")})&select=*`,
            JurisprudenceDecisionRecordSchema,
          );
      if (decisions.isError) return decisions;

      const snapshot: AnalysisRunSnapshot = {
        run: run.data,
        document: document.data,
        caseAnalysis: caseAnalysis.data,
        searches: searches.data,
        decisions: decisions.data,
        scratchpads: scratchpads.data,
        crossFileAnalyses: crossFileAnalyses.data,
        evidences: evidences.data,
        report: report.data,
        toolExecutions: toolExecutions.data,
        errors: errors.data,
      };

      return toolSuccess(snapshot);
    },

    async deleteRun(runId) {
      // Uma única deleção: a migration declara `ON DELETE CASCADE` a partir de `analysis_runs`, o
      // que torna impossível esquecer uma tabela derivada aqui (HU-06). `jurisprudence_decisions`
      // não referencia run nenhum e por isso sobrevive, como o cache público de HU-33 exige.
      const result = await request("deleteRun", `/analysis_runs?run_id=eq.${encodeURIComponent(runId)}`, {
        method: "DELETE",
        prefer: "return=representation",
      });
      if (result.isError) return result;

      return toolSuccess(result.data.length);
    },
  };
}
