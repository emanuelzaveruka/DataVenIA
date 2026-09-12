export type ErrorCategory =
  | "VALIDATION"
  | "NETWORK"
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "UPSTREAM"
  | "PARSING"
  | "STRUCTURED_OUTPUT"
  | "NOT_FOUND"
  | "AUTH"
  | "BUSINESS_RULE"
  | "INTERNAL";

export type ErrorSeverity = "INFO" | "WARNING" | "ERROR" | "FATAL";

export interface AppError {
  isError: true;
  code: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  description: string;
  userMessage?: string;
  isRetryable: boolean;
  retryAfterMs?: number;
  source?: string;
  operation?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export function createAppError(
  params: Omit<AppError, "isError" | "timestamp"> & { timestamp?: string },
): AppError {
  return {
    isError: true,
    timestamp: params.timestamp ?? new Date().toISOString(),
    ...params,
  };
}
