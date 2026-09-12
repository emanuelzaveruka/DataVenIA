import type { CamaraCompetencia } from "../schemas/competencia.schema";
import { CAMARA_COMPETENCIAS, FONTE, NOTA_FONTE } from "./camara-competencias.data";

export type { CamaraCompetencia };
export { FONTE, NOTA_FONTE };

/**
 * Consulta da competência material das Câmaras do TJPR sobre o dataset versionado.
 *
 * Por que não passa pelo `JurisFlowRepository`: aquela interface é de dados de **execução** (tudo
 * pende de `analysis_runs`, tudo é descartável por HU-06). Competência é norma pública, igual para
 * toda execução e idêntica com ou sem banco — ela é lida daqui em qualquer modo, e a tabela
 * `camara_competencias` existe para consulta SQL e para os relacionamentos que vierem depois
 * (contatos de desembargadores), não para ser a fonte da resposta em runtime.
 */
export function listCamaraCompetencias(): readonly CamaraCompetencia[] {
  return CAMARA_COMPETENCIAS;
}

/**
 * Acentuação, caixa e o indicador ordinal não podem decidir se uma câmara foi encontrada: nas
 * decisões ela vem como "9ª Câmara Cível" e digitada vira "9a camara civel". O `ª` é convertido
 * antes de a limpeza rodar — NFD não o decompõe, e descartá-lo deixaria "9 camara" ≠ "9a camara".
 */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/ª/g, "a")
    .replace(/º/g, "o")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Toda câmara citada na norma, em ordem de área e numeração. */
export function listCamaras(): string[] {
  const seen = new Set<string>();
  for (const entry of CAMARA_COMPETENCIAS) {
    for (const camara of entry.camaras) seen.add(camara);
  }
  return [...seen];
}

/**
 * "De que a 9ª Câmara Cível cuida?" — aceita o nome como vem das decisões (§3.4) ou digitado sem
 * acento.
 */
export function findCompetenciasByCamara(camara: string): CamaraCompetencia[] {
  const target = normalize(camara);
  return CAMARA_COMPETENCIAS.filter((entry) =>
    entry.camaras.some((name) => normalize(name) === target),
  );
}

export function findCompetenciasBySecao(secao: string): CamaraCompetencia[] {
  const target = normalize(secao);
  return CAMARA_COMPETENCIAS.filter((entry) => normalize(entry.secao) === target);
}

export interface CompetenciaMatch {
  entry: CamaraCompetencia;
  /** Termos da consulta encontrados, em ordem de aparição — é o "porquê" do match. */
  matchedTerms: string[];
}

/**
 * Caminho inverso: da matéria do caso para a competência. Busca literal por termo sobre o texto
 * oficial e o resumo, **sem modelo e sem heurística de relevância** — a resposta precisa ser
 * explicável ("casou com estes termos"), e um score opaco aqui reintroduziria na etapa de
 * roteamento o tipo de número que §3.10 proíbe expor no relatório.
 *
 * Termos com menos de três caracteres são ignorados: "de", "e", "ao" casam com tudo.
 */
export function searchCompetencias(termo: string): CompetenciaMatch[] {
  const terms = normalize(termo)
    .split(" ")
    .filter((term) => term.length >= 3);
  if (terms.length === 0) return [];

  const matches: CompetenciaMatch[] = [];
  for (const entry of CAMARA_COMPETENCIAS) {
    const haystack = normalize(`${entry.competencia} ${entry.descricao}`);
    const matchedTerms = terms.filter((term) => haystack.includes(term));
    if (matchedTerms.length > 0) matches.push({ entry, matchedTerms });
  }

  return matches.sort((a, b) => b.matchedTerms.length - a.matchedTerms.length);
}

/**
 * As câmaras competentes para uma matéria, já agregadas, na ordem de relevância de
 * `searchCompetencias`. Devolve lista — a competência do TJPR é de grupo ("8ª, 9ª e 10ª Cíveis"),
 * então responder com uma câmara só seria inventar precisão que a norma não tem.
 *
 * Não corta a cauda: um termo genérico ("saúde") casa com competências de seções diferentes, e
 * escolher um limiar aqui seria decidir em silêncio que uma delas não conta. A ordenação diz qual
 * casou melhor; quem chama decide onde parar.
 */
export function suggestCamaras(termo: string): string[] {
  const seen = new Set<string>();
  for (const match of searchCompetencias(termo)) {
    for (const camara of match.entry.camaras) seen.add(camara);
  }
  return [...seen];
}
