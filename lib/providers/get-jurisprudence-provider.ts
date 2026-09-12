import type { JurisprudenceProvider } from "./jurisprudence-provider";
import { createFixtureProvider } from "./fixture";

/**
 * Único ponto de seleção de provider de jurisprudência (§5 — mirror de
 * `lib/llm/get-llm-provider.ts`). `TjprProvider` real (`lib/providers/tjpr.ts`) ainda não existe:
 * a validação manual do portal exigida por HU-38 está pendente
 * (`docs/tjpr-portal-validacao.md`), e HU-12 proíbe codificar a integração real antes disso.
 * Enquanto isso o produto roda sempre em `FixtureProvider` (HU-37).
 *
 * Quando `tjpr.ts` existir (Fase 9), a composição esperada aqui passa a ser, de dentro para fora:
 *
 *   const source = createResilientJurisprudenceProvider(
 *     createTjprProvider(), createFixtureProvider(), createCircuitBreaker(),
 *   );
 *   return createCachedJurisprudenceProvider(source, getRepository());
 *
 * O cache (Fase 8, §11.8/HU-33) fica por fora do fallback de propósito: decisão já em cache não
 * deve nem consultar a disponibilidade da fonte. E quem chamar `verifyEvidence` tem de passar
 * `provider.fresh` — servir a decisão pelo cache faria HU-24 comparar o cache com ele mesmo
 * (ver `cached-jurisprudence-provider.ts`). Detalhes e critério de decisão da Fase 9 em
 * `docs/tjpr-portal-validacao.md`.
 */
export function getJurisprudenceProvider(): JurisprudenceProvider {
  return createFixtureProvider();
}
