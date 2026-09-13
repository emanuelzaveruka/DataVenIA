const STOPWORDS = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "para",
  "pela",
  "pelas",
  "pelo",
  "pelos",
  "por",
]);

/**
 * Medido contra o portal em 2026-09-13: `criterioPesquisa` é AND estrito, e cada palavra a mais
 * reduz a contagem exponencialmente — "plano saude" = 243, "plano saude negativa" = 45, "plano
 * saude negativa cobertura" = 32, e a partir de 4-5 palavras é comum cair a 0-2. 3 é o teto que
 * ainda deixa alguma margem; acima disso a query costuma zerar sozinha antes de qualquer filtro
 * de relevância entrar em ação.
 */
const MAX_QUERY_TOKENS = 3;

function removeDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeToken(token: string): string {
  if (/^[A-Z]{2,8}$/.test(token)) return token;
  return token.toLowerCase();
}

/**
 * O portal do TJPR tende a responder melhor a termos soltos do que a frases naturais longas.
 * Esta função transforma a query em keywords estáveis para `criterioPesquisa`, sem mexer na
 * intenção/rastreabilidade que acompanha a busca no pipeline.
 */
export function normalizeTjprKeywordQuery(query: string): string {
  const tokens = removeDiacritics(query)
    .replace(/[º°]/g, " ")
    .replace(/[^\p{L}\p{N}/.-]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[.-]+|[.-]+$/g, ""))
    .filter(Boolean)
    .filter((token) => !STOPWORDS.has(token.toLowerCase()))
    .map(normalizeToken)
    .slice(0, MAX_QUERY_TOKENS);

  return tokens.join(" ").trim();
}
