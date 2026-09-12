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
    expect(steps.filter((step) => step.status === "DONE")).toHaveLength(2);
    expect(steps.find((step) => step.label === "Relatório pronto")?.status).toBe("PENDING");
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

    expect(steps.every((step) => step.status === "DONE")).toBe(true);
    expect(steps.find((step) => step.label === "Scratchpads válidos")?.count).toBe(9);
    expect(steps.find((step) => step.label === "Candidatos encontrados")?.count).toBe(30);
  });

  it("separates 'ran and produced nothing' from 'never got here'", () => {
    const steps = buildPipelineProgress({ validScratchpads: 0 });

    // A etapa rodou e devolveu zero: EMPTY, não DONE e não PENDING.
    expect(steps.find((step) => step.label === "Scratchpads válidos")?.status).toBe("EMPTY");
    // A etapa seguinte nem foi tentada.
    expect(steps.find((step) => step.label === "Evidências verificadas na fonte oficial")?.status).toBe(
      "PENDING",
    );
  });

  it("never counts an empty stage as concluded", () => {
    const steps = buildPipelineProgress({ validScratchpads: 0, verifiedEvidences: 0 });

    expect(steps.some((step) => step.status === "DONE")).toBe(false);
  });

  it("marks the first unfinished step as FAILED when the run ended in error", () => {
    const steps = buildPipelineProgress({
      documentParsed: true,
      queriesGenerated: 4,
      candidatesFound: 12,
      failed: true,
    });

    expect(steps.map((step) => step.status)).toEqual([
      "DONE",
      "DONE",
      "DONE",
      "FAILED",
      "PENDING",
      "PENDING",
      "PENDING",
      "PENDING",
    ]);
  });

  it("fails the empty step rather than the pending one after it", () => {
    const steps = buildPipelineProgress({ documentParsed: true, queriesGenerated: 0, failed: true });

    expect(steps.find((step) => step.label === "Queries de pesquisa geradas")?.status).toBe("FAILED");
    expect(steps.find((step) => step.label === "Candidatos encontrados")?.status).toBe("PENDING");
  });

  it("leaves a fully successful run untouched even if failed is false", () => {
    const steps = buildPipelineProgress({
      documentParsed: true,
      queriesGenerated: 4,
      candidatesFound: 30,
      decisionsSelected: 10,
      validScratchpads: 9,
      crossFileComplete: true,
      verifiedEvidences: 12,
      reportReady: true,
      failed: false,
    });

    expect(steps.every((step) => step.status === "DONE")).toBe(true);
  });
});
