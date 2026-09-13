import { describe, expect, it } from "vitest";
import { buildDemoReport } from "../../../providers/fixtures/demo-report";
import { RESEARCH_DISCLAIMER } from "../../../schemas/report.schema";

/**
 * Demo de ponta a ponta das Fases 6 e 7 sobre a fixture versionada, sem rede e sem modelo
 * (HU-37 / critério de aceite 16).
 *
 * O que a demo demonstra mudou em 2026-09-13, e de propósito: ela continua exercitando o pipeline
 * inteiro offline, mas **não exibe nenhum achado**. As decisões da fixture são fictícias, e a regra
 * do produto passou a ser "só mostramos a fonte quando temos o metadado real de onde a informação
 * saiu". Antes, elas eram exibidas com link para `portal.tjpr.jus.br` — um link que responde 404 —
 * como se fossem acórdãos reais. Um relatório de demonstração cheio de omissões explicadas é uma
 * demonstração pior; um relatório de demonstração que apresenta acórdão inventado como fonte
 * oficial é um defeito.
 */
describe("buildDemoReport", () => {
  it("produces a complete, traceable report from the versioned fixture", async () => {
    const result = await buildDemoReport();

    expect(result.isError).toBe(false);
    if (result.isError) throw new Error(result.error.description);

    const report = result.data;
    const issue = report.issues[0]!;

    expect(report.disclaimer).toBe(RESEARCH_DISCLAIMER);
    expect(report.sample.analyzedDecisions).toBe(9);
    expect(issue.trend.analyzedCount).toBe(9);
    expect(issue.trend.summary).toContain("de 9 decisões analisadas");

    // A contagem da amostra sobrevive — ela descreve o que foi analisado, não uma citação exibida
    // como fundamento (§3.10). O que não sobrevive é qualquer achado com fonte.
    expect(issue.trend.analyzedCount).toBe(9);
    expect(issue.favorablePoints).toEqual([]);
    expect(issue.contraryPoints).toEqual([]);
    expect(issue.risks).toEqual([]);
    expect(issue.suggestedArguments).toEqual([]);
  });

  it("registra cada achado omitido com o motivo, em vez de escondê-lo (§14)", async () => {
    const result = await buildDemoReport();
    if (result.isError) throw new Error(result.error.description);

    const report = result.data;
    expect(report.omissions.length).toBeGreaterThan(0);
    expect(report.sample.omittedItems).toBe(report.omissions.length);

    const kinds = new Set(report.omissions.map((omission) => omission.kind));
    // A causa raiz é a URL; `UNVERIFIED_EVIDENCE` é a cascata — risco ou argumento que ficou sem
    // nenhuma fonte exibível depois dela. Registrar as duas é o que mantém §14 respondível.
    expect(kinds).toContain("UNOFFICIAL_SOURCE_URL");
    expect([...kinds].every((kind) => kind === "UNOFFICIAL_SOURCE_URL" || kind === "UNVERIFIED_EVIDENCE")).toBe(true);
    expect(report.omissions.some((omission) => omission.reason.includes("fonte oficial do TJPR"))).toBe(true);
  });

  it("a amostra continua contando os contrários, que é um fato sobre ela (HU-22)", async () => {
    const result = await buildDemoReport();
    if (result.isError) throw new Error(result.error.description);

    expect(result.data.issues[0]!.trend.opposingCount).toBeGreaterThan(0);
  });

  it("nenhuma URL exibida, porque nenhuma decisão da fixture tem origem real (HU-27)", async () => {
    const result = await buildDemoReport();
    if (result.isError) throw new Error(result.error.description);

    // A varredura é sobre o relatório inteiro: basta um `url` sobreviver para a demo voltar a
    // oferecer acórdão inventado como fonte.
    expect(JSON.stringify(result.data)).not.toContain("\"url\"");
    expect(JSON.stringify(result.data)).not.toContain("tjpr.jus.br/jurisprudencia");
  });

  it("never exposes a chance-of-winning metric (HU-26/critério de aceite 11)", async () => {
    const result = await buildDemoReport();
    if (result.isError) throw new Error(result.error.description);

    const serialized = JSON.stringify(result.data).toLowerCase();
    expect(serialized).not.toMatch(/\d+\s*%/);
    expect(serialized).not.toContain("chance de ganhar");
  });
});
