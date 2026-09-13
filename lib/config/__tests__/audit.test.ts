import { describe, expect, it } from "vitest";
import { auditsArtifacts, auditsRawText, getAuditLevel } from "../audit";

describe("getAuditLevel", () => {
  it("é desligado por padrão, inclusive com a variável vazia", () => {
    expect(getAuditLevel({})).toBe("off");
    expect(getAuditLevel({ PIPELINE_AUDIT: "   " })).toBe("off");
  });

  it("aceita os níveis conhecidos, sem se importar com caixa ou espaço", () => {
    expect(getAuditLevel({ PIPELINE_AUDIT: "Artifacts" })).toBe("artifacts");
    expect(getAuditLevel({ PIPELINE_AUDIT: " full " })).toBe("full");
  });

  it("recusa valor inválido em vez de cair para off", () => {
    // Quem escreveu `PIPELINE_AUDIT=1` esperando artefatos precisa saber agora, e não depois de uma
    // execução inteira sem eles.
    expect(() => getAuditLevel({ PIPELINE_AUDIT: "1" })).toThrow(/PIPELINE_AUDIT inválido/);
  });

  it("separa artefatos estruturados do texto anterior à sanitização", () => {
    expect(auditsArtifacts("artifacts")).toBe(true);
    expect(auditsRawText("artifacts")).toBe(false);
    expect(auditsRawText("full")).toBe(true);
    expect(auditsArtifacts("off")).toBe(false);
  });
});
