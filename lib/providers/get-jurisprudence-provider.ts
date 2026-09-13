import type { JurisprudenceProvider } from "./jurisprudence-provider";
import { createCircuitBreaker } from "../errors/circuit-breaker";
import { createFixtureProvider } from "./fixture";
import { createResilientJurisprudenceProvider } from "./resilient-jurisprudence-provider";
import { createTjprProvider, paginationFromEnv } from "./tjpr";

const JURISPRUDENCE_PROVIDER_NAMES = ["fixture", "tjpr", "tjpr+fixture"] as const;
type JurisprudenceProviderName = (typeof JURISPRUDENCE_PROVIDER_NAMES)[number];

function isJurisprudenceProviderName(value: string): value is JurisprudenceProviderName {
  return JURISPRUDENCE_PROVIDER_NAMES.includes(value as JurisprudenceProviderName);
}

/**
 * Único ponto de seleção de provider de jurisprudência (§5 — mirror de
 * `lib/llm/get-llm-provider.ts`). São três modos, e a diferença entre os dois últimos é a razão de
 * este arquivo existir:
 *
 * - `fixture` (padrão): demo e testes sem rede, critério de aceite 16. Tudo que sai daqui é
 *   fictício, e o relatório precisa dizer isso — a fixture não usa o domínio oficial.
 * - `tjpr`: **só o portal real.** Falha do TJPR é falha da execução, não motivo para inventar
 *   jurisprudência.
 * - `tjpr+fixture`: a composição de HU-12/HU-14 (degradar para fixture com `metadata.source`
 *   explícito), disponível para demonstrar o mecanismo — nunca por padrão.
 *
 * `tjpr` deixou de degradar para fixture por decisão de produto, contra a letra de HU-12. O motivo
 * é concreto: `createFixtureProvider().search` nunca devolve vazio (cai no catálogo completo quando
 * nenhum termo bate), então uma falha do portal não produzia um resultado pobre — produzia um
 * relatório inteiro, coerente e plausível, sobre 9 acórdãos fictícios, distinguível de uma execução
 * real apenas por uma string no rodapé. E a contaminação era progressiva: `fetchDecision` do TJPR só
 * conhece as URLs que a própria busca coletou, então depois de uma busca degradada todas as demais
 * etapas caíam na fixture junto. Degradar disponibilidade é aceitável; fabricar fonte, não.
 */
export function getJurisprudenceProvider(env: Partial<NodeJS.ProcessEnv> = process.env): JurisprudenceProvider {
  const configuredProvider = (env.JURISPRUDENCE_PROVIDER ?? "fixture").trim().toLowerCase();

  if (!isJurisprudenceProviderName(configuredProvider)) {
    throw new Error(
      `JURISPRUDENCE_PROVIDER inválido: ${configuredProvider}. Use um destes: ${JURISPRUDENCE_PROVIDER_NAMES.join(", ")}.`,
    );
  }

  if (configuredProvider === "fixture") {
    return createFixtureProvider();
  }

  const tjpr = createTjprProvider({
    baseUrl: env.TJPR_BASE_URL,
    pagination: paginationFromEnv(env),
    tipoDecisao: env.TJPR_TIPO_DECISAO?.trim() || undefined,
    ambito: env.TJPR_AMBITO?.trim() || undefined,
    idLocalPesquisa: env.TJPR_ID_LOCAL_PESQUISA?.trim() || undefined,
  });
  if (configuredProvider === "tjpr") {
    return tjpr;
  }

  return createResilientJurisprudenceProvider(tjpr, createFixtureProvider(), createCircuitBreaker());
}
