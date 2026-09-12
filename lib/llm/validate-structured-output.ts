import type { z } from "zod";
import { createAppError } from "../errors/app-error";
import { toolFailure, toolSuccess, type ToolResult } from "../errors/tool-result";
import { normalizeModelOutput, type ModelOutputRepair } from "./normalize-model-output";

function describe(repair: ModelOutputRepair): string {
  return `${repair.path} [${repair.kind}]: ${repair.detail}`;
}

/**
 * Validação estrutural (Zod) da saída bruta do modelo, comum a todos os providers concretos
 * (§11.7). Falha aqui vira erro STRUCTURED_OUTPUT retryable, com os pontos que falharam
 * descritos em `description`/`metadata.issues` para alimentar o retry seguinte (HU-07).
 *
 * Antes da validação roda `normalizeModelOutput`, que corrige **só** degradação sintática sem
 * perda (escalar onde se espera array, `null` em campo opcional). A separação é deliberada: forma
 * malformada é ruído do provider e não deve consumir uma das três tentativas, enquanto conteúdo
 * inválido — ID inexistente, afirmação sem citação, contraditório omitido — continua reprovando e
 * voltando ao modelo com o erro como contexto. Nenhum reparo é silencioso: eles saem em
 * `metadata.repairs` e em `console.warn`, porque um reparo recorrente é sinal de que o prompt ou o
 * modelo precisa mudar, não algo a absorver.
 */
export function parseStructuredOutput<T>(
  schema: z.ZodType<T>,
  schemaName: string,
  raw: unknown,
  source: string,
): ToolResult<T> {
  const { value, repairs } = normalizeModelOutput(schema as z.ZodType<unknown>, raw);
  const repairDescriptions = repairs.map(describe);

  if (repairs.length > 0) {
    console.warn(
      `[llm] saída de "${schemaName}" (${source}) precisou de ${repairs.length} reparo(s) de forma: ${repairDescriptions.join("; ")}`,
    );
  }

  const result = schema.safeParse(value);
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
        metadata: { schemaName, issues, repairs: repairDescriptions },
      }),
    );
  }

  return toolSuccess(result.data, {
    source,
    repairs: repairDescriptions.length > 0 ? repairDescriptions : undefined,
  });
}
