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
  maxTokensParameter?: "max_tokens" | "max_completion_tokens";
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
}

interface ChatCompletionResponse {
  choices: {
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      refusal?: string | null;
    };
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
      accepted_prediction_tokens?: number;
      rejected_prediction_tokens?: number;
    };
  };
}

export function createOpenAiCompatibleProvider(config: OpenAiCompatibleProviderConfig): LlmProvider {
  const { name, apiUrl, apiKey, model, maxTokensParameter = "max_tokens", reasoningEffort } = config;
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
            [maxTokensParameter]: params.maxOutputTokens ?? 4096,
            ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
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
        const body = await response.text().catch(() => "");
        return toolFailure(
          createAppError({
            code: `${errorPrefix}_HTTP_${response.status}`,
            category,
            severity: "ERROR",
            description: `${name} API returned HTTP ${response.status}${body ? `: ${body.slice(0, 500)}` : ""}`,
            isRetryable: isRetryable({ category, httpStatus: response.status }),
            source: name,
            operation: "generateStructured",
            metadata: { status: response.status, body: body.slice(0, 500) },
          }),
        );
      }

      const body = (await response.json()) as ChatCompletionResponse;
      const choice = body.choices?.[0];
      const content = choice?.message?.content;

      if (!content) {
        const finishReason = choice?.finish_reason ?? "unknown";
        const refusal = choice?.message?.refusal;
        const reasoningTokens = body.usage?.completion_tokens_details?.reasoning_tokens;
        return toolFailure(
          createAppError({
            code: "STRUCTURED_OUTPUT_MISSING",
            category: "STRUCTURED_OUTPUT",
            severity: "ERROR",
            description: `${name} response did not include message content (finish_reason=${finishReason}${
              typeof reasoningTokens === "number" ? `, reasoning_tokens=${reasoningTokens}` : ""
            }${refusal ? ", refusal=true" : ""})`,
            isRetryable: true,
            source: name,
            operation: "generateStructured",
            metadata: {
              finishReason,
              refusal: refusal ? refusal.slice(0, 500) : undefined,
              usage: body.usage,
            },
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
