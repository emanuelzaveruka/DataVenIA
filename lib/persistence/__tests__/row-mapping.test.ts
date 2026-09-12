import { describe, expect, it } from "vitest";
import { fromRow, toCamelCase, toRow, toSnakeCase } from "../row-mapping";

describe("row-mapping", () => {
  it("converts between the TS contract and Postgres column names", () => {
    expect(toSnakeCase("idempotencyKey")).toBe("idempotency_key");
    expect(toCamelCase("idempotency_key")).toBe("idempotencyKey");
  });

  it("round-trips a record", () => {
    const record = { runId: "run-1", pipelineVersion: "1.0.0", totalCount: 9 };
    expect(fromRow(toRow(record))).toEqual(record);
  });

  it("never rewrites keys inside a JSONB payload", () => {
    const row = toRow({ runId: "run-1", content: { legalIssueId: "LI-1", suggestedArguments: [] } });

    expect(row.run_id).toBe("run-1");
    expect(row.content).toEqual({ legalIssueId: "LI-1", suggestedArguments: [] });
  });

  it("drops undefined on write and null on read, so optional fields stay optional", () => {
    expect(toRow({ runId: "run-1", judge: undefined })).toEqual({ run_id: "run-1" });
    expect(fromRow({ run_id: "run-1", judge: null })).toEqual({ runId: "run-1" });
  });
});
