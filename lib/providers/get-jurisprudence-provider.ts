import type { JurisprudenceProvider } from "./jurisprudence-provider";
import { createFixtureProvider } from "./fixture";

/**
 * Único ponto de seleção de provider de jurisprudência (§5 — mirror de
 * `lib/llm/get-llm-provider.ts`). `TjprProvider` real (`lib/providers/tjpr.ts`) ainda não existe:
 * a validação manual do portal exigida por HU-38 está pendente
 * (`docs/tjpr-portal-validacao.md`), e HU-12 proíbe codificar a integração real antes disso.
 * Enquanto isso o produto roda sempre em `FixtureProvider` (HU-37).
 *
 * Quando `tjpr.ts` existir (Fase 9), a composição esperada aqui passa a ser:
 *   createResilientJurisprudenceProvider(createTjprProvider(), createFixtureProvider(), createCircuitBreaker())
 */
export function getJurisprudenceProvider(): JurisprudenceProvider {
  return createFixtureProvider();
}
