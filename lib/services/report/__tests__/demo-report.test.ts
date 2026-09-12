import { describe, expect, it } from "vitest";
import { buildDemoReport } from "../../../providers/fixtures/demo-report";
import { RESEARCH_DISCLAIMER } from "../../../schemas/report.schema";

/**
 * Demo de ponta a ponta das Fases 6 e 7 sobre a fixture versionada, sem rede e sem modelo
 * (HU-37 / critério de aceite 16).
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

    // Todo trecho citado é literal na fixture, então nada é omitido por falta de verificação.
    expect(report.omissions).toEqual([]);
    expect(issue.favorablePoints.length).toBeGreaterThan(0);
    expect(issue.contraryPoints.length).toBeGreaterThan(0);
    expect(issue.risks.length).toBeGreaterThan(0);
    expect(issue.suggestedArguments.length).toBeGreaterThan(0);
  });

  it("shows contrary precedents alongside favorable ones (HU-22/critério de aceite 9)", async () => {
    const result = await buildDemoReport();
    if (result.isError) throw new Error(result.error.description);

    const issue = result.data.issues[0]!;
    expect(issue.contraryPointsNotice).toBeUndefined();
    expect(issue.trend.opposingCount).toBeGreaterThan(0);
  });

  it("links every displayed finding to the official TJPR portal (HU-27/critério de aceite 12)", async () => {
    const result = await buildDemoReport();
    if (result.isError) throw new Error(result.error.description);

    const issue = result.data.issues[0]!;
    const sources = [
      ...issue.favorablePoints.map((point) => point.source),
      ...issue.contraryPoints.map((point) => point.source),
      ...issue.risks.flatMap((risk) => risk.sources),
    ];

    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source.url).toMatch(/^https:\/\/portal\.tjpr\.jus\.br\//);
      expect(source.chamber).toBeTruthy();
      expect(source.judge).toBeTruthy();
      expect(source.judgmentDate).toBeTruthy();
    }
  });

  it("never exposes a chance-of-winning metric (HU-26/critério de aceite 11)", async () => {
    const result = await buildDemoReport();
    if (result.isError) throw new Error(result.error.description);

    const serialized = JSON.stringify(result.data).toLowerCase();
    expect(serialized).not.toMatch(/\d+\s*%/);
    expect(serialized).not.toContain("chance de ganhar");
  });
});
