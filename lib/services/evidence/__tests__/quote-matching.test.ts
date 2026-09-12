import { describe, expect, it } from "vitest";
import { matchQuote, normalizeForMatching, splitOnElisions } from "../quote-matching";

const SOURCE = `ACÓRDÃO. A negativa de cobertura do tratamento prescrito pelo médico assistente é abusiva,
nos termos da Súmula 608 do STJ. O mero inadimplemento contratual, contudo, não gera dano moral
indenizável, salvo circunstância excepcional demonstrada nos autos.`;

describe("normalizeForMatching", () => {
  it("ignores accents, case, curly quotes, dashes and line breaks", () => {
    expect(normalizeForMatching("É  “abusiva”\n— sim")).toBe('e "abusiva" - sim');
  });
});

describe("splitOnElisions", () => {
  it("splits a quote on the elision markers used in legal citation", () => {
    expect(splitOnElisions("a negativa [...] e abusiva")).toEqual(["a negativa", "e abusiva"]);
    expect(splitOnElisions("a negativa (...) e abusiva")).toEqual(["a negativa", "e abusiva"]);
    expect(splitOnElisions("a negativa … e abusiva")).toEqual(["a negativa", "e abusiva"]);
  });
});

describe("matchQuote", () => {
  it("confirms a literal quote (HU-24)", () => {
    const match = matchQuote(SOURCE, "O mero inadimplemento contratual, contudo, não gera dano moral indenizável");
    expect(match).toEqual({ kind: "EXACT", similarity: 1 });
  });

  it("confirms a quote that differs only in accents, case and line breaks", () => {
    const match = matchQuote(SOURCE, "NAO GERA DANO MORAL   INDENIZAVEL");
    expect(match.kind).toBe("EXACT");
  });

  it("confirms a quote with an elision, as long as the fragments appear in order", () => {
    const match = matchQuote(SOURCE, "A negativa de cobertura [...] é abusiva");
    expect(match.kind).toBe("ELIDED");
  });

  it("rejects an elided quote whose fragments appear in the wrong order", () => {
    const match = matchQuote(SOURCE, "não gera dano moral [...] A negativa de cobertura");
    expect(match.kind).toBe("NOT_FOUND");
  });

  it("accepts a near-literal quote with a single word off", () => {
    const match = matchQuote(
      SOURCE,
      "a negativa de cobertura do tratamento prescrito pelo medico assistente e abusiva nos termos da Sumula 608",
      0.9,
    );
    expect(match.kind).toBe("NEAR_LITERAL");
    expect(match.similarity).toBeGreaterThanOrEqual(0.9);
  });

  it("rejects a quote that was never in the decision, however plausible it sounds (HU-25)", () => {
    const match = matchQuote(SOURCE, "A operadora foi condenada ao pagamento de danos morais no valor de R$ 20.000,00");
    expect(match.kind).toBe("NOT_FOUND");
    expect(match.similarity).toBeLessThan(0.9);
  });

  it("rejects a distorted quote that inverts the meaning of the original", () => {
    const match = matchQuote(SOURCE, "O mero inadimplemento contratual, por si só, gera dano moral indenizável presumido e automático");
    expect(match.kind).toBe("NOT_FOUND");
  });

  it("treats an empty quote or empty source as not found", () => {
    expect(matchQuote(SOURCE, "   ").kind).toBe("NOT_FOUND");
    expect(matchQuote("", "qualquer coisa").kind).toBe("NOT_FOUND");
  });
});
