import { z } from "zod";
import { createAppError } from "../../errors/app-error";
import { isRetryable } from "../../errors/error-classifier";
import { toolFailure, type ToolResult } from "../../errors/tool-result";
import type { GenerateStructuredParams, LlmProvider } from "../provider";
import { abortAwareError, callSignal } from "./call-signal";
import { parseStructuredOutput } from "../validate-structured-output";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
/**
 * Diferente da Chat Completions, a Messages API **exige** `max_tokens` — aqui não existe a opção de
 * omitir e deixar o modelo ir até o próprio limite. 8192 é o teto válido em qualquer modelo Claude
 * atual, inclusive os menores, e por isso é o default seguro; quem precisar de mais passa
 * `maxOutputTokens` explicitamente, como faz a análise cruzada (§3.8). É exigência da API, não uma
 * escolha do pipeline.
 */
const REQUIRED_MAX_TOKENS_FALLBACK = 8192;

export interface AnthropicProviderConfig {
  apiKey: string;
  model?: string;
}

interface AnthropicToolUseBlock {
  type: "tool_use";
  input: unknown;
}

interface AnthropicContentBlock {
  type: string;
  input?: unknown;
}

interface AnthropicMessagesResponse {
  content: AnthropicContentBlock[];
}

function isToolUseBlock(block: AnthropicContentBlock): block is AnthropicToolUseBlock {
  return block.type === "tool_use";
}

/**
 * Adaptador fino sobre a Messages API da Anthropic via fetch puro (sem SDK — §15). Usa
 * tool_choice forçado para obter saída estruturada; a validação Zod acontece sempre em
 * parseStructuredOutput, igual para qualquer provider.
 */
export function createAnthropicProvider(config: AnthropicProviderConfig): LlmProvider {
  const model = config.model ?? DEFAULT_MODEL;

  return {
    name: "anthropic",
    model,
    async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<ToolResult<T>> {
      const jsonSchema = z.toJSONSchema(params.schema, { target: "draft-7" });

      let response: Response;
      try {
        response = await fetch(ANTHROPIC_API_URL, {
          method: "POST",
          signal: callSignal(params.signal),
          headers: {
            "content-type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model,
            max_tokens: params.maxOutputTokens ?? REQUIRED_MAX_TOKENS_FALLBACK,
            system: params.system,
            messages: [{ role: "user", content: params.prompt }],
            tools: [
              {
                name: params.schemaName,
                description: params.schemaDescription ?? `Estrutura de saída para ${params.schemaName}.`,
                input_schema: jsonSchema,
              },
            ],
            tool_choice: { type: "tool", name: params.schemaName },
          }),
        });
      } catch (err) {
        return toolFailure(abortAwareError("anthropic", params.signal, err));
      }

      if (!response.ok) {
        const category = response.status === 429 ? "RATE_LIMIT" : "UPSTREAM";
        return toolFailure(
          createAppError({
            code: `ANTHROPIC_HTTP_${response.status}`,
            category,
            severity: "ERROR",
            description: `Anthropic API returned HTTP ${response.status}`,
            isRetryable: isRetryable({ category, httpStatus: response.status }),
            source: "anthropic",
            operation: "generateStructured",
            metadata: { status: response.status },
          }),
        );
      }

      const body = (await response.json()) as AnthropicMessagesResponse;
      const toolUseBlock = body.content?.find(isToolUseBlock);

      if (!toolUseBlock) {
        return toolFailure(
          createAppError({
            code: "STRUCTURED_OUTPUT_MISSING",
            category: "STRUCTURED_OUTPUT",
            severity: "ERROR",
            description: "Anthropic response did not include the expected tool_use block",
            isRetryable: true,
            source: "anthropic",
            operation: "generateStructured",
          }),
        );
      }

      return parseStructuredOutput(params.schema, params.schemaName, toolUseBlock.input, "anthropic");
    },
  };
}
