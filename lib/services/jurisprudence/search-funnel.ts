import {
  BROAD_SEARCH_WARNING_THRESHOLD,
  SEARCH_COLLECTED_ITEMS_CAP,
} from "../../config/limits";
import type { JurisprudenceSearchItem, JurisprudenceSearchResult } from "../../schemas/search.schema";

export interface SearchFunnelResult {
  /** O que segue para o pré-ranking, já limitado ao teto de coleta. */
  items: JurisprudenceSearchItem[];
  /** Quantos o tribunal declarou ter, independentemente de quantos vieram. */
  totalCount: number;
  /** Havia mais itens na resposta do que o teto permite processar. */
  truncated: boolean;
  /**
   * A busca é ampla o bastante para valer um aviso de refinamento. Não impede nada: é informação
   * para quem lê o relatório decidir se refina por período, Câmara ou relator.
   */
  broad: boolean;
}

/**
 * Funil de limites (HU-13, contexto-geral.md §6), na forma acordada em 2026-09-13
 * (`docs/escopo.md`): o teto vale sobre o que a busca **coleta**, não sobre quantos resultados
 * **existem** no tribunal.
 *
 * A regra anterior comparava `totalCount` com 150 e falhava a execução inteira. O problema não era
 * o número: era comparar contra uma grandeza que o pipeline nunca consumiu. `totalCount` é quantos
 * acórdãos o TJPR tem sobre o tema; o que entra na análise são os `items` que a busca trouxe. Na
 * prática, uma query normal de direito do consumidor ("plano de saúde" — 3.970 resultados, §4.2)
 * matava o run, e as que passavam analisavam a página 1 sem teto nenhum sobre quantos itens eram.
 *
 * O que sobrevive da HU é a intenção — nunca processar volume não filtrado: o limite agora é
 * explícito (`SEARCH_COLLECTED_ITEMS_CAP`) e o aviso de refinamento continua chegando ao usuário
 * via `broad`, só que sem derrubar a execução.
 *
 * É função pura, e não `ToolResult`: depois desta mudança não existe caminho de falha aqui.
 */
export function applySearchFunnel(result: JurisprudenceSearchResult): SearchFunnelResult {
  return {
    items: result.items.slice(0, SEARCH_COLLECTED_ITEMS_CAP),
    totalCount: result.totalCount,
    truncated: result.items.length > SEARCH_COLLECTED_ITEMS_CAP,
    broad: result.totalCount > BROAD_SEARCH_WARNING_THRESHOLD,
  };
}
