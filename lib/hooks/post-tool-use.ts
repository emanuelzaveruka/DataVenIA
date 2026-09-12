import type { ToolResult } from "../errors/tool-result";
import type { WorkflowStage } from "../workflow/state-machine";
import type { ExecutionRecorder } from "../observability/execution-recorder";

export interface PostToolUseContext {
  stage: WorkflowStage;
  toolName: string;
  /**
   * Registro de telemetria de §11.9/HU-35. Opcional: a ingestão da Fase 1 roda sem execução
   * persistida, e exigir recorder ali só para satisfazer o tipo criaria cerimônia sem auditoria
   * do outro lado.
   */
  recorder?: ExecutionRecorder;
  /** Início da chamada, quando o chamador já mediu — evita cronometrar duas vezes a mesma tool. */
  startedAtMs?: number;
  /** Validator pós-execução para verificar integridade do payload antes do orquestrador avançar. */
  validator?: <T>(result: ToolResult<T>) => ToolResult<T>;
}

/**
 * Segunda camada de validação (§11.2): registra telemetria e devolve o `ToolResult` processado. A
 * validação estrutural (Zod) do payload de sucesso é responsabilidade de cada serviço, podendo
 * ser reforçada pelo `validator` de pós-análise.
 *
 * Desde a Fase 8 o hook cumpre de fato o "registra telemetria" de HU-31: com um recorder, cada
 * chamada vira uma linha de `tool_executions` (HU-35) em vez de uma linha de console que ninguém
 * consulta depois. O `console.error` permanece para o caso sem recorder, porque um erro silencioso
 * em desenvolvimento é pior do que um log redundante.
 */
export function postToolUse<T>(
  result: ToolResult<T>,
  context: PostToolUseContext,
): ToolResult<T> {
  const finalResult = context.validator ? context.validator(result) : result;

  if (context.recorder) {
    void context.recorder.recordCall(
      context.toolName,
      context.startedAtMs ?? Date.now(),
      finalResult,
    );
  } else if (finalResult.isError) {
    const { code, category, description, userMessage, metadata } = finalResult.error;
    let detailStr = "";
    if (metadata && Object.keys(metadata).length > 0) {
      detailStr = `\n  Metadata: ${JSON.stringify(metadata, null, 2)}`;
    }
    console.error(
      `[postToolUse] ❌ ${context.stage}/${context.toolName} failed!\n` +
      `  Code: ${code} (${category})\n` +
      `  Description: ${description}` +
      (userMessage ? `\n  UserMessage: ${userMessage}` : "") +
      detailStr,
    );
  }

  return finalResult;
}
