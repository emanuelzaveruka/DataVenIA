import { describe, expect, it } from "vitest";
import { buildPipelineProgress } from "../pipeline-progress";

describe("buildPipelineProgress (HU-35/§11.9)", () => {
  it("covers every step the context requires, in pipeline order", () => {
    const steps = buildPipelineProgress({});

    expect(steps.map((step) => step.label)).toEqual([
      "Documento processado",
      "Queries de pesquisa geradas",
      "Candidatos encontrados",
      "Decisões selecionadas para análise profunda",
      "Scratchpads válidos",
      "Análise cruzada concluída",
      "Evidências verificadas na fonte oficial",
      "Relatório pronto",
    ]);
  });

  it("keeps pending steps visible instead of hiding them — the user needs to see where it stopped", () => {
    const steps = buildPipelineProgress({ documentParsed: true, queriesGenerated: 4 });

    expect(steps).toHaveLength(8);
    expect(steps.filter((step) => step.done)).toHaveLength(2);
    expect(steps.find((step) => step.label === "Relatório pronto")?.done).toBe(false);
  });

  it("exposes the counts each stage produced", () => {
    const steps = buildPipelineProgress({
      documentParsed: true,
      queriesGenerated: 4,
      candidatesFound: 30,
      decisionsSelected: 10,
      validScratchpads: 9,
      crossFileComplete: true,
      verifiedEvidences: 12,
      reportReady: true,
    });

    expect(steps.every((step) => step.done)).toBe(true);
    expect(steps.find((step) => step.label === "Scratchpads válidos")?.count).toBe(9);
    expect(steps.find((step) => step.label === "Candidatos encontrados")?.count).toBe(30);
  });

  it("treats zero as not done — an empty stage never counts as concluded", () => {
    const steps = buildPipelineProgress({ validScratchpads: 0, verifiedEvidences: 0 });

    expect(steps.find((step) => step.label === "Scratchpads válidos")?.done).toBe(false);
    expect(steps.find((step) => step.label === "Evidências verificadas na fonte oficial")?.done).toBe(
      false,
    );
  });
});
