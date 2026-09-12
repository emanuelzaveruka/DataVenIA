import { describe, expect, it, vi } from "vitest";
import { createExecutionRecorder } from "../execution-recorder";
import { toolFailure, toolSuccess } from "../../errors/tool-result";
import { createAppError } from "../../errors/app-error";
import type { ToolExecutionLog } from "../../schemas/persistence.schema";

const upstreamError = createAppError({
  code: "UPSTREAM_UNAVAILABLE",
  category: "UPSTREAM",
  severity: "ERROR",
  description: "TJPR responded 503",
  isRetryable: true,
  operation: "searchJurisprudence",
});

describe("createExecutionRecorder (HU-35/§11.9)", () => {
  it("records one log per tool call, with duration and success", async () => {
    const recorder = createExecutionRecorder({ traceId: "trace-1", workflowId: "run-1" });

    await recorder.run("validateFile", async () => toolSuccess({ ok: true }));

    expect(recorder.logs).toHaveLength(1);
    expect(recorder.logs[0]).toMatchObject({
      traceId: "trace-1",
      workflowId: "run-1",
      toolName: "validateFile",
      attempt: 1,
      success: true,
    });
    expect(recorder.logs[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("counts attempts per tool, so retries are reconstructable", async () => {
    const recorder = createExecutionRecorder({ traceId: "trace-1", workflowId: "run-1" });

    await recorder.run("searchJurisprudence", async () => toolFailure(upstreamError));
    await recorder.run("searchJurisprudence", async () => toolFailure(upstreamError));
    await recorder.run("searchJurisprudence", async () => toolSuccess({ items: [] }));

    expect(recorder.logs.map((log) => log.attempt)).toEqual([1, 2, 3]);
    expect(recorder.logs.map((log) => log.success)).toEqual([false, false, true]);
  });

  it("carries errorCode and isRetryable from the single error contract (HU-32)", async () => {
    const recorder = createExecutionRecorder({ traceId: "trace-1", workflowId: "run-1" });

    await recorder.run("searchJurisprudence", async () => toolFailure(upstreamError));

    expect(recorder.logs[0]!.errorCode).toBe("UPSTREAM_UNAVAILABLE");
    expect(recorder.logs[0]!.isRetryable).toBe(true);
  });

  it("keeps traceId and workflowId consistent across every tool of the run (validação de HU-35)", async () => {
    const recorder = createExecutionRecorder({ traceId: "trace-1", workflowId: "run-1" });

    await recorder.run("validateFile", async () => toolSuccess(1));
    await recorder.run("parseDocument", async () => toolSuccess(2));
    await recorder.run("sanitizeDocument", async () => toolSuccess(3));

    expect(new Set(recorder.logs.map((log) => log.traceId))).toEqual(new Set(["trace-1"]));
    expect(new Set(recorder.logs.map((log) => log.workflowId))).toEqual(new Set(["run-1"]));
    expect(recorder.logs.map((log) => log.toolName)).toEqual([
      "validateFile",
      "parseDocument",
      "sanitizeDocument",
    ]);
  });

  it("forwards each log to the sink that persists it", async () => {
    const sink = vi.fn<(log: ToolExecutionLog) => void>();
    const recorder = createExecutionRecorder({ traceId: "trace-1", workflowId: "run-1", sink });

    await recorder.run("validateFile", async () => toolSuccess(1));

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0]![0]!.toolName).toBe("validateFile");
  });

  it("never lets a failing sink break the pipeline — telemetry is not worth losing the analysis", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const recorder = createExecutionRecorder({
      traceId: "trace-1",
      workflowId: "run-1",
      sink: () => {
        throw new Error("banco fora do ar");
      },
    });

    const result = await recorder.run("validateFile", async () => toolSuccess({ ok: true }));

    expect(result.isError).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns the tool result unchanged", async () => {
    const recorder = createExecutionRecorder({ traceId: "trace-1", workflowId: "run-1" });

    const result = await recorder.run("validateFile", async () => toolSuccess({ value: 42 }));

    expect(result.isError).toBe(false);
    if (!result.isError) expect(result.data).toEqual({ value: 42 });
  });
});
