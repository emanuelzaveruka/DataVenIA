import { describe, expect, it } from "vitest";
import { createPipelineLogger } from "../pipeline-logger";

function loggerCapturing(level: "off" | "stages" | "calls") {
  const lines: string[] = [];
  const logger = createPipelineLogger({
    runId: "1a2b3c4d-0000-0000-0000-000000000000",
    level,
    write: (line) => lines.push(line),
  });
  return { logger, lines };
}

describe("createPipelineLogger", () => {
  it("não escreve nada no nível off", () => {
    const { logger, lines } = loggerCapturing("off");

    logger.runStarted("trace");
    logger.stageStarted("08. Extraction Scratchpads");
    logger.stageProgress("08. Extraction Scratchpads", { processed: 1 });
    logger.stageFinished("08. Extraction Scratchpads", true, 1000);

    expect(lines).toEqual([]);
  });

  it("resume o progresso de uma etapa longa em uma linha por atualização", () => {
    const { logger, lines } = loggerCapturing("stages");

    logger.stageProgress("08. Extraction Scratchpads", {
      total: 60,
      processed: 12,
      failed: 1,
      lastErrorCode: "STRUCTURED_OUTPUT_MISSING",
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("[run 1a2b3c4d]");
    expect(lines[0]).toContain("08. Extraction Scratchpads");
    expect(lines[0]).toContain("processed=12");
    expect(lines[0]).toContain("lastErrorCode=STRUCTURED_OUTPUT_MISSING");
  });

  it("deixa de fora o artefato inteiro que o modo auditoria carrega no mesmo campo", () => {
    const { logger, lines } = loggerCapturing("stages");

    logger.stageFinished("07. Busca", true, 2500, {
      totalFound: 42,
      ranked: [{ id: "a" }, { id: "b" }],
      textoEnorme: "x".repeat(500),
    });

    expect(lines[0]).toContain("totalFound=42");
    expect(lines[0]).not.toContain("ranked");
    expect(lines[0]).not.toContain("xxxxx");
  });

  it("só registra chamadas de modelo no nível calls", () => {
    const call = {
      callIndex: 2,
      schemaName: "DecisionScratchpadContent",
      provider: "openai",
      model: "gpt-5-nano",
      system: "s",
      prompt: "p",
      durationMs: 8300,
      outcome: "ERROR" as const,
      errorCode: "STRUCTURED_OUTPUT_MISSING",
    };

    const stages = loggerCapturing("stages");
    stages.logger.llmCall(call);
    expect(stages.lines).toEqual([]);
    expect(stages.logger.logsCalls).toBe(false);

    const calls = loggerCapturing("calls");
    calls.logger.llmCall(call);
    expect(calls.logger.logsCalls).toBe(true);
    expect(calls.lines[0]).toContain("DecisionScratchpadContent");
    expect(calls.lines[0]).toContain("STRUCTURED_OUTPUT_MISSING");
    expect(calls.lines[0]).toContain("8.3s");
  });

  it("nunca deixa uma falha de escrita derrubar a execução", () => {
    const logger = createPipelineLogger({
      runId: "1a2b3c4d",
      level: "stages",
      write: () => {
        throw new Error("terminal fechado");
      },
    });

    expect(() => logger.stageStarted("08. Extraction Scratchpads")).not.toThrow();
  });
});
