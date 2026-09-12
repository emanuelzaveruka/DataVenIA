import type { WorkflowStage } from "../workflow/state-machine";

/**
 * Allowlist de ferramentas por estágio (§11.2). Só os dois estágios citados
 * explicitamente em contexto-geral.md (§7.1) já têm nomes de tool definidos;
 * os demais são preenchidos quando o serviço daquele estágio é implementado.
 */
export const STAGE_TOOL_ALLOWLIST: Record<WorkflowStage, readonly string[]> = {
  DOCUMENT_ANALYSIS: ["validateFile", "parseDocument", "sanitizeDocument"],
  QUERY_GENERATION: [],
  SEARCH: ["searchJurisprudence", "fetchDecision"],
  SCRATCHPAD_GENERATION: ["fetchDecision", "generateScratchpad"],
  CROSS_FILE_ANALYSIS: [],
  EVIDENCE_VERIFICATION: [],
  REPORT_GENERATION: ["readScratchpad", "readEvidence", "generateFinalReport"],
};

export interface ToolCallContext {
  stage: WorkflowStage;
  toolName: string;
}

export interface PreToolUseError {
  code: "INVALID_STAGE";
  message: string;
  currentStage: WorkflowStage;
  toolName: string;
}

export function preToolUse(context: ToolCallContext): void {
  const allowed = STAGE_TOOL_ALLOWLIST[context.stage];
  if (!allowed.includes(context.toolName)) {
    throw {
      code: "INVALID_STAGE",
      message: `Tool "${context.toolName}" is not allowed during stage ${context.stage}`,
      currentStage: context.stage,
      toolName: context.toolName,
    } satisfies PreToolUseError;
  }
}
