import type { ToolResult } from "../errors/tool-result";
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

/**
 * Snapshot completo de uma execução (HU-34, critério de aceite: "é possível reconstruir todas as
 * etapas a partir do banco"). Existe como tipo próprio porque a reconstrução é a *razão de ser* da
 * persistência — se uma etapa não couber aqui, ela não está sendo persistida de forma auditável.
 */
export interface AnalysisRunSnapshot {
  run: AnalysisRunRecord;
  document?: UploadedDocumentRecord;
  caseAnalysis?: CaseAnalysisRecord;
  searches: JurisprudenceSearchRecord[];
  decisions: JurisprudenceDecisionRecord[];
  scratchpads: DecisionScratchpadRecord[];
  crossFileAnalyses: CrossFileAnalysisRecord[];
  evidences: VerifiedEvidenceRecord[];
  report?: FinalReportRecord;
  toolExecutions: ToolExecutionLog[];
  errors: ErrorRecord[];
}

/**
 * Única porta de saída para storage (§11.8). Mesmo papel de `JurisprudenceProvider` e
 * `LlmProvider`: nenhum serviço importa driver de banco, todos dependem só desta interface — é o
 * que mantém os testes e o modo fixture rodando sem rede e sem banco (critério de aceite 16).
 *
 * Todos os métodos devolvem `ToolResult` (§11.3): falha de persistência é erro do contrato único,
 * classificado como qualquer outro, nunca uma exceção solta atravessando o pipeline.
 */
export interface JurisFlowRepository {
  readonly name: string;

  createRun(run: AnalysisRunRecord): Promise<ToolResult<AnalysisRunRecord>>;
  updateRun(
    runId: string,
    patch: Partial<Pick<AnalysisRunRecord, "stage" | "status" | "finishedAt">>,
  ): Promise<ToolResult<AnalysisRunRecord>>;

  saveDocument(record: UploadedDocumentRecord): Promise<ToolResult<UploadedDocumentRecord>>;
  getDocument(documentId: string): Promise<ToolResult<UploadedDocumentRecord | undefined>>;

  saveCaseAnalysis(record: CaseAnalysisRecord): Promise<ToolResult<CaseAnalysisRecord>>;
  saveSearch(record: JurisprudenceSearchRecord): Promise<ToolResult<JurisprudenceSearchRecord>>;

  /**
   * Cache de decisão bruta (§11.8). `findDecision` é consultado por `sourceId`; quem grava também
   * grava o `sourceHash`, que é o que permite a HU-24 detectar depois que a fonte mudou.
   */
  saveDecision(record: JurisprudenceDecisionRecord): Promise<ToolResult<JurisprudenceDecisionRecord>>;
  findDecision(
    provider: string,
    sourceId: string,
  ): Promise<ToolResult<JurisprudenceDecisionRecord | undefined>>;

  saveScratchpad(record: DecisionScratchpadRecord): Promise<ToolResult<DecisionScratchpadRecord>>;
  /** Busca por chave de idempotência (HU-33), nunca por `decisionId` sozinho. */
  findScratchpadByIdempotencyKey(
    key: string,
  ): Promise<ToolResult<DecisionScratchpadRecord | undefined>>;

  saveCrossFileAnalyses(records: CrossFileAnalysisRecord[]): Promise<ToolResult<number>>;
  saveEvidences(records: VerifiedEvidenceRecord[]): Promise<ToolResult<number>>;
  saveReport(record: FinalReportRecord): Promise<ToolResult<FinalReportRecord>>;

  saveToolExecution(log: ToolExecutionLog): Promise<ToolResult<ToolExecutionLog>>;
  saveError(record: ErrorRecord): Promise<ToolResult<ErrorRecord>>;

  loadRun(runId: string): Promise<ToolResult<AnalysisRunSnapshot | undefined>>;

  /**
   * HU-06 — "dados de sessão são descartados ao encerrar a navegação, exceto o necessário para
   * idempotência/cache de jurisprudência pública". Apaga tudo que pertence à execução; as decisões
   * públicas em `jurisprudence_decisions` sobrevivem de propósito, porque não contêm dado do
   * cliente e são o que o cache de HU-33 reaproveita.
   */
  deleteRun(runId: string): Promise<ToolResult<number>>;
}
