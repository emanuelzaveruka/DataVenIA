import { describe, expect, it } from "vitest";
import { createInMemoryRepository } from "../in-memory-repository";
import {
  RUN_ID,
  caseAnalysisRecord,
  crossFileRecord,
  decisionRecord,
  documentRecord,
  errorRecord,
  evidenceRecord,
  reportRecord,
  runRecord,
  scratchpadRecord,
  searchRecord,
  toolExecutionLog,
} from "./fixtures";
import type { DataVeniaRepository } from "../repository";

async function seedFullRun(): Promise<DataVeniaRepository> {
  const repository = createInMemoryRepository();

  await repository.createRun(runRecord());
  await repository.saveDocument(documentRecord());
  await repository.saveCaseAnalysis(caseAnalysisRecord());
  await repository.saveSearch(searchRecord());
  await repository.saveDecision(decisionRecord());
  await repository.saveScratchpad(scratchpadRecord());
  await repository.saveCrossFileAnalyses([crossFileRecord()]);
  await repository.saveEvidences([evidenceRecord()]);
  await repository.saveReport(reportRecord());
  await repository.saveToolExecution(toolExecutionLog());
  await repository.saveError(errorRecord());

  return repository;
}

describe("createInMemoryRepository — reconstrução de execução (HU-34)", () => {
  it("reconstructs every pipeline step of a finished run", async () => {
    const repository = await seedFullRun();

    const snapshot = await repository.loadRun(RUN_ID);

    expect(snapshot.isError).toBe(false);
    if (snapshot.isError || !snapshot.data) throw new Error("snapshot ausente");

    // Critério de aceite de HU-34: documento → case analysis → buscas → decisões → scratchpads →
    // cross-file → evidências → relatório, tudo recuperável a partir do storage.
    expect(snapshot.data.document?.documentId).toBe("doc-1");
    expect(snapshot.data.caseAnalysis?.content.legalIssues).toHaveLength(1);
    expect(snapshot.data.searches).toHaveLength(1);
    expect(snapshot.data.decisions).toHaveLength(1);
    expect(snapshot.data.scratchpads).toHaveLength(1);
    expect(snapshot.data.crossFileAnalyses).toHaveLength(1);
    expect(snapshot.data.evidences).toHaveLength(1);
    expect(snapshot.data.report?.reportId).toBe("report-1");
    expect(snapshot.data.toolExecutions).toHaveLength(1);
    expect(snapshot.data.errors).toHaveLength(1);
  });

  it("returns undefined for a run that does not exist, instead of an empty snapshot", async () => {
    const repository = createInMemoryRepository();
    const snapshot = await repository.loadRun("inexistente");

    expect(snapshot.isError).toBe(false);
    if (!snapshot.isError) expect(snapshot.data).toBeUndefined();
  });

  it("only brings the decisions the run actually used, not the whole public cache", async () => {
    const repository = await seedFullRun();
    await repository.saveDecision(decisionRecord({ sourceId: "fixture-999" }));

    const snapshot = await repository.loadRun(RUN_ID);
    if (snapshot.isError || !snapshot.data) throw new Error("snapshot ausente");

    expect(snapshot.data.decisions.map((row) => row.sourceId)).toEqual(["fixture-001"]);
  });

  it("fails with the single error contract when updating an unknown run (HU-32)", async () => {
    const repository = createInMemoryRepository();
    const result = await repository.updateRun("inexistente", { status: "FAILED" });

    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("RUN_NOT_FOUND");
      expect(result.error.category).toBe("NOT_FOUND");
      expect(result.error.isRetryable).toBe(false);
    }
  });
});

describe("createInMemoryRepository — descarte de sessão (HU-06)", () => {
  it("deletes everything that belongs to the run", async () => {
    const repository = await seedFullRun();

    const removed = await repository.deleteRun(RUN_ID);
    expect(removed.isError).toBe(false);

    const snapshot = await repository.loadRun(RUN_ID);
    if (snapshot.isError) throw new Error("erro inesperado");
    expect(snapshot.data).toBeUndefined();

    const document = await repository.getDocument("doc-1");
    if (document.isError) throw new Error("erro inesperado");
    expect(document.data).toBeUndefined();
  });

  it("keeps public jurisprudence after the session is discarded — it is the HU-33 cache", async () => {
    const repository = await seedFullRun();

    await repository.deleteRun(RUN_ID);

    const decision = await repository.findDecision("fixture", "fixture-001");
    expect(decision.isError).toBe(false);
    if (!decision.isError) expect(decision.data?.sourceId).toBe("fixture-001");
  });
});

describe("createInMemoryRepository — cache de Scratchpad (HU-33)", () => {
  it("finds a scratchpad by idempotency key", async () => {
    const repository = createInMemoryRepository();
    await repository.createRun(runRecord());
    await repository.saveScratchpad(scratchpadRecord({ idempotencyKey: "key-1" }));

    const found = await repository.findScratchpadByIdempotencyKey("key-1");
    expect(found.isError).toBe(false);
    if (!found.isError) expect(found.data?.scratchpadId).toBe("SP-1");
  });

  it("does not find it under a different key — a version bump simply misses the cache", async () => {
    const repository = createInMemoryRepository();
    await repository.createRun(runRecord());
    await repository.saveScratchpad(scratchpadRecord({ idempotencyKey: "key-1" }));

    const found = await repository.findScratchpadByIdempotencyKey("key-outra-versao");
    expect(found.isError).toBe(false);
    if (!found.isError) expect(found.data).toBeUndefined();
  });
});

describe("createInMemoryRepository — privacidade (HU-05/HU-34)", () => {
  it("has nowhere to store the raw document text: the record only carries sanitized content", async () => {
    const repository = createInMemoryRepository();
    await repository.createRun(runRecord());

    const record = documentRecord();
    await repository.saveDocument(record);

    const stored = await repository.getDocument("doc-1");
    if (stored.isError || !stored.data) throw new Error("documento ausente");

    expect(Object.keys(stored.data)).not.toContain("text");
    expect(Object.keys(stored.data)).not.toContain("rawText");
    expect(stored.data.sanitizedText).toContain("[CPF_1]");
    expect(JSON.stringify(stored.data)).not.toContain("123.456.789-00");
  });
});
