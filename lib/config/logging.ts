/**
 * Log de execução no console do servidor (§14/HU-35), irmão de `lib/config/audit.ts` e com a mesma
 * postura: valor inválido é erro, nunca volta para `off` em silêncio.
 *
 * São canais diferentes e complementares. `PIPELINE_AUDIT` decide o que sai **no stream** da
 * requisição — é o que o navegador e `scripts/watch-run.mjs --out` consomem, e é material de
 * auditoria. `PIPELINE_LOG` decide o que sai **no terminal de quem roda o servidor**, e serve a uma
 * pergunta que o stream sozinho não respondia bem: uma etapa longa está avançando, travada ou
 * quebrando agora? Nada aqui muda o que o pipeline calcula, persiste ou devolve.
 */
export const LOG_LEVELS = ["off", "stages", "calls"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}

/**
 * Sem `PIPELINE_LOG`, o default é `stages` fora de produção e `off` em produção. É log de terminal
 * de desenvolvimento: ligado por padrão onde alguém está olhando, desligado onde ninguém está.
 */
export function getLogLevel(env: Partial<NodeJS.ProcessEnv> = process.env): LogLevel {
  const configured = (env.PIPELINE_LOG ?? "").trim().toLowerCase();
  if (configured === "") return env.NODE_ENV === "production" ? "off" : "stages";

  if (!isLogLevel(configured)) {
    throw new Error(
      `PIPELINE_LOG inválido: ${configured}. Use um destes: ${LOG_LEVELS.join(", ")}.`,
    );
  }

  return configured;
}

/** Uma linha por etapa e por item de etapa longa (a geração de Scratchpads, hoje). */
export function logsStages(level: LogLevel): boolean {
  return level !== "off";
}

/** Também uma linha por chamada de modelo, com modelo, duração e motivo da falha. */
export function logsCalls(level: LogLevel): boolean {
  return level === "calls";
}
