import { describe, expect, it } from "vitest";
import { getJurisprudenceProvider } from "../get-jurisprudence-provider";

describe("getJurisprudenceProvider", () => {
  it("defaults to fixture for offline demos and tests", () => {
    const provider = getJurisprudenceProvider({});

    expect(provider.name).toBe("fixture");
  });

  it("uses the real portal and nothing else when JURISPRUDENCE_PROVIDER=tjpr", () => {
    const provider = getJurisprudenceProvider({ JURISPRUDENCE_PROVIDER: "tjpr" });

    expect(provider.name).toBe("tjpr");
  });

  it("only composes the fixture fallback when it is asked for explicitly", () => {
    const provider = getJurisprudenceProvider({ JURISPRUDENCE_PROVIDER: "tjpr+fixture" });

    expect(provider.name).toBe("resilient(tjpr+fixture)");
  });

  it("rejects unknown provider names", () => {
    expect(() => getJurisprudenceProvider({ JURISPRUDENCE_PROVIDER: "cnj" })).toThrow(/JURISPRUDENCE_PROVIDER/);
  });
});
