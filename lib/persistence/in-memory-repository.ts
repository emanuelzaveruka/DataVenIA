import { createAppError } from "../errors/app-error";
import { toolFailure, toolSuccess, type ToolResult } from "../errors/tool-result";
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
} from "../schemas/persistence.schema";
import type { AnalysisRunSnapshot, DataVeniaRepository } from "./repository";

function decisionKey(provider: string, sourceId: string): string {
  return `${provider}:${sourceId}`;
}

function runNotFound(runId: string, operation: string) {
  return toolFailure(
    createAppError({
      code: "RUN_NOT_FOUND",
      category: "NOT_FOUND",
      severity: "ERROR",
      description: `Analysis run "${runId}" does not exist in the repository`,
      userMessage: "A execução solicitada não foi encontrada.",
      isRetryable: false,
      operation,
      metadata: { runId },
    }),
  );
}

/**
 * Implementação em memória do `DataVeniaRepository`. Não é andaime descartável: é o que sustenta o
 * critério de aceite 16 (aplicação funciona em modo fixture, sem conectividade) e o que permite
 * testar idempotência e observabilidade sem subir banco. O Postgres de §11.8 é a *outra*
 * implementação da mesma interface, não a substituição desta.
 *
 * Vale só enquanto o processo vive — por isso `getRepository()` só a escolhe quando não há Supabase
 * configurado, e por isso HU-33 (cache entre execuções) só tem efeito real com o storage persistente.
 */
export function createInMemoryRepository(): DataVeniaRepository {
  const runs = new Map<string, AnalysisRunRecord>();
  const documents = new Map<string, UploadedDocumentRecord>();
  const caseAnalyses = new Map<string, CaseAnalysisRecord>();
  const searches: JurisprudenceSearchRecord[] = [];
  const decisions = new Map<string, JurisprudenceDecisionRecord>();
  const scratchpads = new Map<string, DecisionScratchpadRecord>();
  const crossFileAnalyses: CrossFileAnalysisRecord[] = [];
  const evidences: VerifiedEvidenceRecord[] = [];
  const reports = new Map<string, FinalReportRecord>();
  const toolExecutions: ToolExecutionLog[] = [];
  const errors: ErrorRecord[] = [];

  return {
    name: "in-memory",

    async createRun(run) {
      runs.set(run.runId, run);
      return toolSuccess(run);
    },

    async updateRun(runId, patch) {
      const current = runs.get(runId);
      if (!current) return runNotFound(runId, "updateRun");

      const updated = { ...current, ...patch };
      runs.set(runId, updated);
      return toolSuccess(updated);
    },

    async saveDocument(record) {
      documents.set(record.documentId, record);
      return toolSuccess(record);
    },

    async getDocument(documentId) {
      return toolSuccess(documents.get(documentId));
    },

    async saveCaseAnalysis(record) {
      caseAnalyses.set(record.runId, record);
      return toolSuccess(record);
    },

    async saveSearch(record) {
      searches.push(record);
      return toolSuccess(record);
    },

    async saveDecision(record) {
      decisions.set(decisionKey(record.provider, record.sourceId), record);
      return toolSuccess(record);
    },

    async findDecision(provider, sourceId) {
      return toolSuccess(decisions.get(decisionKey(provider, sourceId)));
    },

    async saveScratchpad(record) {
      scratchpads.set(record.idempotencyKey, record);
      return toolSuccess(record);
    },

    async findScratchpadByIdempotencyKey(key) {
      return toolSuccess(scratchpads.get(key));
    },

    async saveCrossFileAnalyses(records) {
      crossFileAnalyses.push(...records);
      return toolSuccess(records.length);
    },

    async saveEvidences(records) {
      evidences.push(...records);
      return toolSuccess(records.length);
    },

    async saveReport(record) {
      reports.set(record.runId, record);
      return toolSuccess(record);
    },

    async saveToolExecution(log) {
      toolExecutions.push(log);
      return toolSuccess(log);
    },

    async saveError(record) {
      errors.push(record);
      return toolSuccess(record);
    },

    async loadRun(runId) {
      const run = runs.get(runId);
      if (!run) return toolSuccess(undefined);

      const runScratchpads = [...scratchpads.values()].filter((row) => row.runId === runId);

      // As decisões do snapshot são as efetivamente usadas pela execução (as dos Scratchpads
      // dela), não o cache inteiro: `jurisprudence_decisions` é global e cresce entre execuções.
      const usedDecisionIds = new Set(runScratchpads.map((row) => row.decisionId));

      const snapshot: AnalysisRunSnapshot = {
        run,
        document: [...documents.values()].find((row) => row.runId === runId),
        caseAnalysis: caseAnalyses.get(runId),
        searches: searches.filter((row) => row.runId === runId),
        decisions: [...decisions.values()].filter((row) => usedDecisionIds.has(row.sourceId)),
        scratchpads: runScratchpads,
        crossFileAnalyses: crossFileAnalyses.filter((row) => row.runId === runId),
        evidences: evidences.filter((row) => row.runId === runId),
        report: reports.get(runId),
        toolExecutions: toolExecutions.filter((row) => row.workflowId === runId),
        errors: errors.filter((row) => row.runId === runId),
      };

      return toolSuccess(snapshot);
    },

    async deleteRun(runId) {
      let removed = 0;

      const removeFromArray = <T>(rows: T[], belongs: (row: T) => boolean): void => {
        for (let index = rows.length - 1; index >= 0; index--) {
          if (belongs(rows[index]!)) {
            rows.splice(index, 1);
            removed += 1;
          }
        }
      };

      const removeFromMap = <T>(map: Map<string, T>, belongs: (row: T) => boolean): void => {
        for (const [key, row] of map) {
          if (belongs(row)) {
            map.delete(key);
            removed += 1;
          }
        }
      };

      removeFromMap(documents, (row) => row.runId === runId);
      removeFromMap(caseAnalyses, (row) => row.runId === runId);
      removeFromMap(scratchpads, (row) => row.runId === runId);
      removeFromMap(reports, (row) => row.runId === runId);
      removeFromArray(searches, (row) => row.runId === runId);
      removeFromArray(crossFileAnalyses, (row) => row.runId === runId);
      removeFromArray(evidences, (row) => row.runId === runId);
      removeFromArray(toolExecutions, (row) => row.workflowId === runId);
      removeFromArray(errors, (row) => row.runId === runId);

      if (runs.delete(runId)) removed += 1;

      // `decisions` fica de fora de propósito: é jurisprudência pública, o único dado que HU-06
      // autoriza reter entre sessões, e é o cache que HU-33 reaproveita.
      return toolSuccess(removed);
    },
  };
}
