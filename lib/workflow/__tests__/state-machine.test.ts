import { describe, expect, it } from "vitest";
import { Workflow } from "../state-machine";

describe("Workflow state machine", () => {
  it("advances stage by stage in order", () => {
    const workflow = new Workflow();
    workflow.advanceTo("QUERY_GENERATION");
    expect(workflow.getCurrentStage()).toBe("QUERY_GENERATION");
  });

  it("rejects skipping stages", () => {
    const workflow = new Workflow();
    expect(() => workflow.advanceTo("SEARCH")).toThrow();
  });

  it("blocks CROSS_FILE_ANALYSIS without enough valid scratchpads", () => {
    const workflow = new Workflow();
    workflow.advanceTo("QUERY_GENERATION");
    workflow.advanceTo("SEARCH");
    workflow.advanceTo("SCRATCHPAD_GENERATION");
    expect(() =>
      workflow.advanceTo("CROSS_FILE_ANALYSIS", {
        minValidScratchpads: 3,
        validScratchpadCount: 1,
      }),
    ).toThrow();
  });

  it("allows CROSS_FILE_ANALYSIS once enough valid scratchpads exist", () => {
    const workflow = new Workflow();
    workflow.advanceTo("QUERY_GENERATION");
    workflow.advanceTo("SEARCH");
    workflow.advanceTo("SCRATCHPAD_GENERATION");
    workflow.advanceTo("CROSS_FILE_ANALYSIS", { minValidScratchpads: 3, validScratchpadCount: 3 });
    expect(workflow.getCurrentStage()).toBe("CROSS_FILE_ANALYSIS");
  });

  it("blocks REPORT_GENERATION when evidence has not been verified", () => {
    const workflow = new Workflow();
    workflow.advanceTo("QUERY_GENERATION");
    workflow.advanceTo("SEARCH");
    workflow.advanceTo("SCRATCHPAD_GENERATION");
    workflow.advanceTo("CROSS_FILE_ANALYSIS", { minValidScratchpads: 3, validScratchpadCount: 3 });
    workflow.advanceTo("EVIDENCE_VERIFICATION");
    expect(() => workflow.advanceTo("REPORT_GENERATION", { evidenceVerified: false })).toThrow();
  });
});
