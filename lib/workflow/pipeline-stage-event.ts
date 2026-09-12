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

/**
 * Log de progresso exibido ao usuário (HU-04 / N8n Inspector).
 */
export function createStageRecorder() {
  const events: PipelineStageEvent[] = [];
  const nodeDetails: NodeExecutionDetail[] = [];

  return {
    events,
    nodeDetails,
    record(
      stage: string,
      label: string,
      status: PipelineStageStatus,
      startedAt: number,
      detail?: Partial<NodeExecutionDetail>,
    ): void {
      const now = Date.now();
      const durationMs = now - startedAt;

      const nodeDetail: NodeExecutionDetail = {
        id: detail?.id || `node-${events.length + 1}-${stage.toLowerCase()}`,
        stage,
        nodeName: detail?.nodeName || label,
        status,
        startedAt: new Date(startedAt).toISOString(),
        completedAt: new Date(now).toISOString(),
        durationMs,
        agentName: detail?.agentName,
        agentRole: detail?.agentRole,
        agentIcon: detail?.agentIcon,
        subTasks: detail?.subTasks,
        input: detail?.input,
        output: detail?.output,
        error: detail?.error,
        logs: detail?.logs || [`[${new Date(now).toLocaleTimeString()}] Status: ${status}`],
      };

      nodeDetails.push(nodeDetail);
      events.push({
        stage,
        label,
        status,
        durationMs,
        nodeDetail,
      });
    },
  };
}

