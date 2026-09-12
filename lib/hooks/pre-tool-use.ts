import type { WorkflowStage } from "../workflow/state-machine";

export const TOOL_NAMES = [
  "validateFile",
  "parseDocument",
  "sanitizeDocument",
  "analyzeCase",
  "generateSearchQueries",
  "searchJurisprudence",
  "generateScratchpads",
  "analyzeCrossFile",
  "verifyEvidence",
  "buildReport",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/**
 * Allowlist de ferramentas por estágio (§11.2). Os nomes aqui são os mesmos usados pela porta
 * única de execução; se uma etapa nova chamar uma tool sem adicioná-la aqui, ela será bloqueada
 * antes de executar.
 */
export const STAGE_TOOL_ALLOWLIST: Record<WorkflowStage, readonly ToolName[]> = {
  DOCUMENT_ANALYSIS: ["validateFile", "parseDocument", "sanitizeDocument", "analyzeCase"],
  QUERY_GENERATION: ["generateSearchQueries"],
  SEARCH: ["searchJurisprudence"],
  SCRATCHPAD_GENERATION: ["generateScratchpads"],
  CROSS_FILE_ANALYSIS: ["analyzeCrossFile"],
  EVIDENCE_VERIFICATION: ["verifyEvidence"],
  REPORT_GENERATION: ["buildReport"],
};

export interface ToolCallContext {
  stage: WorkflowStage;
  toolName: ToolName;
}

export interface PreToolUseError {
  code: "INVALID_STAGE";
  message: string;
  currentStage: WorkflowStage;
  toolName: ToolName;
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
