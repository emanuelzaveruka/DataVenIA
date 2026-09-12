import { describe, expect, it, vi } from "vitest";
import { createSupabaseRepository } from "../supabase-repository";
import { RUN_ID, documentRecord, runRecord, scratchpadRecord } from "./fixtures";
import { toRow } from "../row-mapping";

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(responder: (call: Call) => { status?: number; body?: unknown }) {
  const calls: Call[] = [];

  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);

    const { status = 200, body = [] } = responder(call);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;

  return { impl, calls };
}

function repositoryWith(responder: (call: Call) => { status?: number; body?: unknown }) {
  const { impl, calls } = fakeFetch(responder);
  const repository = createSupabaseRepository({
    url: "https://projeto.supabase.co",
    serviceRoleKey: "service-role-key",
    fetchImpl: impl,
  });
  return { repository, calls };
}

describe("createSupabaseRepository — protocolo", () => {
  it("writes to the PostgREST endpoint with snake_case columns and the service role key", async () => {
    const record = runRecord();
    const { repository, calls } = repositoryWith(() => ({ body: [toRow(record)] }));

    const result = await repository.createRun(record);

    expect(result.isError).toBe(false);
    expect(calls[0]!.url).toBe("https://projeto.supabase.co/rest/v1/analysis_runs");

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.apikey).toBe("service-role-key");
    expect(headers.Authorization).toBe("Bearer service-role-key");

    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body.run_id).toBe(RUN_ID);
    expect(body.pipeline_version).toBe("1.0.0");
    expect(body).not.toHaveProperty("runId");
  });

  it("keeps JSONB payloads untouched — converting their inner keys would break the domain schema", async () => {
    const record = scratchpadRecord();
    const { repository, calls } = repositoryWith(() => ({ body: [toRow(record)] }));

    await repository.saveScratchpad(record);

    const body = JSON.parse(String(calls[0]!.init.body)) as { content: Record<string, unknown> };
    expect(body.content).toHaveProperty("scratchpadId");
    expect(body.content).not.toHaveProperty("scratchpad_id");
  });

  it("reads a row back into the camelCase contract", async () => {
    const record = documentRecord();
    const { repository } = repositoryWith(() => ({ body: [toRow(record)] }));

    const result = await repository.getDocument("doc-1");

    expect(result.isError).toBe(false);
    if (!result.isError) expect(result.data).toEqual(record);
  });

  it("returns undefined — not an error — when the row does not exist", async () => {
    const { repository } = repositoryWith(() => ({ body: [] }));

    const result = await repository.getDocument("inexistente");

    expect(result.isError).toBe(false);
    if (!result.isError) expect(result.data).toBeUndefined();
  });
});

describe("createSupabaseRepository — contrato de erro (HU-32)", () => {
  it("classifies a 503 as retryable, deferring to the central classifier", async () => {
    const { repository } = repositoryWith(() => ({ status: 503, body: "unavailable" }));

    const result = await repository.createRun(runRecord());

    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("PERSISTENCE_REQUEST_FAILED");
      expect(result.error.isRetryable).toBe(true);
      expect(result.error.description).toContain("503");
      expect(result.error.userMessage).not.toBe(result.error.description);
    }
  });

  it("classifies a 401 as non-retryable", async () => {
    const { repository } = repositoryWith(() => ({ status: 401, body: "invalid key" }));

    const result = await repository.createRun(runRecord());

    expect(result.isError).toBe(true);
    if (result.isError) expect(result.error.isRetryable).toBe(false);
  });

  it("turns a transport failure into a retryable NETWORK error instead of throwing", async () => {
    const repository = createSupabaseRepository({
      url: "https://projeto.supabase.co",
      serviceRoleKey: "key",
      fetchImpl: (async () => {
        throw new Error("ECONNRESET");
      }) as unknown as typeof fetch,
    });

    const result = await repository.createRun(runRecord());

    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("PERSISTENCE_UNREACHABLE");
      expect(result.error.category).toBe("NETWORK");
      expect(result.error.isRetryable).toBe(true);
    }
  });

  it("rejects a persisted row that no longer matches the schema (§11.7 aplicado ao storage)", async () => {
    const { repository } = repositoryWith(() => ({ body: [{ document_id: "doc-1" }] }));

    const result = await repository.getDocument("doc-1");

    expect(result.isError).toBe(true);
    if (result.isError) expect(result.error.code).toBe("PERSISTED_ROW_INVALID");
  });

  it("reports a missing run on update instead of silently succeeding", async () => {
    const { repository } = repositoryWith(() => ({ body: [] }));

    const result = await repository.updateRun("inexistente", { status: "FAILED" });

    expect(result.isError).toBe(true);
    if (result.isError) expect(result.error.code).toBe("RUN_NOT_FOUND");
  });
});

describe("createSupabaseRepository — descarte (HU-06)", () => {
  it("deletes the run and lets the cascade remove the derived tables", async () => {
    const { repository, calls } = repositoryWith(() => ({ body: [toRow(runRecord())] }));

    const result = await repository.deleteRun(RUN_ID);

    expect(result.isError).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.init.method).toBe("DELETE");
    expect(calls[0]!.url).toContain("analysis_runs?run_id=eq.run-1");
    // Nenhuma chamada toca jurisprudence_decisions: o cache público sobrevive (HU-33).
    expect(calls.some((call) => call.url.includes("jurisprudence_decisions"))).toBe(false);
  });
});
