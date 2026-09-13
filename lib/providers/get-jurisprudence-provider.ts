import type { JurisprudenceProvider } from "./jurisprudence-provider";
import { createCircuitBreaker } from "../errors/circuit-breaker";
import { createFixtureProvider } from "./fixture";
import { createResilientJurisprudenceProvider } from "./resilient-jurisprudence-provider";
import { createTjprProvider, paginationFromEnv } from "./tjpr";

const JURISPRUDENCE_PROVIDER_NAMES = ["fixture", "tjpr"] as const;
type JurisprudenceProviderName = (typeof JURISPRUDENCE_PROVIDER_NAMES)[number];

function isJurisprudenceProviderName(value: string): value is JurisprudenceProviderName {
  return JURISPRUDENCE_PROVIDER_NAMES.includes(value as JurisprudenceProviderName);
}

/**
 * Único ponto de seleção de provider de jurisprudência (§5 — mirror de
 * `lib/llm/get-llm-provider.ts`). A fixture continua sendo o padrão seguro para demo e testes.
 * Quando `JURISPRUDENCE_PROVIDER=tjpr`, o TJPR real é primário e degrada para fixture com
 * `metadata.source` explícito, preservando HU-12/HU-14.
 */
export function getJurisprudenceProvider(env: Partial<NodeJS.ProcessEnv> = process.env): JurisprudenceProvider {
  const configuredProvider = (env.JURISPRUDENCE_PROVIDER ?? "fixture").trim().toLowerCase();

  if (!isJurisprudenceProviderName(configuredProvider)) {
    throw new Error(
      `JURISPRUDENCE_PROVIDER inválido: ${configuredProvider}. Use um destes: ${JURISPRUDENCE_PROVIDER_NAMES.join(", ")}.`,
    );
  }

  if (configuredProvider === "tjpr") {
    return createResilientJurisprudenceProvider(
      createTjprProvider({ baseUrl: env.TJPR_BASE_URL, pagination: paginationFromEnv(env) }),
      createFixtureProvider(),
      createCircuitBreaker(),
    );
  }

  return createFixtureProvider();
}
