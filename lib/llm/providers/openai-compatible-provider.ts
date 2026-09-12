import { z } from "zod";
import { createAppError } from "../../errors/app-error";
import { isRetryable } from "../../errors/error-classifier";
import { toolFailure, type ToolResult } from "../../errors/tool-result";
import type { GenerateStructuredParams, LlmProvider } from "../provider";
import { parseStructuredOutput } from "../validate-structured-output";

/**
 * Núcleo compartilhado dos providers que falam o protocolo Chat Completions da OpenAI — hoje a
 * própria OpenAI e o DeepSeek, que expõe a mesma API em outro host. Fica parametrizado em vez de
 * duplicado porque é literalmente o mesmo formato de requisição e resposta: duplicar significaria
 * corrigir bug de parsing duas vezes.
 *
 * Usa `json_object` (não `json_schema` estrito): o modo strict exige todo campo `required` e não
 * representa bem optionals do Zod. O schema vai embutido no prompt como referência e a validação
 * real acontece sempre em `parseStructuredOutput` (§11.7) — o contrato nunca depende do provider.
 */
export interface OpenAiCompatibleProviderConfig {
  /** Identidade do provider em `AppError.source`, `ToolResult.metadata` e na chave de cache de HU-33. */
  name: string;
  apiUrl: string;
  apiKey: string;
  model: string;
}

interface ChatCompletionResponse {
  choices: { message: { content: string | null } }[];
}

export function createOpenAiCompatibleProvider(config: OpenAiCompatibleProviderConfig): LlmProvider {
  const { name, apiUrl, apiKey, model } = config;
  const errorPrefix = name.toUpperCase();

  return {
    name,
    model,
    async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<ToolResult<T>> {
      const jsonSchema = z.toJSONSchema(params.schema, { target: "draft-7" });
      const systemWithSchema = `${params.system}

Responda APENAS com um objeto JSON válido que corresponda exatamente a este JSON Schema (nome: ${params.schemaName}):
${JSON.stringify(jsonSchema)}`;

      let response: Response;
      try {
        response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            max_tokens: params.maxOutputTokens ?? 4096,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemWithSchema },
              { role: "user", content: params.prompt },
            ],
          }),
        });
      } catch (err) {
        return toolFailure(
          createAppError({
            code: "LLM_NETWORK_ERROR",
            category: "NETWORK",
            severity: "ERROR",
            description: `Failed to reach ${name} API: ${(err as Error).message}`,
            isRetryable: true,
            source: name,
            operation: "generateStructured",
          }),
        );
      }

      if (!response.ok) {
        const category = response.status === 429 ? "RATE_LIMIT" : "UPSTREAM";
        return toolFailure(
          createAppError({
            code: `${errorPrefix}_HTTP_${response.status}`,
            category,
            severity: "ERROR",
            description: `${name} API returned HTTP ${response.status}`,
            isRetryable: isRetryable({ category, httpStatus: response.status }),
            source: name,
            operation: "generateStructured",
            metadata: { status: response.status },
          }),
        );
      }

      const body = (await response.json()) as ChatCompletionResponse;
      const content = body.choices?.[0]?.message?.content;

      if (!content) {
        return toolFailure(
          createAppError({
            code: "STRUCTURED_OUTPUT_MISSING",
            category: "STRUCTURED_OUTPUT",
            severity: "ERROR",
            description: `${name} response did not include message content`,
            isRetryable: true,
            source: name,
            operation: "generateStructured",
          }),
        );
      }

      let raw: unknown;
      try {
        raw = JSON.parse(content);
      } catch (err) {
        return toolFailure(
          createAppError({
            code: "STRUCTURED_OUTPUT_NOT_JSON",
            category: "STRUCTURED_OUTPUT",
            severity: "ERROR",
            description: `${name} response content was not valid JSON: ${(err as Error).message}`,
            isRetryable: true,
            source: name,
            operation: "generateStructured",
          }),
        );
      }

      return parseStructuredOutput(params.schema, params.schemaName, raw, name);
    },
  };
}
