import type { CaseAnalysis } from "../../schemas/case-analysis.schema";
import type { JurisprudenceSearchItem, RankedCandidate } from "../../schemas/search.schema";
import { SEARCH_CANDIDATE_LIMIT } from "../../config/limits";

export interface PreRankingContext {
  chamber?: string;
  judge?: string;
  /** Termos usados para o critério de similaridade jurídica — tópicos/perguntas das legalIssues do caso. */
  keywords: string[];
}

/**
 * Deriva o contexto de pré-ranking diretamente da saída do Case Understanding (Fase 3), amarrando
 * HU-15 ao schema produzido por HU-07/HU-08 em vez de duplicar esses dados.
 */
export function buildPreRankingContext(caseAnalysis: CaseAnalysis): PreRankingContext {
  return {
    chamber: caseAnalysis.chamber,
    judge: caseAnalysis.judge,
    keywords: caseAnalysis.legalIssues.flatMap((issue) => [issue.topic, issue.question]),
  };
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function tokenize(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const RECENCY_WINDOW_DAYS = 5 * 365;

function recencyScore(judgmentDate: string): number | null {
  const parsed = Date.parse(judgmentDate);
  if (Number.isNaN(parsed)) return null;
  const ageDays = (Date.now() - parsed) / (1000 * 60 * 60 * 24);
  if (ageDays < 0) return 1;
  return Math.max(0, 1 - ageDays / RECENCY_WINDOW_DAYS);
}

interface Criterion {
  key: string;
  weight: number;
  compute: (item: JurisprudenceSearchItem, context: PreRankingContext) => number | null;
}

/**
 * Pesos sugeridos por contexto-geral.md §3.5. `sameClass` e `sameSubject` ficam sempre
 * não-computáveis hoje porque `JurisprudenceSearchItem` (§3.4) não carrega classe processual nem
 * assunto/matéria — a validação de HU-15 manda redistribuir o peso proporcionalmente entre os
 * critérios que puderem ser calculados em vez de quebrar o ranking ou inventar dado ausente.
 */
const CRITERIA: Criterion[] = [
  {
    key: "legalSimilarity",
    weight: 0.35,
    compute: (item, context) => {
      if (context.keywords.length === 0) return null;
      const itemText = [item.title, item.summary].filter(Boolean).join(" ");
      if (!itemText) return null;
      const itemTokens = tokenize(itemText);
      const contextTokens = new Set(context.keywords.flatMap((keyword) => Array.from(tokenize(keyword))));
      return jaccardSimilarity(itemTokens, contextTokens);
    },
  },
  {
    key: "sameChamber",
    weight: 0.2,
    compute: (item, context) => {
      if (!item.chamber || !context.chamber) return null;
      return normalizeText(item.chamber) === normalizeText(context.chamber) ? 1 : 0;
    },
  },
  {
    key: "sameJudge",
    weight: 0.15,
    compute: (item, context) => {
      if (!item.judge || !context.judge) return null;
      return normalizeText(item.judge) === normalizeText(context.judge) ? 1 : 0;
    },
  },
  {
    key: "sameClass",
    weight: 0.1,
    compute: () => null,
  },
  {
    key: "sameSubject",
    weight: 0.1,
    compute: () => null,
  },
  {
    key: "recency",
    weight: 0.1,
    compute: (item) => (item.judgmentDate ? recencyScore(item.judgmentDate) : null),
  },
];

function scoreItem(
  item: JurisprudenceSearchItem,
  context: PreRankingContext,
): { score: number; breakdown: Record<string, number | null> } {
  let weightedSum = 0;
  let weightTotal = 0;
  const breakdown: Record<string, number | null> = {};

  for (const criterion of CRITERIA) {
    const value = criterion.compute(item, context);
    breakdown[criterion.key] = value;
    if (value !== null) {
      weightedSum += value * criterion.weight;
      weightTotal += criterion.weight;
    }
  }

  const score = weightTotal === 0 ? 0 : weightedSum / weightTotal;
  return { score, breakdown };
}

/**
 * Pré-ranking (HU-15): ordena por score desc e trunca em `searchCandidateLimit` (HU-13) antes da
 * seleção para Scratchpad (HU-16).
 */
export function rankCandidates(
  items: JurisprudenceSearchItem[],
  context: PreRankingContext,
): RankedCandidate[] {
  return items
    .map((item) => {
      const { score, breakdown } = scoreItem(item, context);
      return { item, score, scoreBreakdown: breakdown };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, SEARCH_CANDIDATE_LIMIT);
}
