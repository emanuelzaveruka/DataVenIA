/**
 * HU-26 / §3.10 — "evitar métricas enganosas como '83% de chance de ganhar'".
 *
 * O relatório é montado em código, mas três campos são texto livre escrito pelo modelo no
 * cross-file (`conclusion`, descrições de risco, argumentos sugeridos). Sem esta checagem, a
 * proibição viveria só no prompt — e prompt não é garantia (§2.1/§11.7). Aqui ela vira um filtro
 * estrutural na última etapa antes da tela.
 */

/** Palavras que indicam que o texto está falando de probabilidade, não de um fato do caso. */
const PROBABILITY_TERMS = ["chance", "chances", "probabilidade", "probabilidades", "odds", "percentual de exito"];

/** Palavras de desfecho processual — é a combinação com probabilidade que cria a métrica vedada. */
const OUTCOME_TERMS = [
  "ganhar",
  "ganho",
  "exito",
  "vitoria",
  "vencer",
  "sucesso",
  "procedencia",
  "improcedencia",
  "perder",
  "derrota",
];

const PERCENTAGE_PATTERN = /\d+(?:[.,]\d+)?\s*%/;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function includesAny(sentence: string, terms: string[]): string | undefined {
  return terms.find((term) => sentence.includes(term));
}

export interface ForbiddenMetricCheck {
  blocked: boolean;
  /** Trecho que disparou o bloqueio — vai para `ReportOmission.reason`, nunca para a tela. */
  matched?: string;
}

/**
 * Um percentual sozinho NÃO é bloqueado: "reajuste de 30% por faixa etária" é conteúdo jurídico
 * legítimo do caso. O que é vedado é percentual (ou linguagem de probabilidade) aplicado a
 * desfecho processual, dentro da mesma frase.
 */
export function containsForbiddenMetric(text: string): ForbiddenMetricCheck {
  const sentences = normalize(text).split(/[.;!?\n]+/);

  for (const sentence of sentences) {
    const outcome = includesAny(sentence, OUTCOME_TERMS);
    if (!outcome) continue;

    const probability = includesAny(sentence, PROBABILITY_TERMS);
    if (probability) return { blocked: true, matched: `${probability} + ${outcome}` };

    const percentage = PERCENTAGE_PATTERN.exec(sentence);
    if (percentage) return { blocked: true, matched: `${percentage[0]} + ${outcome}` };
  }

  return { blocked: false };
}
