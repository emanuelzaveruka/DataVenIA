/**
 * Conversão de nomes entre o contrato TS (`camelCase`) e as colunas Postgres (`snake_case`).
 *
 * A conversão é deliberadamente **rasa**: só as chaves de primeiro nível viram coluna. Os valores
 * passam intactos, porque campos como `content`, `query`, `items` e `redactions` são JSONB com o
 * objeto de domínio dentro — converter as chaves lá dentro corromperia o payload que os schemas de
 * §3.x validam (`legalIssueId` viraria `legal_issue_id` e o Zod rejeitaria na volta).
 */
export function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function toCamelCase(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase());
}

export function toRow(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [toSnakeCase(key), value]),
  );
}

export function fromRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([, value]) => value !== null)
      .map(([key, value]) => [toCamelCase(key), value]),
  );
}
