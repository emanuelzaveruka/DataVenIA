import { describe, expect, it } from "vitest";
import { normalizeTjprKeywordQuery } from "../normalize-query";

describe("normalizeTjprKeywordQuery", () => {
  it("remove conectores e acentos para busca keyword no TJPR", () => {
    expect(normalizeTjprKeywordQuery("Plano de saúde")).toBe("plano saude");
    expect(normalizeTjprKeywordQuery("negativa de cobertura")).toBe("negativa cobertura");
  });

  it("preserva números e siglas jurídicas úteis", () => {
    expect(normalizeTjprKeywordQuery("Súmula 608 do STJ")).toBe("sumula 608 STJ");
    expect(normalizeTjprKeywordQuery("art. 51 do CDC")).toBe("art 51 CDC");
  });

  it("limita queries longas para não mandar texto grande ao portal", () => {
    expect(
      normalizeTjprKeywordQuery("negativa de cobertura de procedimento cirúrgico com prescrição médica urgente"),
    ).toBe("negativa cobertura procedimento cirurgico prescricao medica urgente");
  });
});
