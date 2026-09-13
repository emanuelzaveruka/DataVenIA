/**
 * Modo auditoria (§14/HU-35): faz cada etapa do pipeline emitir o artefato que produziu, e não
 * apenas a contagem, para que uma execução possa ser conferida à mão contra a fonte oficial.
 *
 * São dois níveis, e não um booleano, por uma razão só: o texto do documento **antes** da
 * sanitização é o único artefato sensível do pipeline (HU-05/HU-06). Tudo o mais que a auditoria
 * expõe já passou pelo mascaramento. Separar os níveis permite auditar prompts, buscas, Scratchpads
 * e evidências sem que o dado pessoal bruto saia do processo junto — e deixa a decisão de expô-lo
 * explícita, nunca um efeito colateral de "ligar o debug".
 *
 * O nível `full` continua sem persistir nada: o bruto viaja no stream da requisição em curso, nunca
 * para o repositório (não existe coluna para ele) e nunca para dentro de um prompt.
 */
export const AUDIT_LEVELS = ["off", "artifacts", "full"] as const;

export type AuditLevel = (typeof AUDIT_LEVELS)[number];

function isAuditLevel(value: string): value is AuditLevel {
  return (AUDIT_LEVELS as readonly string[]).includes(value);
}

/**
 * Valor inválido é erro, nunca degradação silenciosa — mesma postura de `getRepository` e
 * `getJurisprudenceProvider`. Quem escreveu `PIPELINE_AUDIT=1` esperando artefatos precisa saber
 * que não vai recebê-los, em vez de rodar o pipeline inteiro e descobrir no fim.
 */
export function getAuditLevel(env: Partial<NodeJS.ProcessEnv> = process.env): AuditLevel {
  const configured = (env.PIPELINE_AUDIT ?? "off").trim().toLowerCase();
  if (configured === "") return "off";

  if (!isAuditLevel(configured)) {
    throw new Error(
      `PIPELINE_AUDIT inválido: ${configured}. Use um destes: ${AUDIT_LEVELS.join(", ")}.`,
    );
  }

  return configured;
}

/** Artefatos estruturados (já sanitizados) saem no stream. */
export function auditsArtifacts(level: AuditLevel): boolean {
  return level !== "off";
}

/** O texto bruto, anterior à sanitização, sai no stream. */
export function auditsRawText(level: AuditLevel): boolean {
  return level === "full";
}
