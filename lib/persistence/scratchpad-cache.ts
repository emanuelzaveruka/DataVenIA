import type { PipelineVersions } from "../config/versions";
import type { DecisionScratchpad } from "../schemas/scratchpad.schema";
import type { DecisionScratchpadRecord } from "../schemas/persistence.schema";
import { buildIdempotencyKey } from "./idempotency";
import type { DataVeniaRepository } from "./repository";

/**
 * Reaproveitamento de Scratchpad (HU-33). Fica atrás de uma interface mínima porque o serviço da
 * Fase 5 não deve conhecer repositório nem chave de idempotência — só precisa saber se já existe
 * resultado válido para aquela decisão *nesta versão do pipeline*.
 */
export interface ScratchpadCache {
  find(decisionId: string): Promise<DecisionScratchpad | undefined>;
  save(decisionId: string, scratchpad: DecisionScratchpad): Promise<void>;
}

/**
 * Ausência de cache. É o default de `generateScratchpad`, o que mantém todos os testes e o modo
 * fixture das Fases 5–7 funcionando exatamente como antes da Fase 8.
 */
export const NO_SCRATCHPAD_CACHE: ScratchpadCache = {
  async find() {
    return undefined;
  },
  async save() {
    // Sem storage, nada a fazer.
  },
};

export interface RepositoryScratchpadCacheConfig {
  repository: DataVeniaRepository;
  runId: string;
  versions: PipelineVersions;
}

/**
 * Cache sobre o repositório real. Duas regras não óbvias:
 *
 * 1. Só devolve Scratchpad com `status: "VALID"`. Reusar um PARTIAL/FAILED economizaria uma
 *    chamada de modelo para congelar permanentemente uma análise que o MAP declarou não confiável
 *    — e o gate de HU-19 passaria a contar um resultado ruim como resultado.
 * 2. A chave inclui prompt/pipeline/modelo (`buildIdempotencyKey`), então uma versão nova
 *    simplesmente não encontra o registro antigo. É assim que a validação de HU-33 ("mudança de
 *    promptVersion ou modelVersion invalida o cache") se cumpre sem nenhuma verificação extra.
 *
 * Falha de leitura do storage nunca impede o processamento: sem cache, gera-se de novo. Perder
 * economia é aceitável; travar a análise do usuário por indisponibilidade de cache não é.
 */
export function createRepositoryScratchpadCache(
  config: RepositoryScratchpadCacheConfig,
): ScratchpadCache {
  const { repository, runId, versions } = config;

  return {
    async find(decisionId) {
      const key = buildIdempotencyKey(decisionId, versions);
      const result = await repository.findScratchpadByIdempotencyKey(key);
      if (result.isError || !result.data) return undefined;

      return result.data.status === "VALID" ? result.data.content : undefined;
    },

    async save(decisionId, scratchpad) {
      const record: DecisionScratchpadRecord = {
        scratchpadId: scratchpad.scratchpadId,
        runId,
        decisionId,
        idempotencyKey: buildIdempotencyKey(decisionId, versions),
        schemaVersion: scratchpad.schemaVersion,
        pipelineVersion: versions.pipelineVersion,
        promptVersion: versions.promptVersion,
        modelVersion: versions.modelVersion,
        content: scratchpad,
        status: scratchpad.status,
        createdAt: new Date().toISOString(),
      };

      await repository.saveScratchpad(record);
    },
  };
}
