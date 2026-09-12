import type { ToolResult } from "../errors/tool-result";
import type { WorkflowStage } from "../workflow/state-machine";

export interface PostToolUseContext {
  stage: WorkflowStage;
  toolName: string;
}

/**
 * Segunda camada de validação (§11.2): registra telemetria e devolve o
 * ToolResult inalterado. A validação estrutural (Zod) do payload de sucesso
 * é responsabilidade de cada serviço, que decide o schema esperado.
 */
export function postToolUse<T>(
  result: ToolResult<T>,
  context: PostToolUseContext,
): ToolResult<T> {
  if (result.isError) {
    console.error(
      `[postToolUse] ${context.stage}/${context.toolName} failed: ${result.error.code} (${result.error.category})`,
    );
  }
  return result;
}
