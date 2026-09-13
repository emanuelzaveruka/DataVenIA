import { toolFailure, type ToolResult } from "../errors/tool-result";
import type { AppError } from "../errors/app-error";
import type { WorkflowStage } from "../workflow/state-machine";
import type { ExecutionRecorder } from "../observability/execution-recorder";

/**
 * Segunda camada de validação de §11.2, na forma mais estreita que resolve o problema: recebe o
 * payload já validado pelo serviço e devolve **um erro ou nada**.
 *
 * Não recebe o `ToolResult` inteiro nem pode devolver outro payload de propósito. Um validator
 * capaz de reescrever a saída seria um ponto de mutação novo entre duas etapas — exatamente o que
 * o pipeline determinístico existe para não ter. Ele reprova ou deixa passar; corrigir dado é
 * responsabilidade de quem o produziu.
 */
export type ToolResultValidator<T> = (data: T) => AppError | undefined;

export interface PostToolUseContext<T> {
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
  /** Checagem de contrato entre etapas, aplicada só ao resultado de sucesso. */
  validator?: ToolResultValidator<T>;
}

/**
 * Segunda camada de validação (§11.2): aplica o validator, registra telemetria e devolve o
 * `ToolResult` processado. A validação estrutural (Zod) do payload é responsabilidade de cada
 * serviço; o `validator` cobre o que nenhum serviço sozinho enxerga — o contrato entre a etapa que
 * produziu o payload e a que vai consumi-lo.
 *
 * A ordem importa: o log de §11.9 sai **depois** da validação, com o veredito final. Registrar o
 * sucesso do serviço e só então reprovar o payload deixaria `tool_executions` afirmando que uma
 * etapa deu certo enquanto o pipeline parava por causa dela.
 *
 * Desde a Fase 8 o hook cumpre de fato o "registra telemetria" de HU-31: com um recorder, cada
 * chamada vira uma linha de `tool_executions` (HU-35) em vez de uma linha de console que ninguém
 * consulta depois. O `console.error` permanece para o caso sem recorder, porque um erro silencioso
 * em desenvolvimento é pior do que um log redundante.
 */
export function postToolUse<T>(
  result: ToolResult<T>,
  context: PostToolUseContext<T>,
): ToolResult<T> {
  let finalResult = result;

  if (!result.isError && context.validator) {
    const violation = context.validator(result.data);
    if (violation) finalResult = toolFailure(violation);
  }

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
