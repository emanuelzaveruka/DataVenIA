import type { WorkflowStage } from "../workflow/state-machine";
import { STAGE_TOOL_ALLOWLIST, type ToolName } from "./pre-tool-use";

export interface AgentExecutionContext {
  runId: string;
  traceId: string;
  stage: WorkflowStage;
  toolName: ToolName;
  allowedTools: readonly ToolName[];
  inputRefs?: Record<string, string | number | boolean | null | undefined>;
  constraints: readonly string[];
  schemaName?: string;
  schemaVersion?: string;
}

export interface BuildAgentExecutionContextParams {
  runId: string;
  traceId: string;
  stage: WorkflowStage;
  toolName: ToolName;
  inputRefs?: AgentExecutionContext["inputRefs"];
  constraints?: readonly string[];
  schemaName?: string;
  schemaVersion?: string;
}

const DEFAULT_CONSTRAINTS = [
  "Use apenas o contexto minimo da etapa atual.",
  "Nao execute ferramentas fora da allowlist do stage.",
  "Nao invente IDs, fontes ou campos ausentes.",
  "Nao reintroduza texto bruto do documento apos a sanitizacao.",
] as const;

/**
 * Capsula curta para chamadas internas/subagents: carrega identidade, stage e restricoes, mas nao
 * replica payloads grandes. Cada servico continua responsavel por anexar somente o insumo util.
 */
export function buildAgentExecutionContext(
  params: BuildAgentExecutionContextParams,
): AgentExecutionContext {
  return {
    runId: params.runId,
    traceId: params.traceId,
    stage: params.stage,
    toolName: params.toolName,
    allowedTools: STAGE_TOOL_ALLOWLIST[params.stage],
    inputRefs: params.inputRefs,
    constraints: params.constraints ?? DEFAULT_CONSTRAINTS,
    schemaName: params.schemaName,
    schemaVersion: params.schemaVersion,
  };
}
