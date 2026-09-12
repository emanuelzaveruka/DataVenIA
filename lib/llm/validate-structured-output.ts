import type { z } from "zod";
import { createAppError } from "../errors/app-error";
import { toolFailure, toolSuccess, type ToolResult } from "../errors/tool-result";

/**
 * Validação estrutural (Zod) da saída bruta do modelo, comum a todos os providers concretos
 * (§11.7). Falha aqui vira erro STRUCTURED_OUTPUT retryable, com os pontos que falharam
 * descritos em `description`/`metadata.issues` para alimentar o retry seguinte (HU-07).
 */
export function parseStructuredOutput<T>(
  schema: z.ZodType<T>,
  schemaName: string,
  raw: unknown,
  source: string,
): ToolResult<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}`,
    );
    return toolFailure(
      createAppError({
        code: "STRUCTURED_OUTPUT_INVALID",
        category: "STRUCTURED_OUTPUT",
        severity: "ERROR",
        description: `Model output for schema "${schemaName}" failed validation: ${issues.join("; ")}`,
        isRetryable: true,
        source,
        operation: "generateStructured",
        metadata: { schemaName, issues },
      }),
    );
  }
  return toolSuccess(result.data);
}
