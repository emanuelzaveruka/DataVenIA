import { z } from "zod";

/**
 * Contrato de item de busca de jurisprudência (contexto-geral.md §3.4). Fixo pelo contexto —
 * qualquer provider (TjprProvider real ou FixtureProvider, Fase 2) normaliza sua resposta para
 * este formato antes de o item entrar no funil (HU-13/HU-15/HU-16).
 */
export const JurisprudenceSearchItemSchema = z.object({
  id: z.string().min(1),
  processNumber: z.string().optional(),
  title: z.string().optional(),
  court: z.string().min(1),
  chamber: z.string().optional(),
  judge: z.string().optional(),
  judgmentDate: z.string().optional(),
  summary: z.string().optional(),
  url: z.string().url(),
  source: z.literal("TJPR"),
});
export type JurisprudenceSearchItem = z.infer<typeof JurisprudenceSearchItemSchema>;

/**
 * `totalCount` é o total de resultados brutos reportado pela fonte (pode exceder `items.length`
 * quando paginado) — é sobre ele que o funil de HU-13 decide se pede mais filtros.
 */
export const JurisprudenceSearchResultSchema = z.object({
  items: z.array(JurisprudenceSearchItemSchema),
  totalCount: z.number().int().nonnegative(),
});
export type JurisprudenceSearchResult = z.infer<typeof JurisprudenceSearchResultSchema>;

export interface RankedCandidate {
  item: JurisprudenceSearchItem;
  score: number;
  scoreBreakdown: Record<string, number | null>;
}

/**
 * Filtros que HU-13 pede ao usuário quando `totalCount` excede `rawSearchResultsCap` (período,
 * órgão julgador, relator — contexto-geral.md §6).
 */
export const JurisprudenceQueryFiltersSchema = z.object({
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  judgingBody: z.string().optional(),
  judge: z.string().optional(),
});
export type JurisprudenceQueryFilters = z.infer<typeof JurisprudenceQueryFiltersSchema>;

export const JurisprudenceQuerySchema = z.object({
  query: z.string().min(1),
  filters: JurisprudenceQueryFiltersSchema.optional(),
});
export type JurisprudenceQuery = z.infer<typeof JurisprudenceQuerySchema>;

/**
 * Retorno de `JurisprudenceProvider.fetchDecision` (contexto-geral.md §3.4/§5) — mesma forma do
 * contrato normalizado `Decision` do §5, já incluindo `fullText` para alimentar o Scratchpad
 * Service (Fase 5). Cada provider normaliza seu próprio payload bruto para este formato antes de
 * retornar; nenhum serviço acima vê o payload original da fonte.
 */
export const RawDecisionSchema = z.object({
  id: z.string().min(1),
  processNumber: z.string().optional(),
  court: z.string().min(1),
  judgingBody: z.string().optional(),
  rapporteur: z.string().optional(),
  judgmentDate: z.string().optional(),
  publicationDate: z.string().optional(),
  summary: z.string().optional(),
  fullText: z.string().optional(),
  sourceUrl: z.string().url(),
});
export type RawDecision = z.infer<typeof RawDecisionSchema>;
