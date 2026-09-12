import { describe, expect, it } from "vitest";
import { selectEvidenceTargets } from "../select-evidence-targets";
import { crossFileAnalysis, scratchpadFor } from "./fixtures";

function sp(id: string, evidenceId: string, distinguishing: string[] = []) {
  return scratchpadFor(id, `fixture-${id}`, "Texto da decisão.", [
    { id: evidenceId, quote: "trecho", context: "contexto", purpose: "finalidade" },
  ], { distinguishingFacts: distinguishing });
}

const scratchpads = [sp("SP-1", "EV-1"), sp("SP-2", "EV-2"), sp("SP-3", "EV-3", ["Contrato coletivo, não individual"]), sp("SP-4", "EV-4")];

describe("selectEvidenceTargets", () => {
  it("reopens first the decisions whose quotes back risks and arguments (HU-25)", () => {
    const analysis = crossFileAnalysis({
      supportingDecisions: ["SP-1", "SP-4"],
      opposingDecisions: ["SP-2"],
      mixedDecisions: ["SP-3"],
      strongestSupporting: ["SP-4"],
      strongestOpposing: ["SP-2"],
      risks: [{ description: "Risco.", evidenceIds: ["EV-3"] }],
      suggestedArguments: [{ argument: "Argumento.", evidenceIds: ["EV-1"] }],
    });

    const selected = selectEvidenceTargets([analysis], scratchpads, 2);

    expect(selected.map((scratchpad) => scratchpad.scratchpadId)).toEqual(["SP-3", "SP-1"]);
  });

  it("respects finalEvidenceLimit (§6) and never repeats a decision", () => {
    const analysis = crossFileAnalysis({
      supportingDecisions: ["SP-1", "SP-3", "SP-4"],
      opposingDecisions: ["SP-2"],
      strongestSupporting: ["SP-1", "SP-3"],
      strongestOpposing: ["SP-2"],
      risks: [{ description: "Risco.", evidenceIds: ["EV-1"] }],
      suggestedArguments: [{ argument: "Argumento.", evidenceIds: ["EV-1"] }],
    });

    const selected = selectEvidenceTargets([analysis], scratchpads, 3);

    expect(selected).toHaveLength(3);
    expect(new Set(selected.map((scratchpad) => scratchpad.scratchpadId)).size).toBe(3);
  });

  it("includes a distinguishing precedent before the remaining ones (§3.9)", () => {
    const analysis = crossFileAnalysis({
      supportingDecisions: ["SP-1", "SP-4"],
      opposingDecisions: [],
      mixedDecisions: ["SP-3"],
      strongestSupporting: ["SP-1"],
      strongestOpposing: [],
      risks: [{ description: "Risco.", evidenceIds: ["EV-1"] }],
      suggestedArguments: [{ argument: "Argumento.", evidenceIds: ["EV-1"] }],
    });

    const selected = selectEvidenceTargets([analysis], scratchpads, 2);

    expect(selected.map((scratchpad) => scratchpad.scratchpadId)).toEqual(["SP-1", "SP-3"]);
  });

  it("ignores ids with no matching scratchpad instead of throwing", () => {
    const analysis = crossFileAnalysis({
      supportingDecisions: ["SP-DESCONHECIDO"],
      opposingDecisions: ["SP-2"],
      strongestSupporting: [],
      strongestOpposing: ["SP-2"],
      risks: [{ description: "Risco.", evidenceIds: ["EV-2"] }],
      suggestedArguments: [{ argument: "Argumento.", evidenceIds: ["EV-2"] }],
    });

    const selected = selectEvidenceTargets([analysis], scratchpads);

    expect(selected.map((scratchpad) => scratchpad.scratchpadId)).toEqual(["SP-2"]);
  });
});
