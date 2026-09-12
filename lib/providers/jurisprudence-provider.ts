import type { ToolResult } from "../errors/tool-result";
import type { JurisprudenceQuery, JurisprudenceSearchResult, RawDecision } from "../schemas/search.schema";

/**
 * Único ponto de contato com uma fonte de jurisprudência (contexto-geral.md §3.4/§5). Nenhum
 * componente de UI ou serviço chama uma fonte diretamente — tudo passa por esta interface, seja a
 * implementação `FixtureProvider` (HU-37, `lib/providers/fixture.ts`) ou o `TjprProvider`
 * opt-in (HU-12/Fase 9, `lib/providers/tjpr.ts`; ver ressalvas em `docs/tjpr-portal-validacao.md`).
 */
export interface JurisprudenceProvider {
  readonly name: string;
  search(query: JurisprudenceQuery): Promise<ToolResult<JurisprudenceSearchResult>>;
  fetchDecision(decisionId: string): Promise<ToolResult<RawDecision>>;
}
