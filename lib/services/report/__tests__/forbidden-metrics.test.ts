import { describe, expect, it } from "vitest";
import { containsForbiddenMetric } from "../forbidden-metrics";

describe("containsForbiddenMetric", () => {
  it("blocks the exact anti-pattern named in §3.10", () => {
    expect(containsForbiddenMetric("Há 83% de chance de ganhar a demanda.").blocked).toBe(true);
  });

  it("blocks probability language even without a number", () => {
    expect(containsForbiddenMetric("A chance de êxito é elevada.").blocked).toBe(true);
    expect(containsForbiddenMetric("Alta probabilidade de procedência do pedido.").blocked).toBe(true);
  });

  it("blocks a percentage tied to a procedural outcome", () => {
    expect(containsForbiddenMetric("Estima-se 70% de sucesso no recurso.").blocked).toBe(true);
  });

  it("does NOT block a percentage that is legitimate case content", () => {
    expect(containsForbiddenMetric("O reajuste de 30% por faixa etária foi reputado abusivo.").blocked).toBe(false);
    expect(containsForbiddenMetric("Juros de 1% ao mês desde a citação.").blocked).toBe(false);
  });

  it("does NOT block a qualitative convergence statement (the allowed alternative)", () => {
    expect(containsForbiddenMetric("Alta convergência jurisprudencial na 9ª Câmara Cível.").blocked).toBe(false);
    expect(containsForbiddenMetric("6 de 10 decisões analisadas sustentam a tese.").blocked).toBe(false);
  });

  it("ignores accents and case, and reports what triggered the block", () => {
    const check = containsForbiddenMetric("CHANCES DE VITORIA ACIMA DA MEDIA");
    expect(check.blocked).toBe(true);
    expect(check.matched).toContain("vitoria");
  });
});
