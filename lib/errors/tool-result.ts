import type { AppError } from "./app-error";

export interface ToolResultMetadata {
  durationMs?: number;
  attempts?: number;
  source?: string;
  traceId?: string;
  /**
   * Endereço efetivamente consultado na fonte externa. Só faz sentido em provider que fala HTTP, e
   * existe para o modo auditoria (§14): sem a URL exata, conferir um resultado contra o portal
   * oficial vira reconstruir à mão a query que o código montou.
   */
  url?: string;
  /** Quantas páginas a fonte externa entregou nesta chamada (busca paginada). */
  pagesFetched?: number;
  /**
   * Reparos sintáticos aplicados à saída bruta do modelo antes da validação (§11.7). Existe para
   * que tolerar uma degradação de forma nunca seja silencioso: reparo recorrente é sinal de que o
   * prompt ou o modelo precisa mudar, não ruído a absorver.
   */
  repairs?: string[];
}

export interface ToolSuccess<T> {
  isError: false;
  data: T;
  metadata?: ToolResultMetadata;
}

export interface ToolFailure {
  isError: true;
  error: AppError;
}

export type ToolResult<T> = ToolSuccess<T> | ToolFailure;

export function toolSuccess<T>(
  data: T,
  metadata?: ToolResultMetadata,
): ToolSuccess<T> {
  return { isError: false, data, metadata };
}

export function toolFailure(error: AppError): ToolFailure {
  return { isError: true, error };
}
