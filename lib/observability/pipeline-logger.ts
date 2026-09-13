import { logsCalls, logsStages, type LogLevel } from "../config/logging";
import type { LlmCallRecord } from "../llm/audited-llm-provider";

/**
 * O log de terminal de uma execução (§14/HU-35). Existe porque o pipeline tem etapas de minutos —
 * a geração de Scratchpads são `SCRATCHPAD_LIMIT` chamadas de modelo em ondas de
 * `SCRATCHPAD_CONCURRENCY` — e, até aqui, entre o evento `RUNNING` e o `COMPLETED` de um nó não
 * saía nada em lugar nenhum: uma execução lenta e uma execução travada eram indistinguíveis para
 * quem estava olhando.
 *
 * Não é um segundo canal de verdade: tudo que ele imprime vem dos mesmos eventos que o stream já
 * carrega (`run-pipeline.ts`), formatado para leitura em terminal. Por isso o logger não sabe nada
 * sobre o pipeline — recebe evento formado e escreve.
 *
 * Falha do logger nunca derruba a execução, mesma postura de `execution-recorder.ts` e
 * `audited-llm-provider.ts`: perder observabilidade é ruim, perder a análise do usuário é pior.
 */
export interface PipelineLogger {
  readonly level: LogLevel;
  /** `true` quando vale a pena compor o decorator de auditoria só para alimentar o log. */
  readonly logsCalls: boolean;
  runStarted(traceId: string): void;
  stageStarted(nodeName: string, input?: unknown): void;
  stageProgress(nodeName: string, output?: unknown): void;
  stageFinished(nodeName: string, ok: boolean, durationMs: number, output?: unknown, errorCode?: string): void;
  llmCall(record: LlmCallRecord): void;
  runFailed(code: string, description?: string): void;
  runFinished(durationMs: number): void;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes}m${String(Math.round((ms % 60_000) / 1000)).padStart(2, "0")}s`;
}

/**
 * Resumo de uma linha do `output` de um nó. Só escalares curtos: no modo auditoria o mesmo campo
 * carrega o artefato inteiro da etapa, e despejá-lo aqui apagaria a execução na rolagem do
 * terminal — para o conteúdo existe `PIPELINE_AUDIT` e `watch-run --out`.
 */
function compact(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return Object.entries(value as Record<string, unknown>)
    .filter(([, item]) =>
      typeof item === "number" ||
      typeof item === "boolean" ||
      (typeof item === "string" && item.length > 0 && item.length <= 80))
    .map(([key, item]) => `${key}=${item}`)
    .join(" ");
}

export interface PipelineLoggerConfig {
  runId: string;
  level: LogLevel;
  /** Injetável para teste; sem isto seria preciso espionar o console global. */
  write?: (line: string) => void;
}

export function createPipelineLogger(config: PipelineLoggerConfig): PipelineLogger {
  const { runId, level } = config;
  const write = config.write ?? ((line: string) => console.log(line));
  const stages = logsStages(level);
  const calls = logsCalls(level);
  const prefix = `[run ${runId.slice(0, 8)}]`;

  const line = (text: string): void => {
    try {
      write(`${prefix} ${text}`);
    } catch {
      // Escrever no terminal é o único efeito desta classe; se falhar, não há o que salvar.
    }
  };

  const withDetail = (text: string, detail?: unknown): string => {
    const summary = compact(detail);
    return summary ? `${text} · ${summary}` : text;
  };

  return {
    level,
    logsCalls: calls,

    runStarted(traceId) {
      if (stages) line(`▶ execução iniciada · trace ${traceId.slice(0, 8)} · log=${level}`);
    },

    stageStarted(nodeName, input) {
      if (stages) line(withDetail(`▶ ${nodeName}`, input));
    },

    stageProgress(nodeName, output) {
      if (stages) line(withDetail(`⏳ ${nodeName}`, output));
    },

    stageFinished(nodeName, ok, durationMs, output, errorCode) {
      if (!stages) return;
      const status = ok ? "✔" : `✖ ${errorCode ?? "FALHOU"}`;
      line(withDetail(`${status} ${nodeName} (${formatDuration(durationMs)})`, output));
    },

    llmCall(record) {
      if (!calls) return;
      const outcome = record.outcome === "OK" ? "✔" : `✖ ${record.errorCode ?? "ERRO"}`;
      line(
        `  ↳ ${outcome} ${record.schemaName} · chamada ${record.callIndex} · ${record.respondedBy ?? record.model} · ${formatDuration(record.durationMs)}${
          record.errorDescription ? ` · ${record.errorDescription.slice(0, 160)}` : ""
        }`,
      );
    },

    runFailed(code, description) {
      if (stages) line(`✖ execução encerrada em erro · ${code}${description ? ` · ${description.slice(0, 200)}` : ""}`);
    },

    runFinished(durationMs) {
      if (stages) line(`✔ execução concluída em ${formatDuration(durationMs)}`);
    },
  };
}

/** Logger inerte: o default de quem chama `runPipeline` sem pedir log (testes, por exemplo). */
export const NO_PIPELINE_LOG: PipelineLogger = createPipelineLogger({
  runId: "00000000",
  level: "off",
  write: () => {},
});
