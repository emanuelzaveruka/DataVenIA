import { createInMemoryRepository } from "./in-memory-repository";
import { createSupabaseRepository } from "./supabase-repository";
import type { JurisFlowRepository } from "./repository";

let cached: JurisFlowRepository | undefined;

/**
 * Único ponto de seleção de storage (mirror de `getLlmProvider` e `getJurisprudenceProvider`).
 * Com `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` presentes, usa Postgres; sem eles, cai para o
 * repositório em memória — é o que mantém o critério de aceite 16 (a aplicação funciona em modo
 * fixture, sem conectividade externa) valendo mesmo depois da Fase 8.
 *
 * A degradação é explícita, nunca silenciosa: variável pela metade (só uma das duas) é erro de
 * configuração, não motivo para escorregar para memória sem avisar.
 */
export function getRepository(env: NodeJS.ProcessEnv = process.env): JurisFlowRepository {
  const url = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if ((url && !serviceRoleKey) || (!url && serviceRoleKey)) {
    throw new Error(
      "Persistência Supabase exige SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY juntas. Defina as duas ou nenhuma (modo em memória).",
    );
  }

  if (url && serviceRoleKey) return createSupabaseRepository({ url, serviceRoleKey });

  // O repositório em memória é stateful: uma instância por processo, senão cada chamada perderia
  // o que a anterior gravou.
  cached ??= createInMemoryRepository();
  return cached;
}

/** Usado por testes que precisam de um processo "limpo" entre casos. */
export function resetRepositoryCache(): void {
  cached = undefined;
}
