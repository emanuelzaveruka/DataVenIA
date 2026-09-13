import { z } from "zod";
import { createAppError } from "../../errors/app-error";
import { isRetryable } from "../../errors/error-classifier";
import { toolFailure, type ToolResult } from "../../errors/tool-result";
import type { GenerateStructuredParams, LlmProvider } from "../provider";
import { abortAwareError, callSignal } from "./call-signal";
import { toStrictJsonSchema } from "../to-strict-json-schema";
import { parseStructuredOutput } from "../validate-structured-output";

/**
 * Núcleo compartilhado dos providers que falam o protocolo Chat Completions da OpenAI — hoje a
 * própria OpenAI e o DeepSeek, que expõe a mesma API em outro host. Fica parametrizado em vez de
 * duplicado porque é literalmente o mesmo formato de requisição e resposta: duplicar significaria
 * corrigir bug de parsing duas vezes.
 *
 * `structuredOutputMode` decide como a forma é cobrada do modelo. `json_object` garante apenas
 * "é JSON": o schema vai como texto no prompt e nada impede o modelo de degenerar `["SP-1"]` em
 * `"SP-1"`. `json_schema` impõe a forma no servidor durante a geração e elimina essa classe de
 * erro — a objeção antiga (o modo estrito exige todo campo em `required` e não representa optional
 * do Zod) é hoje trabalho de `toStrictJsonSchema`, com `normalizeModelOutput` traduzindo o `null`
 * resultante de volta para chave ausente.
 *
 * O default continua `json_object` porque o DeepSeek só suporta esse modo; quem tem o estrito o
 * pede explicitamente. Em qualquer um dos dois, a validação real acontece sempre em
 * `parseStructuredOutput` (§11.7) — o contrato nunca depende do provider, e o modo estrito garante
 * forma, não conteúdo (`minItems` e as regras de `superRefine` não viajam no JSON Schema).
 */
export interface OpenAiCompatibleProviderConfig {
  /** Identidade do provider em `AppError.source`, `ToolResult.metadata` e na chave de cache de HU-33. */
  name: string;
  apiUrl: string;
  apiKey: string;
  model: string;
  maxTokensParameter?: "max_tokens" | "max_completion_tokens";
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  /** Default `json_object`: é o único modo que o DeepSeek suporta. */
  structuredOutputMode?: "json_object" | "json_schema";
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
  const {
    name,
    apiUrl,
    apiKey,
    model,
    maxTokensParameter = "max_tokens",
    reasoningEffort,
    structuredOutputMode = "json_object",
  } = config;
  const errorPrefix = name.toUpperCase();

  return {
    name,
    model,
    async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<ToolResult<T>> {
      const jsonSchema = z.toJSONSchema(params.schema, { target: "draft-7" });
      const strict = structuredOutputMode === "json_schema";

      // No modo estrito o schema viaja no parâmetro da API e é imposto durante a geração; repeti-lo
      // no prompt só gastaria contexto. No modo json_object ele é a única referência que o modelo
      // tem da forma esperada.
      const systemWithSchema = strict
        ? params.system
        : `${params.system}

Responda APENAS com um objeto JSON válido que corresponda exatamente a este JSON Schema (nome: ${params.schemaName}):
${JSON.stringify(jsonSchema)}`;

      const responseFormat = strict
        ? {
            type: "json_schema" as const,
            json_schema: {
              name: params.schemaName,
              strict: true,
              schema: toStrictJsonSchema(jsonSchema),
            },
          }
        : { type: "json_object" as const };

      let response: Response;
      try {
        response = await fetch(apiUrl, {
          method: "POST",
          signal: callSignal(params.signal),
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            // Teto de saída só quando o chamador pede um. Omitido, vale o limite do próprio modelo:
            // a geração termina quando o modelo termina, e não quando bate numa constante de
            // provider. O `?? 4096` que ficava aqui parecia inofensivo e era o que interrompia a
            // etapa MAP no meio — em modelo de raciocínio os tokens de raciocínio saem desse mesmo
            // orçamento, então a resposta vinha truncada (`finish_reason=length`), virava
            // STRUCTURED_OUTPUT e gastava as três tentativas do retry sem chance de acerto.
            ...(params.maxOutputTokens ? { [maxTokensParameter]: params.maxOutputTokens } : {}),
            ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
            response_format: responseFormat,
            messages: [
              { role: "system", content: systemWithSchema },
              { role: "user", content: params.prompt },
            ],
          }),
        });
      } catch (err) {
        return toolFailure(abortAwareError(name, params.signal, err));
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
              // Bateu no limite de saída: com o teto do provider removido, isto significa o limite
              // do próprio modelo — informação de verdade, e não uma constante nossa no caminho.
              truncated: finishReason === "length",
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
