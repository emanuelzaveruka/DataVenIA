import { describe, expect, it, vi } from "vitest";
import { postToolUse } from "../post-tool-use";
import { preToolUse, STAGE_TOOL_ALLOWLIST, type ToolName } from "../pre-tool-use";
import { createGuardedExecution } from "../guarded-execution";
import { createExecutionRecorder } from "../../observability/execution-recorder";
import { toolFailure, toolSuccess } from "../../errors/tool-result";
import { createAppError } from "../../errors/app-error";
import type { WorkflowStage } from "../../workflow/state-machine";

const failure = toolFailure(
  createAppError({
    code: "UPSTREAM_UNAVAILABLE",
    category: "UPSTREAM",
    severity: "ERROR",
    description: "TJPR responded 503",
    isRetryable: true,
  }),
);

describe("preToolUse (HU-31)", () => {
  it("blocks a tool that does not belong to the current stage", () => {
    expect(() =>
      preToolUse({ stage: "REPORT_GENERATION", toolName: "searchJurisprudence" }),
    ).toThrow();
  });

  it("allows a tool inside the stage allowlist", () => {
    expect(() => preToolUse({ stage: "SEARCH", toolName: "searchJurisprudence" })).not.toThrow();
  });

  it("keeps the route-level pipeline tools allowlisted in their execution stage", () => {
    const expected: Record<ToolName, WorkflowStage> = {
      validateFile: "DOCUMENT_ANALYSIS",
      parseDocument: "DOCUMENT_ANALYSIS",
      sanitizeDocument: "DOCUMENT_ANALYSIS",
      analyzeCase: "DOCUMENT_ANALYSIS",
      generateSearchQueries: "QUERY_GENERATION",
      searchJurisprudence: "SEARCH",
      generateScratchpads: "SCRATCHPAD_GENERATION",
      analyzeCrossFile: "CROSS_FILE_ANALYSIS",
      verifyEvidence: "EVIDENCE_VERIFICATION",
      buildReport: "REPORT_GENERATION",
    };

    for (const [toolName, stage] of Object.entries(expected) as [ToolName, WorkflowStage][]) {
      expect(STAGE_TOOL_ALLOWLIST[stage]).toContain(toolName);
    }
  });
});

describe("postToolUse — telemetria (HU-31/HU-35)", () => {
  it("records one execution log per call when a recorder is given", () => {
    const recorder = createExecutionRecorder({ traceId: "trace-1", workflowId: "run-1" });

    postToolUse(toolSuccess({ ok: true }), {
      stage: "DOCUMENT_ANALYSIS",
      toolName: "validateFile",
      recorder,
    });

    expect(recorder.logs).toHaveLength(1);
    expect(recorder.logs[0]).toMatchObject({
      traceId: "trace-1",
      workflowId: "run-1",
      toolName: "validateFile",
      success: true,
    });
  });

  it("takes the log identity from the recorder, never from the caller", () => {
    const recorder = createExecutionRecorder({ traceId: "trace-9", workflowId: "run-9" });

    postToolUse(failure, { stage: "SEARCH", toolName: "searchJurisprudence", recorder });

    expect(recorder.logs[0]!.traceId).toBe("trace-9");
    expect(recorder.logs[0]!.workflowId).toBe("run-9");
    expect(recorder.logs[0]!.errorCode).toBe("UPSTREAM_UNAVAILABLE");
    expect(recorder.logs[0]!.isRetryable).toBe(true);
  });

  it("still logs to the console when there is no recorder, so a failure is never silent", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    postToolUse(failure, { stage: "SEARCH", toolName: "searchJurisprudence" });

    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("returns the result unchanged in both paths", () => {
    const recorder = createExecutionRecorder({ traceId: "trace-1", workflowId: "run-1" });
    const success = toolSuccess({ value: 1 });

    expect(postToolUse(success, { stage: "SEARCH", toolName: "fetchDecision", recorder })).toBe(
      success,
    );
    expect(postToolUse(success, { stage: "SEARCH", toolName: "fetchDecision" })).toBe(success);
  });
});

describe("createGuardedExecution (HU-31)", () => {
  it("executes and records a tool allowed in the current stage", async () => {
    const recorder = createExecutionRecorder({ traceId: "trace-1", workflowId: "run-1" });
    const guarded = createGuardedExecution({
      getStage: () => "DOCUMENT_ANALYSIS",
      recorder,
    });
    const operation = vi.fn(async () => toolSuccess({ ok: true }));

    const result = await guarded.run("validateFile", operation);

    expect(result.isError).toBe(false);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(recorder.logs).toHaveLength(1);
    expect(recorder.logs[0]).toMatchObject({ toolName: "validateFile", success: true });
  });

  it("blocks a tool outside the current stage before running the operation", async () => {
    const recorder = createExecutionRecorder({ traceId: "trace-2", workflowId: "run-2" });
    const onBlockedTool = vi.fn();
    const guarded = createGuardedExecution({
      getStage: () => "REPORT_GENERATION",
      recorder,
      onBlockedTool,
    });
    const operation = vi.fn(async () => toolSuccess({ leaked: true }));

    const result = await guarded.run("searchJurisprudence", operation);

    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("INVALID_TOOL_FOR_STAGE");
      expect(result.error.isRetryable).toBe(false);
    }
    expect(operation).not.toHaveBeenCalled();
    expect(onBlockedTool).toHaveBeenCalledTimes(1);
    expect(recorder.logs).toHaveLength(1);
    expect(recorder.logs[0]).toMatchObject({
      toolName: "searchJurisprudence",
      success: false,
      errorCode: "INVALID_TOOL_FOR_STAGE",
    });
  });
});
