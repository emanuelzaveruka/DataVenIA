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
 * Funil de limites da busca de jurisprudência (HU-13/HU-15/HU-16, contexto-geral.md §6).
 * Centralizado aqui — nunca hardcoded em mais de um lugar do pipeline (validação de HU-13).
 */
export const RAW_SEARCH_RESULTS_CAP = 150;
export const SEARCH_CANDIDATE_LIMIT = 30;
export const SCRATCHPAD_LIMIT = 10;
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
export const SCRATCHPAD_CONCURRENCY = process.env.SCRATCHPAD_CONCURRENCY
  ? Number(process.env.SCRATCHPAD_CONCURRENCY)
  : 12;

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
 */
export const CROSS_FILE_MAX_OUTPUT_TOKENS = 16000;
