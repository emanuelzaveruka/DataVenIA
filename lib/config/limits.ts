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
export const SCRATCHPAD_CONCURRENCY = 4;
