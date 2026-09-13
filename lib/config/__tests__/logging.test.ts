import { describe, expect, it } from "vitest";
import { getLogLevel, logsCalls, logsStages } from "../logging";

describe("getLogLevel", () => {
  it("liga o log de etapas fora de produção e o desliga em produção", () => {
    expect(getLogLevel({ NODE_ENV: "development" })).toBe("stages");
    expect(getLogLevel({ NODE_ENV: "test" })).toBe("stages");
    expect(getLogLevel({ NODE_ENV: "production" })).toBe("off");
  });

  it("aceita os três níveis, com espaço e caixa livres", () => {
    expect(getLogLevel({ PIPELINE_LOG: "off" })).toBe("off");
    expect(getLogLevel({ PIPELINE_LOG: " CALLS " })).toBe("calls");
    expect(getLogLevel({ PIPELINE_LOG: "stages", NODE_ENV: "production" })).toBe("stages");
  });

  it("recusa valor inválido em vez de voltar para off em silêncio", () => {
    // Mesma postura de `getAuditLevel`: quem escreveu `PIPELINE_LOG=1` esperando log precisa saber
    // que não vai receber nenhum, em vez de rodar a execução inteira no escuro achando que está.
    expect(() => getLogLevel({ PIPELINE_LOG: "1" })).toThrow(/PIPELINE_LOG inválido/);
  });

  it("separa o que cada nível habilita", () => {
    expect(logsStages("off")).toBe(false);
    expect(logsStages("stages")).toBe(true);
    expect(logsCalls("stages")).toBe(false);
    expect(logsCalls("calls")).toBe(true);
  });
});
