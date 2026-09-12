import { QUOTE_MATCH_MIN_SIMILARITY } from "../../config/limits";
import type { EvidenceMatchKind } from "../../schemas/evidence.schema";

export interface QuoteMatch {
  kind: Extract<EvidenceMatchKind, "EXACT" | "ELIDED" | "NEAR_LITERAL" | "NOT_FOUND">;
  similarity: number;
}

/**
 * Normalização usada só para comparar (HU-24: presença "literal ou near-literal"). Diferenças que
 * não mudam o conteúdo da citação — acentuação, caixa, aspas tipográficas, travessões, espaços,
 * quebras de linha do HTML original — não podem transformar uma citação real em citação "não
 * encontrada"; qualquer diferença além disso, sim.
 */
export function normalizeForMatching(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’‚‛′´`]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Marcadores de supressão comuns em citação jurídica: "[...]", "(...)", "...", "…". */
const ELISION_PATTERN = /\s*(?:\[\s*\.{3,}\s*\]|\(\s*\.{3,}\s*\)|…|\.{3,})\s*/g;

export function splitOnElisions(normalizedQuote: string): string[] {
  return normalizedQuote
    .split(ELISION_PATTERN)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length > 0);
}

function tokenize(normalized: string): string[] {
  return normalized.split(/[^a-z0-9]+/).filter((token) => token.length > 0);
}

/**
 * Melhor sobreposição de tokens entre a citação e qualquer janela de mesmo tamanho do texto
 * original. Janela deslizante com contagens incrementais (O(n) sobre o texto da decisão) — o texto
 * integral de um acórdão é grande demais para uma comparação quadrática por citação.
 */
export function bestWindowSimilarity(sourceTokens: string[], quoteTokens: string[]): number {
  if (quoteTokens.length === 0) return 0;

  const needed = new Map<string, number>();
  for (const token of quoteTokens) needed.set(token, (needed.get(token) ?? 0) + 1);

  const windowSize = Math.min(quoteTokens.length, sourceTokens.length);
  if (windowSize === 0) return 0;

  const inWindow = new Map<string, number>();
  let matched = 0;

  function add(token: string): void {
    const count = (inWindow.get(token) ?? 0) + 1;
    inWindow.set(token, count);
    if (count <= (needed.get(token) ?? 0)) matched += 1;
  }

  function remove(token: string): void {
    const count = (inWindow.get(token) ?? 0) - 1;
    inWindow.set(token, count);
    if (count < (needed.get(token) ?? 0)) matched -= 1;
  }

  for (let i = 0; i < windowSize; i++) add(sourceTokens[i]!);
  let best = matched;

  for (let i = windowSize; i < sourceTokens.length; i++) {
    add(sourceTokens[i]!);
    remove(sourceTokens[i - windowSize]!);
    if (matched > best) best = matched;
  }

  return best / quoteTokens.length;
}

/**
 * Confere se `quote` está presente em `sourceText` (HU-24). Ordem de tentativa: literal exato →
 * literal com supressões ("[...]") preservando a ordem dos fragmentos → near-literal por
 * sobreposição de tokens acima do limiar. Nunca decide relevância nem mérito: só presença.
 */
export function matchQuote(
  sourceText: string,
  quote: string,
  minSimilarity: number = QUOTE_MATCH_MIN_SIMILARITY,
): QuoteMatch {
  const haystack = normalizeForMatching(sourceText);
  const needle = normalizeForMatching(quote);

  if (needle.length === 0 || haystack.length === 0) return { kind: "NOT_FOUND", similarity: 0 };

  if (haystack.includes(needle)) return { kind: "EXACT", similarity: 1 };

  const fragments = splitOnElisions(needle);
  if (fragments.length > 1) {
    let cursor = 0;
    const allInOrder = fragments.every((fragment) => {
      const found = haystack.indexOf(fragment, cursor);
      if (found === -1) return false;
      cursor = found + fragment.length;
      return true;
    });
    if (allInOrder) return { kind: "ELIDED", similarity: 1 };
  }

  const similarity = bestWindowSimilarity(tokenize(haystack), tokenize(needle));
  return similarity >= minSimilarity
    ? { kind: "NEAR_LITERAL", similarity }
    : { kind: "NOT_FOUND", similarity };
}
