import { createHash } from "node:crypto";
import { toolSuccess, type ToolResult } from "../errors/tool-result";
import type { JurisprudenceQuery, JurisprudenceSearchResult, RawDecision } from "../schemas/search.schema";
import type { JurisprudenceDecisionRecord } from "../schemas/persistence.schema";
import type { DataVeniaRepository } from "../persistence/repository";
import type { JurisprudenceProvider } from "./jurisprudence-provider";

/**
 * Provider com cache de decisão bruta, mais o provider original exposto como `fresh`.
 *
 * `fresh` não é conveniência: é a peça que evita transformar a verificação de evidências numa
 * tautologia. Ver o comentário de `createCachedJurisprudenceProvider`.
 */
export interface CachedJurisprudenceProvider extends JurisprudenceProvider {
  readonly fresh: JurisprudenceProvider;
}

function toRecord(provider: string, decision: RawDecision): JurisprudenceDecisionRecord {
  const text = decision.fullText ?? decision.summary ?? "";

  return {
    provider,
    sourceId: decision.id,
    processNumber: decision.processNumber,
    url: decision.sourceUrl,
    court: decision.court,
    chamber: decision.judgingBody,
    judge: decision.rapporteur,
    judgmentDate: decision.judgmentDate,
    rawText: decision.fullText,
    sourceHash: createHash("sha256").update(Buffer.from(text, "utf-8")).digest("hex"),
    fetchedAt: new Date().toISOString(),
  };
}

function toDecision(record: JurisprudenceDecisionRecord): RawDecision {
  return {
    id: record.sourceId,
    processNumber: record.processNumber,
    court: record.court ?? "TJPR",
    judgingBody: record.chamber,
    rapporteur: record.judge,
    judgmentDate: record.judgmentDate,
    fullText: record.rawText,
    sourceUrl: record.url,
  };
}

/**
 * Cache de decisão bruta de §11.8/HU-33: "se `sourceId` + `sourceHash` já existem em
 * `jurisprudence_decisions`, não é preciso buscar de novo na fonte". Evita rebuscar o mesmo acórdão
 * a cada execução — é jurisprudência pública e imutável na esmagadora maioria dos casos.
 *
 * **Onde este provider NÃO pode ser usado: Evidence Verification (HU-24).** Aquela etapa reabre a
 * decisão justamente para recomputar o hash e comparar com o `sourceHash` gravado no Scratchpad;
 * servi-la pelo cache compararia o cache com ele mesmo, daria sempre "igual", e a detecção de
 * "fonte mudou desde a coleta" nunca dispararia — o oposto exato do que a HU exige. Por isso
 * `verifyEvidence` recebe `provider.fresh`, e por isso `fresh` existe com nome próprio em vez de
 * ser só um comentário pedindo cuidado.
 *
 * `search` nunca é cacheada: o conjunto de resultados muda conforme o acervo cresce, e um cache de
 * busca devolveria uma amostra desatualizada como se fosse o estado atual do tribunal.
 */
export function createCachedJurisprudenceProvider(
  inner: JurisprudenceProvider,
  repository: DataVeniaRepository,
): CachedJurisprudenceProvider {
  return {
    name: `cached:${inner.name}`,
    fresh: inner,

    search(query: JurisprudenceQuery): Promise<ToolResult<JurisprudenceSearchResult>> {
      return inner.search(query);
    },

    async fetchDecision(decisionId: string): Promise<ToolResult<RawDecision>> {
      const cached = await repository.findDecision(inner.name, decisionId);
      if (!cached.isError && cached.data) {
        return toolSuccess(toDecision(cached.data), { source: "cache" });
      }

      const fetched = await inner.fetchDecision(decisionId);
      if (fetched.isError) return fetched;

      // Falha ao gravar o cache não invalida a busca que já deu certo: perder economia futura é
      // aceitável, perder a decisão recém-buscada não é.
      await repository.saveDecision(toRecord(inner.name, fetched.data));

      return fetched;
    },
  };
}
