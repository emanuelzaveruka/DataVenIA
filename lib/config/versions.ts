import type { LlmProvider } from "../llm/provider";

/**
 * Versionamento do pipeline (contexto-geral.md §11.6). Estes três valores, junto com o
 * `decisionId`, compõem a chave de idempotência de HU-33 — por isso **têm** que subir sempre que
 * o resultado produzido para a mesma decisão puder mudar:
 *
 * - `PIPELINE_VERSION`: forma/ordem das etapas ou dos contratos entre elas.
 * - `SCRATCHPAD_PROMPT_VERSION`: qualquer edição em `lib/services/scratchpad/prompts.ts`.
 * - `modelVersion`: vem do provider em runtime, não é constante daqui.
 *
 * Esquecer de subir uma delas é exatamente o "reuso silencioso" que a validação de HU-33 proíbe:
 * o cache devolveria um Scratchpad gerado por outro prompt como se fosse da versão atual.
 */
export const PIPELINE_VERSION = "1.0.0";

/**
 * 1.1.0 — o prompt deixou de pedir o `id` de cada `evidenceCandidate` (agora atribuído em código,
 * `lib/schemas/scratchpad.schema.ts`). Scratchpad em cache produzido pelo prompt anterior carrega
 * id no formato antigo, então não pode ser servido como se fosse desta versão.
 */
export const SCRATCHPAD_PROMPT_VERSION = "1.1.0";

export interface PipelineVersions {
  pipelineVersion: string;
  promptVersion: string;
  modelVersion: string;
}

/**
 * Versões vigentes para a geração de Scratchpads. Recebe o provider porque `modelVersion` é
 * propriedade de quem vai responder — trocar de `claude-sonnet` para `gpt-4.1` muda o resultado
 * tanto quanto trocar o prompt, e a chave precisa refletir isso.
 */
export function scratchpadVersions(provider: LlmProvider): PipelineVersions {
  return {
    pipelineVersion: PIPELINE_VERSION,
    promptVersion: SCRATCHPAD_PROMPT_VERSION,
    modelVersion: provider.model,
  };
}
