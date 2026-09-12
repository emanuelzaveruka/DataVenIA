import { z } from "zod";
import { createAppError } from "../../errors/app-error";
import { isRetryable } from "../../errors/error-classifier";
import { toolFailure, type ToolResult } from "../../errors/tool-result";
import type { GenerateStructuredParams, LlmProvider } from "../provider";
import { parseStructuredOutput } from "../validate-structured-output";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4.1";

export interface OpenAiProviderConfig {
  apiKey: string;
  model?: string;
}

interface OpenAiChatCompletionResponse {
  choices: { message: { content: string | null } }[];
}

/**
 * Adaptador fino sobre a Chat Completions API da OpenAI via fetch puro (§15). Usa modo
 * json_object (não json_schema estrito) porque o modo strict da OpenAI exige todo campo
 * `required` e não representa bem optionals do Zod — o schema vai embutido no prompt como
 * referência e a validação real acontece sempre via Zod em parseStructuredOutput.
 */
export function createOpenAiProvider(config: OpenAiProviderConfig): LlmProvider {
  const model = config.model ?? DEFAULT_MODEL;

  return {
    name: "openai",
    model,
    async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<ToolResult<T>> {
      const jsonSchema = z.toJSONSchema(params.schema, { target: "draft-7" });
      const systemWithSchema = `${params.system}

Responda APENAS com um objeto JSON válido que corresponda exatamente a este JSON Schema (nome: ${params.schemaName}):
${JSON.stringify(jsonSchema)}`;

      let response: Response;
      try {
        response = await fetch(OPENAI_API_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.apiKey}`,
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
            description: `Failed to reach OpenAI API: ${(err as Error).message}`,
            isRetryable: true,
            source: "openai",
            operation: "generateStructured",
          }),
        );
      }

      if (!response.ok) {
        const category = response.status === 429 ? "RATE_LIMIT" : "UPSTREAM";
        return toolFailure(
          createAppError({
            code: `OPENAI_HTTP_${response.status}`,
            category,
            severity: "ERROR",
            description: `OpenAI API returned HTTP ${response.status}`,
            isRetryable: isRetryable({ category, httpStatus: response.status }),
            source: "openai",
            operation: "generateStructured",
            metadata: { status: response.status },
          }),
        );
      }

      const body = (await response.json()) as OpenAiChatCompletionResponse;
      const content = body.choices?.[0]?.message?.content;

      if (!content) {
        return toolFailure(
          createAppError({
            code: "STRUCTURED_OUTPUT_MISSING",
            category: "STRUCTURED_OUTPUT",
            severity: "ERROR",
            description: "OpenAI response did not include message content",
            isRetryable: true,
            source: "openai",
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
            description: `OpenAI response content was not valid JSON: ${(err as Error).message}`,
            isRetryable: true,
            source: "openai",
            operation: "generateStructured",
          }),
        );
      }

      return parseStructuredOutput(params.schema, params.schemaName, raw, "openai");
    },
  };
}
