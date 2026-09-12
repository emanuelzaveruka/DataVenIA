import type { ToolResult } from "../errors/tool-result";
import type { ToolExecutionLog } from "../schemas/persistence.schema";

/**
 * Destino dos logs. É uma função, e não o repositório inteiro, para que registrar telemetria nunca
 * vire motivo para um serviço conhecer o storage (§11.9 + a mesma regra de injeção de §15).
 */
export type ToolExecutionSink = (log: ToolExecutionLog) => void | Promise<void>;

export interface ExecutionRecorderConfig {
  traceId: string;
  workflowId: string;
  sink?: ToolExecutionSink;
}

export interface ExecutionRecorder {
  readonly traceId: string;
  readonly workflowId: string;
  readonly logs: ToolExecutionLog[];
  /**
   * Executa a tool medindo duração e resultado. `attempt` é contado por `toolName` dentro da mesma
   * execução: é o que permite a HU-35 responder "quantas tentativas esta tool consumiu" sem
   * depender de o chamador lembrar de passar o número.
   */
  run<T>(toolName: string, operation: () => Promise<ToolResult<T>>): Promise<ToolResult<T>>;
  /**
   * Registra uma chamada já executada (o caso do `postToolUse`, que recebe o resultado pronto).
   * A identidade do log — `traceId`/`workflowId` — vem sempre do recorder, nunca de quem chama:
   * é o que garante a validação de HU-35 de `workflowId` consistente entre todas as linhas.
   */
  recordCall<T>(toolName: string, startedAtMs: number, result: ToolResult<T>): Promise<void>;
  record(log: ToolExecutionLog): Promise<void>;
}

/**
 * Registro de execução de tools (§11.9/HU-35). O `workflowId` é fixo por recorder e o `traceId`
 * acompanha todas as linhas, que é exatamente a validação da HU: todo `traceId` rastreável de
 * ponta a ponta, com `workflowId` consistente entre logs.
 *
 * O recorder **nunca** deixa a telemetria derrubar o pipeline: falha ao gravar log vira aviso, não
 * erro de negócio — perder observabilidade é ruim, perder a análise do usuário por causa disso é
 * pior.
 */
export function createExecutionRecorder(config: ExecutionRecorderConfig): ExecutionRecorder {
  const logs: ToolExecutionLog[] = [];
  const attempts = new Map<string, number>();

  async function emit(log: ToolExecutionLog): Promise<void> {
    logs.push(log);
    if (!config.sink) return;

    try {
      await config.sink(log);
    } catch (cause) {
      console.warn(
        `[observability] falha ao persistir ToolExecutionLog de ${log.toolName}: ${String(cause)}`,
      );
    }
  }

  function nextAttempt(toolName: string): number {
    const attempt = (attempts.get(toolName) ?? 0) + 1;
    attempts.set(toolName, attempt);
    return attempt;
  }

  function toLog<T>(
    toolName: string,
    startedAtMs: number,
    result: ToolResult<T>,
  ): ToolExecutionLog {
    return {
      traceId: config.traceId,
      workflowId: config.workflowId,
      toolName,
      attempt: nextAttempt(toolName),
      startedAt: new Date(startedAtMs).toISOString(),
      durationMs: Date.now() - startedAtMs,
      success: !result.isError,
      errorCode: result.isError ? result.error.code : undefined,
      isRetryable: result.isError ? result.error.isRetryable : undefined,
    };
  }

  return {
    traceId: config.traceId,
    workflowId: config.workflowId,
    logs,

    record: emit,

    recordCall(toolName, startedAtMs, result) {
      return emit(toLog(toolName, startedAtMs, result));
    },

    async run<T>(toolName: string, operation: () => Promise<ToolResult<T>>): Promise<ToolResult<T>> {
      const startedAtMs = Date.now();
      const result = await operation();
      await emit(toLog(toolName, startedAtMs, result));
      return result;
    },
  };
}
