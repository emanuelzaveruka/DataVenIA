import type { ToolResult } from "../errors/tool-result";
import type { GenerateStructuredParams, LlmProvider } from "./provider";

/**
 * Uma chamada de modelo, exatamente como ela saiu daqui. `system` e `prompt` são o texto literal
 * enviado — inclusive o bloco de correção que `generateStructuredWithRetry` anexa quando a
 * tentativa anterior falhou na validação (§11.7/HU-20), que é justamente o que torna o ciclo de
 * retry legível para quem audita.
 */
export interface LlmCallRecord {
  /** Sequencial dentro da execução: é o que ordena as tentativas de uma mesma etapa. */
  callIndex: number;
  schemaName: string;
  provider: string;
  /** Modelo declarado pelo provider; `respondedBy` diz quem de fato respondeu. */
  model: string;
  /** `metadata.source` do resultado — denuncia resposta servida pelo modelo reserva (HU-14). */
  respondedBy?: string;
  system: string;
  prompt: string;
  maxOutputTokens?: number;
  durationMs: number;
  outcome: "OK" | "ERROR";
  errorCode?: string;
  errorDescription?: string;
  output?: unknown;
}

export type LlmCallSink = (record: LlmCallRecord) => void;

/**
 * Decorator de auditoria sobre um `LlmProvider` (§15). Existe como decorator, e não como
 * instrumentação dentro de cada serviço, porque `case-analysis`, `query-generation`, `scratchpad` e
 * `cross-file` só conhecem a interface — capturar prompt e modelo aqui cobre os quatro de uma vez e
 * mantém a regra de que nenhum serviço sabe quem está do outro lado.
 *
 * Compõe-se **por fora** de `createResilientLlmProvider`: assim o registro enxerga o `metadata.source`
 * da resposta e sabe dizer qual dos dois modelos respondeu, em vez de repetir o nome do primário.
 *
 * O `ToolResult` devolvido é o mesmo objeto do provider embrulhado — auditar nunca altera o que o
 * pipeline recebe, e falha do sink nunca vira falha da chamada (mesma postura do
 * `ExecutionRecorder`: perder observabilidade é ruim, derrubar a análise por causa disso é pior).
 */
export function createAuditedLlmProvider(inner: LlmProvider, sink: LlmCallSink): LlmProvider {
  let callIndex = 0;

  return {
    name: inner.name,
    model: inner.model,

    async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<ToolResult<T>> {
      const index = ++callIndex;
      const startedAtMs = Date.now();
      const result = await inner.generateStructured(params);

      try {
        sink({
          callIndex: index,
          schemaName: params.schemaName,
          provider: inner.name,
          model: inner.model,
          respondedBy: result.isError ? undefined : result.metadata?.source,
          system: params.system,
          prompt: params.prompt,
          maxOutputTokens: params.maxOutputTokens,
          durationMs: Date.now() - startedAtMs,
          outcome: result.isError ? "ERROR" : "OK",
          errorCode: result.isError ? result.error.code : undefined,
          errorDescription: result.isError ? result.error.description : undefined,
          output: result.isError ? undefined : result.data,
        });
      } catch (cause) {
        console.warn(`[audit] falha ao registrar chamada de ${params.schemaName}: ${String(cause)}`);
      }

      return result;
    },
  };
}
