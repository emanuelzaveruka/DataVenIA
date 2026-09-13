import { z } from "zod";
import { SearchQuerySchema } from "./query-generation.schema";
import { JurisprudenceQueryFiltersSchema } from "./search.schema";

/**
 * Plano de busca aprovado pelo usuário (§2.1 Structured First).
 *
 * O pipeline gera as queries a partir da peça (HU-11), mas quem conhece o caso é o advogado — este
 * schema é o contrato do checkpoint humano entre `QUERY_GENERATION` e `SEARCH`: o usuário remove
 * termo que não serve, acrescenta o que o modelo não viu, define Câmara e período, e só então a
 * busca roda.
 *
 * Ele chega pela rede, então é validado como qualquer entrada externa — não é porque o front
 * montou que é confiável (mesma postura de §11.7 para leitura de banco).
 */

/**
 * A regra de HU-11 que o usuário NÃO pode desligar.
 *
 * `generateSearchQueries` é obrigado a produzir ao menos uma query `CONTRARY`, e isso não é
 * capricho de schema: é o que alimenta `opposingPrecedentsFound` (HU-22) e impede que o relatório
 * saia de um lado só. Se o usuário pudesse apagar todos os contrários, ele montaria — sem querer —
 * exatamente a pesquisa enviesada que o produto existe para não produzir, e o relatório ainda
 * afirmaria "nenhum precedente contrário identificado na amostra", que passaria a ser mentira
 * sobre a busca em vez de fato sobre o acervo.
 *
 * Por isso a restrição vive aqui, no contrato, e não num aviso de UI: o front explica, o schema
 * garante.
 */
export const SearchPlanSchema = z
  .object({
    queries: z.array(SearchQuerySchema).min(1, "O plano precisa de ao menos uma pesquisa."),
    filters: JurisprudenceQueryFiltersSchema.optional(),
  })
  .superRefine((plan, ctx) => {
    if (!plan.queries.some((searchQuery) => searchQuery.intent === "CONTRARY")) {
      ctx.addIssue({
        code: "custom",
        path: ["queries"],
        message:
          "O plano precisa manter ao menos uma pesquisa por jurisprudência contrária (HU-11). Sem ela o relatório sairia de um lado só.",
      });
    }
  });

export type SearchPlan = z.infer<typeof SearchPlanSchema>;

/**
 * O que o front recebe quando o pipeline pausa. `legalIssues` acompanha as queries porque cada
 * query referencia uma questão jurídica por `legalIssueId` (HU-11) — sem o par, a tela mostraria
 * um id opaco no lugar do assunto, e o usuário não teria como julgar se o termo faz sentido.
 */
export interface SearchPlanProposal {
  queries: SearchPlan["queries"];
  legalIssues: Array<{ id: string; topic: string; question: string }>;
}
