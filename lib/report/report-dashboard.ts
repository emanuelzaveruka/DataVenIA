import { isTribunalDoParana } from "../config/official-sources";
import type {
  FinalReport,
  ReportIssue,
  ReportOmission,
  ReportPrecedentItem,
  ReportSource,
} from "../schemas/report.schema";

/**
 * View-model do relatório para leitura em painel — a visão "quantos, de onde, de quando".
 *
 * O `FinalReport` (§3.10) é organizado por QUESTÃO JURÍDICA, que é a forma certa de ler o mérito:
 * cada questão com sua tendência, seus pontos favoráveis e contrários, seus riscos. Só que quem vai
 * decidir se entra com a ação também precisa da leitura transversal — quantas decisões ao todo,
 * de quais câmaras, de quais relatores, de que época, e quantas citações realmente conferiram na
 * fonte. Essa segunda leitura não existe no `FinalReport`, e derivá-la dentro do componente de tela
 * espalharia contagem por JSX. Ela vive aqui, como função pura, testável e sem React.
 *
 * NADA aqui inventa dado: toda contagem sai de campo que já existe no relatório. Onde o relatório
 * não sabe, o painel diz que não sabe em vez de estimar.
 *
 * ## A regra que este arquivo existe para não quebrar
 *
 * **Contagem absoluta com denominador visível, nunca percentual de êxito.** §3.10 e HU-29 proíbem o
 * produto de sugerir probabilidade de ganho, e `ReportTrend` foi desenhado sem campo de percentual
 * exatamente por isso. "6 de 9 decisões sustentam a tese" é fato sobre a amostra; "67% de chance"
 * é previsão — e a diferença entre as duas, ao lado de um número grande na tela, é invisível para
 * quem lê com pressa. Por isso nenhuma função abaixo devolve razão, taxa ou score: só inteiros e o
 * total de onde saíram.
 *
 * Proporção para desenhar barra é calculada na hora de desenhar, a partir de valor e total — não
 * é um número que este módulo entrega, porque não é um número que o usuário deva ler.
 */

/** Posição da decisão citada em relação à tese do cliente. Categórica, nunca uma escala. */
export type PosicaoPrecedente = "SUSTENTA" | "CONTRARIA";

export interface PrecedenteLinha {
  /** Chave estável da citação: uma decisão pode aparecer em mais de uma questão. */
  evidenceId: string;
  processNumber: string;
  court: string;
  chamber: string;
  judge: string;
  /** ISO (YYYY-MM-DD) como vem de `ReportSource`; a formatação é da tela. */
  judgmentDate: string;
  url: string;
  posicao: PosicaoPrecedente;
  /** Questão jurídica a que esta citação responde — sem ela a linha perde o contexto. */
  questao: string;
  legalIssueId: string;
  argumento: string;
  citacao: string;
}

export interface ContagemPorChave {
  chave: string;
  total: number;
  sustentam: number;
  contrariam: number;
}

export interface QuestaoResumo {
  legalIssueId: string;
  topico: string;
  pergunta: string;
  relevancia: ReportIssue["relevance"];
  classificacao: ReportIssue["classification"];
  motivoClassificacao: string;
  convergencia: ReportIssue["trend"]["convergence"];
  resumoTendencia: string;
  analisadas: number;
  sustentam: number;
  contrariam: number;
  mistas: number;
  padraoDaCamara?: string;
  /** HU-22: quando não há contrários, o relatório diz POR QUE — e o painel repete, não esconde. */
  avisoSemContrarios?: string;
  riscos: number;
  argumentos: number;
  fatoresRecorrentes: string[];
}

export interface RelatorioDashboard {
  reportId: string;
  geradoEm: string;
  caso: {
    processNumber?: string;
    court?: string;
    chamber?: string;
    pedidos: number;
    fatos: number;
    /**
     * A peça enviada é de fora do Paraná?
     *
     * `undefined` quando a peça não identifica o tribunal — "não diz" e "é de outro tribunal" são
     * coisas diferentes, e só a segunda vale um aviso. A peça pode ser de qualquer foro; o que é
     * TJPR-only é a jurisprudência pesquisada, e deixar essa assimetria implícita é o que faz
     * alguém ler um relatório do acervo paranaense achando que é do tribunal da própria peça.
     */
    deOutroTribunal?: boolean;
  };
  amostra: {
    decisoesAnalisadas: number;
    citacoesConferidas: number;
    itensOmitidos: number;
    questoes: number;
    /** Decisões DISTINTAS efetivamente citadas — menor que `decisoesAnalisadas` por construção. */
    decisoesCitadas: number;
    camaras: number;
    relatores: number;
  };
  posicao: { sustentam: number; contrariam: number; total: number };
  periodo: { maisAntiga?: string; maisRecente?: string };
  porCamara: ContagemPorChave[];
  porRelator: ContagemPorChave[];
  porAno: Array<{ ano: string; total: number }>;
  precedentes: PrecedenteLinha[];
  questoes: QuestaoResumo[];
  omissoes: ReportOmission[];
}

function linhasDaQuestao(issue: ReportIssue): PrecedenteLinha[] {
  const montar = (item: ReportPrecedentItem, posicao: PosicaoPrecedente): PrecedenteLinha => ({
    evidenceId: item.evidenceId,
    processNumber: item.source.processNumber,
    court: item.source.court,
    chamber: item.source.chamber,
    judge: item.source.judge,
    judgmentDate: item.source.judgmentDate,
    url: item.source.url,
    posicao,
    questao: issue.topic,
    legalIssueId: issue.legalIssueId,
    argumento: item.argument,
    citacao: item.quote,
  });

  return [
    ...issue.favorablePoints.map((item) => montar(item, "SUSTENTA")),
    ...issue.contraryPoints.map((item) => montar(item, "CONTRARIA")),
  ];
}

function contarPor(
  linhas: PrecedenteLinha[],
  chaveDe: (linha: PrecedenteLinha) => string,
): ContagemPorChave[] {
  const mapa = new Map<string, ContagemPorChave>();

  for (const linha of linhas) {
    const chave = chaveDe(linha);
    if (!chave) continue;
    const atual = mapa.get(chave) ?? { chave, total: 0, sustentam: 0, contrariam: 0 };
    atual.total += 1;
    if (linha.posicao === "SUSTENTA") atual.sustentam += 1;
    else atual.contrariam += 1;
    mapa.set(chave, atual);
  }

  // Empate desempatado pelo nome para a ordem não dançar entre execuções iguais.
  return [...mapa.values()].sort((a, b) => b.total - a.total || a.chave.localeCompare(b.chave));
}

/** Ano do julgamento. Data fora do formato não vira "ano desconhecido" silencioso: fica de fora. */
function anoDe(judgmentDate: string): string | undefined {
  const match = /^(\d{4})/.exec(judgmentDate.trim());
  return match?.[1];
}

function fontesDistintas(linhas: PrecedenteLinha[], campo: keyof ReportSource): number {
  const valores = new Set<string>();
  for (const linha of linhas) {
    const valor =
      campo === "chamber" ? linha.chamber : campo === "judge" ? linha.judge : linha.processNumber;
    if (valor) valores.add(valor);
  }
  return valores.size;
}

export function buildRelatorioDashboard(report: FinalReport): RelatorioDashboard {
  const precedentes = report.issues.flatMap(linhasDaQuestao);

  const datas = precedentes
    .map((linha) => linha.judgmentDate)
    .filter((data) => /^\d{4}-\d{2}-\d{2}/.test(data))
    .sort();

  const porAno = [...precedentes.reduce((mapa, linha) => {
    const ano = anoDe(linha.judgmentDate);
    if (ano) mapa.set(ano, (mapa.get(ano) ?? 0) + 1);
    return mapa;
  }, new Map<string, number>())]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ano, total]) => ({ ano, total }));

  const sustentam = precedentes.filter((linha) => linha.posicao === "SUSTENTA").length;

  return {
    reportId: report.reportId,
    geradoEm: report.generatedAt,
    caso: {
      processNumber: report.caseSummary.processNumber,
      court: report.caseSummary.court,
      chamber: report.caseSummary.chamber,
      pedidos: report.caseSummary.requests.length,
      fatos: report.caseSummary.facts.length,
      deOutroTribunal: (() => {
        const doParana = isTribunalDoParana(report.caseSummary.court);
        return doParana === undefined ? undefined : !doParana;
      })(),
    },
    amostra: {
      decisoesAnalisadas: report.sample.analyzedDecisions,
      citacoesConferidas: report.sample.verifiedEvidence,
      itensOmitidos: report.sample.omittedItems,
      questoes: report.issues.length,
      decisoesCitadas: fontesDistintas(precedentes, "processNumber"),
      camaras: fontesDistintas(precedentes, "chamber"),
      relatores: fontesDistintas(precedentes, "judge"),
    },
    posicao: {
      sustentam,
      contrariam: precedentes.length - sustentam,
      total: precedentes.length,
    },
    periodo: { maisAntiga: datas[0], maisRecente: datas[datas.length - 1] },
    porCamara: contarPor(precedentes, (linha) => linha.chamber),
    porRelator: contarPor(precedentes, (linha) => linha.judge),
    porAno,
    precedentes,
    questoes: report.issues.map((issue) => ({
      legalIssueId: issue.legalIssueId,
      topico: issue.topic,
      pergunta: issue.question,
      relevancia: issue.relevance,
      classificacao: issue.classification,
      motivoClassificacao: issue.classificationReason,
      convergencia: issue.trend.convergence,
      resumoTendencia: issue.trend.summary,
      analisadas: issue.trend.analyzedCount,
      sustentam: issue.trend.supportingCount,
      contrariam: issue.trend.opposingCount,
      mistas: issue.trend.mixedCount,
      padraoDaCamara: issue.chamberPattern,
      avisoSemContrarios: issue.contraryPointsNotice,
      riscos: issue.risks.length,
      argumentos: issue.suggestedArguments.length,
      fatoresRecorrentes: issue.recurringFactors,
    })),
    omissoes: report.omissions,
  };
}

/**
 * Linhas do CSV de precedentes — é o que um advogado leva para a planilha dele.
 *
 * Exporta o que sustenta a leitura (processo, câmara, relator, data, posição, questão, link e o
 * trecho citado), e **não** exporta nenhum número derivado: quem abre a planilha recalcula o que
 * quiser a partir das linhas. Exportar contagem pronta seria carregar para fora do produto uma
 * agregação que só faz sentido com o disclaimer ao lado.
 */
export const CSV_CABECALHO = [
  "processo",
  "tribunal",
  "camara",
  "relator",
  "julgamento",
  "posicao",
  "questao",
  "fonte",
  "citacao",
] as const;

function escaparCsv(valor: string): string {
  // Aspas dobradas e campo entre aspas: número de processo tem ponto e traço, ementa tem vírgula e
  // quebra de linha. Sem isso a planilha do usuário abre torta e ele culpa o relatório.
  return `"${valor.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

export function precedentesParaCsv(dashboard: RelatorioDashboard): string {
  const linhas = dashboard.precedentes.map((linha) =>
    [
      linha.processNumber,
      linha.court,
      linha.chamber,
      linha.judge,
      linha.judgmentDate,
      linha.posicao === "SUSTENTA" ? "sustenta" : "contraria",
      linha.questao,
      linha.url,
      linha.citacao,
    ]
      .map(escaparCsv)
      .join(","),
  );

  // BOM: sem ele o Excel em português abre UTF-8 como Latin-1 e "acórdão" vira "acÃ³rdÃ£o".
  return `﻿${CSV_CABECALHO.join(",")}\n${linhas.join("\n")}\n`;
}
