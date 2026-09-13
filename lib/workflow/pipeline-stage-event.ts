export type PipelineStageStatus = "IDLE" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";

export interface AgentTaskInfo {
  id: string;
  name: string;
  status: PipelineStageStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  logs?: string[];
}

export interface NodeExecutionDetail {
  id: string;
  stage: string;
  nodeName: string;
  status: PipelineStageStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs: number;
  agentName?: string;
  agentRole?: string;
  agentIcon?: string;
  subTasks?: AgentTaskInfo[];
  input?: Record<string, unknown> | unknown;
  output?: Record<string, unknown> | unknown;
  error?: {
    code?: string;
    message: string;
    description?: string;
    details?: unknown;
  };
  logs?: string[];
}

export interface PipelineStageEvent {
  stage: string;
  status: PipelineStageStatus;
  label: string;
  durationMs: number;
  nodeDetail?: NodeExecutionDetail;
}

export interface StageRecorder {
  readonly events: PipelineStageEvent[];
  readonly nodeDetails: NodeExecutionDetail[];
  /**
   * Evento de início de nó, para quem acompanha a execução ao vivo (HU-04/HU-35). **Não acumula**
   * em `events`: o array final continua contendo só estados terminais, que é o que o payload da
   * resposta sempre carregou — um `RUNNING` sobrevivente ali seria um nó que nunca terminou.
   */
  start(stage: string, label: string, detail?: Partial<NodeExecutionDetail>): PipelineStageEvent;
  /**
   * Atualização de um nó que **já começou** e ainda não terminou — o que uma etapa longa emite a
   * cada item concluído. Difere de `start` em um ponto só, e é o ponto: recebe o instante real de
   * início, de modo que a duração cresce a cada atualização em vez de voltar a zero. Como `start`,
   * não acumula em `events`/`nodeDetails`.
   */
  progress(
    stage: string,
    label: string,
    startedAt: number,
    detail?: Partial<NodeExecutionDetail>,
  ): PipelineStageEvent;
  record(
    stage: string,
    label: string,
    status: PipelineStageStatus,
    startedAt: number,
    detail?: Partial<NodeExecutionDetail>,
  ): PipelineStageEvent;
}

function buildNodeDetail(
  stage: string,
  label: string,
  status: PipelineStageStatus,
  startedAt: number,
  completedAtMs: number,
  fallbackIndex: number,
  detail?: Partial<NodeExecutionDetail>,
): NodeExecutionDetail {
  return {
    id: detail?.id || `node-${fallbackIndex}-${stage.toLowerCase()}`,
    stage,
    nodeName: detail?.nodeName || label,
    status,
    startedAt: new Date(startedAt).toISOString(),
    completedAt: status === "RUNNING" ? undefined : new Date(completedAtMs).toISOString(),
    durationMs: completedAtMs - startedAt,
    agentName: detail?.agentName,
    agentRole: detail?.agentRole,
    agentIcon: detail?.agentIcon,
    subTasks: detail?.subTasks,
    input: detail?.input,
    output: detail?.output,
    error: detail?.error,
    logs:
      detail?.logs ||
      [`[${new Date(completedAtMs).toLocaleTimeString()}] Status: ${status}`],
  };
}

/**
 * Log de progresso exibido ao usuário (HU-04 / N8n Inspector).
 *
 * `record` devolve o evento além de acumulá-lo: é o que permite ao orquestrador emiti-lo ao vivo
 * sem manter um segundo canal em paralelo com o array.
 */
export function createStageRecorder(): StageRecorder {
  const events: PipelineStageEvent[] = [];
  const nodeDetails: NodeExecutionDetail[] = [];

  return {
    events,
    nodeDetails,

    start(stage, label, detail) {
      const startedAt = Date.now();
      const nodeDetail = buildNodeDetail(
        stage,
        label,
        "RUNNING",
        startedAt,
        startedAt,
        events.length + 1,
        detail,
      );

      return { stage, label, status: "RUNNING", durationMs: 0, nodeDetail };
    },

    progress(stage, label, startedAt, detail) {
      const nodeDetail = buildNodeDetail(
        stage,
        label,
        "RUNNING",
        startedAt,
        Date.now(),
        events.length + 1,
        detail,
      );

      return { stage, label, status: "RUNNING", durationMs: nodeDetail.durationMs, nodeDetail };
    },

    record(stage, label, status, startedAt, detail) {
      const now = Date.now();
      const nodeDetail = buildNodeDetail(
        stage,
        label,
        status,
        startedAt,
        now,
        events.length + 1,
        detail,
      );

      nodeDetails.push(nodeDetail);
      const event: PipelineStageEvent = {
        stage,
        label,
        status,
        durationMs: nodeDetail.durationMs,
        nodeDetail,
      };
      events.push(event);
      return event;
    },
  };
}
