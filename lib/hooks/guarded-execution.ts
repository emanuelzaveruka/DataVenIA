import { createAppError, type AppError } from "../errors/app-error";
import { toolFailure, type ToolResult } from "../errors/tool-result";
import type { ExecutionRecorder } from "../observability/execution-recorder";
import type { WorkflowStage } from "../workflow/state-machine";
import { postToolUse } from "./post-tool-use";
import { preToolUse, type ToolName } from "./pre-tool-use";

export interface GuardedExecutionConfig {
  getStage: () => WorkflowStage;
  recorder: ExecutionRecorder;
  onBlockedTool?: (error: AppError) => void | Promise<void>;
}

export interface GuardedExecution {
  run<T>(toolName: ToolName, operation: () => Promise<ToolResult<T>>): Promise<ToolResult<T>>;
}

function blockedToolError(stage: WorkflowStage, toolName: ToolName, cause: unknown): AppError {
  const message = cause && typeof cause === "object" && "message" in cause
    ? String((cause as { message: unknown }).message)
    : `Tool "${toolName}" is not allowed during stage ${stage}`;

  return createAppError({
    code: "INVALID_TOOL_FOR_STAGE",
    category: "BUSINESS_RULE",
    severity: "ERROR",
    description: message,
    userMessage: "Uma etapa do pipeline tentou executar uma ferramenta fora da fase permitida.",
    isRetryable: false,
    operation: toolName,
    metadata: { stage, toolName },
  });
}

/**
 * Porta unica de execucao de tools: PreToolUse bloqueia antes da chamada real, o recorder mede a
 * execucao autorizada, e PostToolUse centraliza telemetria/segunda camada apos o resultado.
 */
export function createGuardedExecution(config: GuardedExecutionConfig): GuardedExecution {
  return {
    async run<T>(toolName: ToolName, operation: () => Promise<ToolResult<T>>): Promise<ToolResult<T>> {
      const stage = config.getStage();

      try {
        preToolUse({ stage, toolName });
      } catch (cause) {
        const error = blockedToolError(stage, toolName, cause);
        await config.recorder.recordCall(toolName, Date.now(), toolFailure(error));
        await config.onBlockedTool?.(error);
        return toolFailure(error);
      }

      const result = await config.recorder.run(toolName, operation);
      return postToolUse(result, { stage, toolName });
    },
  };
}
