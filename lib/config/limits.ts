/**
 * Limite de upload (HU-01/HU-02, §7.1).
 */
export const MAX_UPLOAD_FILE_SIZE_BYTES = 15 * 1024 * 1024;

/**
 * Piso de conteúdo útil (caracteres não-whitespace do texto sanitizado) para justificar uma
 * chamada de Case Understanding (HU-09). Abaixo disso, o pipeline avisa antes de gastar a
 * chamada em vez de arriscar um relatório fundamentado em nada.
 */
export const MIN_CASE_ANALYSIS_INPUT_CHARS = 200;

/**
 * Piso de caracteres extraídos por página de um PDF. Abaixo disso, mesmo com texto não-vazio, é
 * sinal forte de páginas de imagem/digitalizadas com só um resquício de texto selecionável (ex.:
 * carimbo, cabeçalho, capa digital) — distinto do caso já coberto por `NO_EXTRACTABLE_TEXT`
 * (zero caracteres). Ver docs/fluxo-jurisprudencial-detalhado.md §5.
 */
export const MIN_PDF_CHARS_PER_PAGE = 100;

/**
 * Funil de limites da busca de jurisprudência (HU-13/HU-15/HU-16, contexto-geral.md §6).
 * Centralizado aqui — nunca hardcoded em mais de um lugar do pipeline (validação de HU-13).
 *
 * **Decisão de 2026-09-13 (registrada em `docs/escopo.md`)**: o teto passou a valer sobre o que a
 * busca *coleta*, e não sobre quantos resultados *existem* no tribunal. A regra anterior
 * comparava `totalCount` com 150 e derrubava a execução inteira — mas `totalCount` é um número que
 * o pipeline nunca usou: o que entra na análise são os `items` de uma página. Na prática isso
 * significava matar o run por causa de um número grande ("plano de saúde", 3.970 em §4.2) e, nas
 * buscas que passavam, analisar só a primeira página sem regra nenhuma sobre quantos itens eram.
 *
 * `totalCount` continua sendo lido para auditoria, mas não decide se a execução segue e não gera
 * aviso ao usuário. O que limita custo é a amostra coletada e selecionada para Scratchpad.
 */
export const SEARCH_PAGE_SIZE = 20;
export const SEARCH_MAX_PAGES = 3;
/** Teto de itens coletados por query: `SEARCH_PAGE_SIZE * SEARCH_MAX_PAGES`. */
export const SEARCH_COLLECTED_ITEMS_CAP = SEARCH_PAGE_SIZE * SEARCH_MAX_PAGES;
/**
 * Teto do pré-ranking. Diferente de `SEARCH_COLLECTED_ITEMS_CAP`, que vale **por query**, este vale
 * sobre o conjunto já deduplicado de todas as queries. Cada item que chega aqui vira uma chamada de
 * modelo na etapa MAP, porque `SCRATCHPAD_LIMIT` deriva deste valor.
 *
 * Ordenar não custa nada (é função pura, sem modelo e sem rede), então o corte não existe para
 * economizar: existe para o round-robin por Câmara de HU-16 escolher dentro de um conjunto que
 * ainda é relevante. Quem decide custo é `SCRATCHPAD_LIMIT`.
 */
export const SEARCH_CANDIDATE_LIMIT = 60;
/**
 * Quantas decisões são lidas a fundo (uma chamada de modelo cada, etapa MAP).
 *
 * **Decisão de 2026-09-13 (`docs/escopo.md`)**: é o mesmo número do pré-ranking, de propósito —
 * tudo que sobreviveu à ordenação é analisado, sem um segundo corte no meio do caminho.
 *
 * Derivado de `SEARCH_CANDIDATE_LIMIT` em vez de repetir o literal: são conceitualmente o mesmo
 * conjunto, e vê-los divergir por edição de um só foi exatamente o que motivou a mudança.
 */
export const SCRATCHPAD_LIMIT = SEARCH_CANDIDATE_LIMIT;
export const FINAL_EVIDENCE_LIMIT = 8;

/**
 * Mínimo de Scratchpads válidos para o workflow avançar para CROSS_FILE_ANALYSIS (HU-19,
 * contexto-geral.md §11.1). Consumido por `lib/workflow/state-machine.ts` — nunca hardcoded lá
 * separadamente.
 */
export const MIN_VALID_SCRATCHPADS = 3;

/**
 * Tamanho do pool de execução concorrente da geração de Scratchpads (HU-17/§3.7: "3 a 5 workers
 * é a sugestão inicial", sem fila distribuída).
 */
function intFromEnv(name: string, fallback: number, bounds: { min: number; max: number }): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < bounds.min || value > bounds.max) {
    throw new Error(`${name} inválido: use um inteiro entre ${bounds.min} e ${bounds.max}.`);
  }

  return value;
}

export const SCRATCHPAD_CONCURRENCY = intFromEnv("SCRATCHPAD_CONCURRENCY", 12, { min: 1, max: 12 });
export const SCRATCHPAD_FETCH_CONCURRENCY = intFromEnv(
  "SCRATCHPAD_FETCH_CONCURRENCY",
  SCRATCHPAD_CONCURRENCY,
  { min: 1, max: 12 },
);
export const SCRATCHPAD_LLM_CONCURRENCY = intFromEnv(
  "SCRATCHPAD_LLM_CONCURRENCY",
  SCRATCHPAD_CONCURRENCY,
  { min: 1, max: 12 },
);

/**
 * Custo de uma execução na etapa MAP, para não ser surpresa: são `SCRATCHPAD_LIMIT` chamadas de
 * modelo **e** `SCRATCHPAD_LIMIT` requisições de inteiro teor à fonte, em ondas de
 * `SCRATCHPAD_CONCURRENCY`. Com 60 e 12, são até 12 análises de modelo em paralelo. Se aparecer
 * rate limit, reduza `SCRATCHPAD_LLM_CONCURRENCY` sem precisar reduzir a amostra.
 */

/**
 * Limiar de aceitação "near-literal" na verificação de evidências (HU-24): fração mínima de tokens
 * da citação que precisa aparecer, na mesma janela, no texto original reaberto. Abaixo disso a
 * citação é tratada como não encontrada e o `evidenceId` fica bloqueado para o relatório (HU-25).
 */
export const QUOTE_MATCH_MIN_SIMILARITY = 0.9;

/**
 * Classificação qualitativa de convergência jurisprudencial no relatório final (HU-26/§3.10).
 * Nenhum destes números é exibido ao usuário — eles só escolhem o rótulo ("alta convergência",
 * "jurisprudência dividida"), porque §3.10 proíbe expor score interno como probabilidade jurídica.
 */
export const MIN_DECISIONS_FOR_CONVERGENCE = 4;
export const HIGH_CONVERGENCE_RATIO = 0.75;
export const DIVIDED_CONVERGENCE_MARGIN = 0.15;

/**
 * Teto de tokens de saída da análise cruzada (§3.8). O default do provider é 4096, dimensionado
 * para respostas de uma etapa só; o cross-file devolve uma entrada por questão jurídica, cada uma
 * com cinco listas de IDs, riscos e argumentos, e cresce com o tamanho do caso. Estourar o teto
 * trunca o JSON no meio e a falha chega como `STRUCTURED_OUTPUT_NOT_JSON` — um erro de forma que
 * parece erro de modelo e consome as três tentativas sem chance de acerto.
 *
 * Mantido no maior valor seguro para os modelos de Chat Completions usados em produção hoje: alguns
 * aceitam no máximo 16.384 tokens de conclusão e rejeitam a requisição inteira quando recebem
 * 32.000. Reduzir a amostra acelera o MAP sem exigir mexer neste teto.
 */
export const CROSS_FILE_MAX_OUTPUT_TOKENS = 16000;

/**
 * Tempo máximo de **uma** chamada de modelo, do envio ao corpo da resposta.
 *
 * Antes disto o `fetch` dos providers recebia só o `AbortSignal` da requisição HTTP: uma chamada
 * pendurada do outro lado segurava para sempre um dos `SCRATCHPAD_CONCURRENCY` workers da etapa
 * MAP, e quatro delas paravam a execução inteira sem erro nenhum — o caso mais difícil de
 * diagnosticar, porque "muito lento" e "travado" ficavam idênticos.
 *
 * É teto de tempo de parede, e não de tokens: quem decide quando a resposta acabou é o modelo
 * (ver o comentário sobre `maxOutputTokens` em `lib/llm/providers/openai-compatible-provider.ts`).
 * Generoso de propósito — uma decisão longa em modelo de raciocínio passa bem de um minuto.
 */
export const LLM_CALL_TIMEOUT_MS = 180_000;
