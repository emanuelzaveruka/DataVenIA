import {
  DIVIDED_CONVERGENCE_MARGIN,
  HIGH_CONVERGENCE_RATIO,
  MIN_DECISIONS_FOR_CONVERGENCE,
} from "../../config/limits";
import type { ConvergenceLevel, ReportTrend } from "../../schemas/report.schema";

export interface DecisionCounts {
  supportingCount: number;
  opposingCount: number;
  mixedCount: number;
}

function analyzedCount(counts: DecisionCounts): number {
  return counts.supportingCount + counts.opposingCount + counts.mixedCount;
}

/**
 * Rótulo qualitativo de §3.10 ("alta/moderada convergência", "jurisprudência dividida", "baixa
 * quantidade de precedentes relevantes"). Os limiares ficam em `limits.ts` e o número que os
 * dispara nunca é exibido: o usuário vê o rótulo e as contagens absolutas, jamais um score.
 */
export function classifyConvergence(counts: DecisionCounts): ConvergenceLevel {
  const total = analyzedCount(counts);
  if (total < MIN_DECISIONS_FOR_CONVERGENCE) return "AMOSTRA_INSUFICIENTE";

  const margin = Math.abs(counts.supportingCount - counts.opposingCount) / total;
  if (margin <= DIVIDED_CONVERGENCE_MARGIN) return "DIVIDIDA";

  const dominant = Math.max(counts.supportingCount, counts.opposingCount) / total;
  return dominant >= HIGH_CONVERGENCE_RATIO ? "ALTA" : "MODERADA";
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

/**
 * Frase exigida por §3.10 ("6 de 10 decisões sustentam a tese principal, 3 contrárias, 1 mista").
 * É contagem absoluta sobre a amostra analisada — nunca uma projeção sobre o caso do usuário.
 */
export function buildTrendSummary(counts: DecisionCounts): string {
  const total = analyzedCount(counts);
  if (total === 0) return "Nenhuma decisão analisada sustenta ou contraria esta questão.";

  const parts = [
    `${counts.supportingCount} de ${total} ${plural(total, "decisão analisada sustenta", "decisões analisadas sustentam")} a tese`,
    `${counts.opposingCount} ${plural(counts.opposingCount, "contrária", "contrárias")}`,
    `${counts.mixedCount} ${plural(counts.mixedCount, "mista", "mistas")}`,
  ];

  return `${parts.join(", ")}.`;
}

export function buildTrend(counts: DecisionCounts): ReportTrend {
  return {
    analyzedCount: analyzedCount(counts),
    supportingCount: counts.supportingCount,
    opposingCount: counts.opposingCount,
    mixedCount: counts.mixedCount,
    summary: buildTrendSummary(counts),
    convergence: classifyConvergence(counts),
  };
}
