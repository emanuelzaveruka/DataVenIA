import { describe, expect, it } from "vitest";
import { buildRelatorioDashboard, precedentesParaCsv } from "../report-dashboard";
import { buildDemoReport } from "../../providers/fixtures/demo-report";
import type { FinalReport } from "../../schemas/report.schema";
import { RESEARCH_DISCLAIMER } from "../../schemas/report.schema";

/**
 * O relatório de demonstração é produzido pelas Fases 6+7 de verdade sobre a fixture versionada —
 * é relatório real, não objeto montado à mão, e por isso é o insumo certo para testar a derivação.
 */
async function relatorioReal(): Promise<FinalReport> {
  const resultado = await buildDemoReport();
  if (resultado.isError) throw new Error(`fixture de relatório falhou: ${resultado.error.code}`);
  return resultado.data;
}

/** Relatório sem nenhum precedente citado — o caso em que a amostra não respondeu às questões. */
function relatorioVazio(): FinalReport {
  return {
    reportId: "REP-VAZIO",
    schemaVersion: "1.0.0",
    generatedAt: "2026-09-13T04:00:00.000Z",
    disclaimer: RESEARCH_DISCLAIMER,
    caseSummary: { parties: {}, requests: ["Pedido único"], facts: [] },
    issues: [
      {
        legalIssueId: "LI-01",
        topic: "Questão sem cobertura na amostra",
        question: "A amostra responde a isto?",
        relevance: "HIGH",
        classification: "INDETERMINADA",
        classificationReason: "Nenhuma decisão analisada tratou desta questão.",
        trend: {
          analyzedCount: 0,
          supportingCount: 0,
          opposingCount: 0,
          mixedCount: 0,
          summary: "Nenhuma decisão analisada sustenta ou contraria esta questão.",
          convergence: "AMOSTRA_INSUFICIENTE",
        },
        recurringFactors: [],
        favorablePoints: [],
        contraryPoints: [],
        contraryPointsNotice: "Nenhum precedente contrário identificado na amostra.",
        risks: [],
        distinguishing: [],
        suggestedArguments: [],
      },
    ],
    sample: { analyzedDecisions: 9, verifiedEvidence: 0, omittedItems: 0 },
    omissions: [],
  };
}

describe("buildRelatorioDashboard", () => {
  it("conta a amostra a partir do relatório, sem recontar por fora", async () => {
    const report = await relatorioReal();
    const painel = buildRelatorioDashboard(report);

    expect(painel.amostra.decisoesAnalisadas).toBe(report.sample.analyzedDecisions);
    expect(painel.amostra.citacoesConferidas).toBe(report.sample.verifiedEvidence);
    expect(painel.amostra.itensOmitidos).toBe(report.sample.omittedItems);
    expect(painel.amostra.questoes).toBe(report.issues.length);
  });

  it("separa decisões CITADAS de decisões ANALISADAS", async () => {
    const painel = buildRelatorioDashboard(await relatorioReal());

    // Nem toda decisão analisada vira citação verificada — confundir as duas infla a amostra e
    // faria o painel prometer mais fundamentação do que o relatório entrega.
    expect(painel.amostra.decisoesCitadas).toBeLessThanOrEqual(painel.amostra.decisoesAnalisadas);
    expect(painel.amostra.camaras).toBeGreaterThan(0);
    expect(painel.amostra.relatores).toBeGreaterThan(0);
  });

  it("classifica cada precedente como sustenta ou contraria, e a soma fecha", async () => {
    const painel = buildRelatorioDashboard(await relatorioReal());

    expect(painel.posicao.sustentam + painel.posicao.contrariam).toBe(painel.posicao.total);
    expect(painel.posicao.total).toBe(painel.precedentes.length);
  });

  it("agrupa por câmara e por relator com os totais batendo com as linhas", async () => {
    const painel = buildRelatorioDashboard(await relatorioReal());

    const somaCamaras = painel.porCamara.reduce((total, item) => total + item.total, 0);
    const somaRelatores = painel.porRelator.reduce((total, item) => total + item.total, 0);
    expect(somaCamaras).toBe(painel.precedentes.length);
    expect(somaRelatores).toBe(painel.precedentes.length);

    for (const grupo of painel.porCamara) {
      expect(grupo.sustentam + grupo.contrariam).toBe(grupo.total);
    }
  });

  it("ordena os anos cronologicamente e cobre todos os precedentes datados", async () => {
    const painel = buildRelatorioDashboard(await relatorioReal());

    const anos = painel.porAno.map((item) => item.ano);
    expect([...anos].sort()).toEqual(anos);

    const datados = painel.precedentes.filter((linha) => /^\d{4}-/.test(linha.judgmentDate)).length;
    expect(painel.porAno.reduce((total, item) => total + item.total, 0)).toBe(datados);
  });

  it("preserva a proveniência de cada precedente (HU-27)", async () => {
    const painel = buildRelatorioDashboard(await relatorioReal());

    for (const linha of painel.precedentes) {
      expect(linha.processNumber).not.toBe("");
      expect(linha.chamber).not.toBe("");
      expect(linha.judge).not.toBe("");
      expect(linha.judgmentDate).not.toBe("");
      expect(linha.url).toMatch(/^https?:\/\//);
    }
  });

  it("não expõe percentual nem score em campo nenhum (§3.10/HU-29)", async () => {
    const painel = buildRelatorioDashboard(await relatorioReal());

    // A regra é estrutural: se um campo de razão/taxa aparecer aqui, a tela vai acabar exibindo.
    const chaves = JSON.stringify(painel).match(/"[a-zA-Zçãéêó]+":/g) ?? [];
    const proibidas = chaves.filter((chave) =>
      /percent|ratio|score|probabil|chance|taxa/i.test(chave),
    );
    expect(proibidas).toEqual([]);
  });

  it("sobrevive ao relatório sem precedente algum, sem inventar zero disfarçado", () => {
    const painel = buildRelatorioDashboard(relatorioVazio());

    expect(painel.precedentes).toEqual([]);
    expect(painel.posicao).toEqual({ sustentam: 0, contrariam: 0, total: 0 });
    expect(painel.porCamara).toEqual([]);
    expect(painel.porAno).toEqual([]);
    expect(painel.periodo.maisAntiga).toBeUndefined();
    // A amostra continua sendo o que o relatório diz: 9 decisões foram analisadas e nenhuma serviu.
    // Zerar isto aqui esconderia que houve trabalho e que ele não encontrou nada.
    expect(painel.amostra.decisoesAnalisadas).toBe(9);
    expect(painel.questoes[0]?.avisoSemContrarios).toBeDefined();
  });
});

describe("precedentesParaCsv", () => {
  it("gera cabeçalho e uma linha por precedente", async () => {
    const painel = buildRelatorioDashboard(await relatorioReal());
    const csv = precedentesParaCsv(painel);
    const linhas = csv.trimEnd().split("\n");

    expect(linhas[0]).toContain("processo,tribunal,camara,relator");
    expect(linhas).toHaveLength(painel.precedentes.length + 1);
  });

  it("escapa aspas e quebra de linha para a planilha não abrir torta", () => {
    const painel = buildRelatorioDashboard(relatorioVazio());
    painel.precedentes.push({
      evidenceId: "EV-01",
      processNumber: "0001234-56.2024.8.16.0004",
      court: "TJPR",
      chamber: "9ª Câmara Cível",
      judge: 'Des. "Apelido" Silva',
      judgmentDate: "2024-03-18",
      url: "https://portal.tjpr.jus.br/x",
      posicao: "SUSTENTA",
      questao: "Questão, com vírgula",
      legalIssueId: "LI-01",
      argumento: "arg",
      citacao: "trecho com\nquebra de linha",
    });

    const linha = precedentesParaCsv(painel).trimEnd().split("\n")[1] ?? "";
    expect(linha).toContain('"Des. ""Apelido"" Silva"');
    expect(linha).toContain('"Questão, com vírgula"');
    expect(linha).not.toContain("\n");
  });

  it("começa com BOM para o Excel em português não quebrar o acento", () => {
    const csv = precedentesParaCsv(buildRelatorioDashboard(relatorioVazio()));
    expect(csv.startsWith("﻿")).toBe(true);
  });
});

/**
 * A peça pode ser de qualquer foro — é o documento do cliente. A jurisprudência é só TJPR (HU-36).
 * O painel precisa distinguir os dois, senão um relatório montado sobre o acervo paranaense é lido
 * como se fosse do tribunal onde o processo corre.
 */
describe("tribunal da peça x tribunal pesquisado", () => {
  function comTribunal(court?: string): FinalReport {
    const base = relatorioVazio();
    return { ...base, caseSummary: { ...base.caseSummary, court } };
  }

  it("marca a peça como de outro tribunal quando não é do Paraná", () => {
    const painel = buildRelatorioDashboard(
      comTribunal("Tribunal de Justiça do Estado de São Paulo"),
    );
    expect(painel.caso.deOutroTribunal).toBe(true);
  });

  it.each([
    "TJPR",
    "Tribunal de Justiça do Paraná",
    "Tribunal de Justiça do Estado do Parana",
  ])("reconhece %s como do Paraná, sem exigir grafia exata", (court) => {
    expect(buildRelatorioDashboard(comTribunal(court)).caso.deOutroTribunal).toBe(false);
  });

  it("não afirma nada quando a peça não identifica o tribunal", () => {
    // "não diz" não é "é de outro tribunal": só o segundo merece aviso na tela.
    expect(buildRelatorioDashboard(comTribunal(undefined)).caso.deOutroTribunal).toBeUndefined();
    expect(buildRelatorioDashboard(comTribunal("   ")).caso.deOutroTribunal).toBeUndefined();
  });
});
