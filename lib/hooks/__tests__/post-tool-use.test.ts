import { describe, expect, it, vi } from "vitest";
import { postToolUse } from "../post-tool-use";
import { preToolUse } from "../pre-tool-use";
import { createExecutionRecorder } from "../../observability/execution-recorder";
import { toolFailure, toolSuccess } from "../../errors/tool-result";
import { createAppError } from "../../errors/app-error";

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
