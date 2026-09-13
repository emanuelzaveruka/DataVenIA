import { createInMemoryRepository } from "./in-memory-repository";
import { createSupabaseRepository } from "./supabase-repository";
import type { DataVeniaRepository } from "./repository";

/**
 * O repositório em memória vive no `globalThis`, não numa variável de módulo.
 *
 * Parece exagero e não é: o Next empacota cada rota no seu próprio grafo de módulos, então uma
 * variável de módulo dá UMA INSTÂNCIA POR ROTA. Na prática, o que `/api/documents` gravava era
 * invisível para `/api/reports/[runId]/pdf` — o download do relatório respondia "execução não
 * encontrada" para uma execução que tinha acabado de rodar. `Symbol.for` sobrevive a recarga de
 * módulo no dev e ao code-splitting em produção.
 *
 * Isso NÃO substitui persistência real: continua morrendo com o processo e continua sem valer em
 * serverless com várias instâncias. Só faz o modo em memória cumprir o que sempre prometeu — uma
 * instância por processo.
 */
const CHAVE_GLOBAL = Symbol.for("datavenia.repositorio-em-memoria");

type GlobalComRepositorio = typeof globalThis & {
  [CHAVE_GLOBAL]?: DataVeniaRepository;
};

/**
 * Único ponto de seleção de storage (mirror de `getLlmProvider` e `getJurisprudenceProvider`).
 * Com `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` presentes, usa Postgres; sem eles, cai para o
 * repositório em memória — é o que mantém o critério de aceite 16 (a aplicação funciona em modo
 * fixture, sem conectividade externa) valendo mesmo depois da Fase 8.
 *
 * A degradação é explícita, nunca silenciosa: variável pela metade (só uma das duas) é erro de
 * configuração, não motivo para escorregar para memória sem avisar.
 */
export function getRepository(env: NodeJS.ProcessEnv = process.env): DataVeniaRepository {
  const url = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if ((url && !serviceRoleKey) || (!url && serviceRoleKey)) {
    throw new Error(
      "Persistência Supabase exige SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY juntas. Defina as duas ou nenhuma (modo em memória).",
    );
  }

  if (url && serviceRoleKey) return createSupabaseRepository({ url, serviceRoleKey });

  // Stateful: uma instância por PROCESSO, senão cada chamada — e cada rota — perderia o que a
  // anterior gravou.
  const global = globalThis as GlobalComRepositorio;
  global[CHAVE_GLOBAL] ??= createInMemoryRepository();
  return global[CHAVE_GLOBAL];
}

/** Usado por testes que precisam de um processo "limpo" entre casos. */
export function resetRepositoryCache(): void {
  delete (globalThis as GlobalComRepositorio)[CHAVE_GLOBAL];
}
