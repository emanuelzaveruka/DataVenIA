import { describe, expect, it } from "vitest";
import { getJurisprudenceProvider } from "../get-jurisprudence-provider";

describe("getJurisprudenceProvider", () => {
  it("defaults to fixture for offline demos and tests", () => {
    const provider = getJurisprudenceProvider({});

    expect(provider.name).toBe("fixture");
  });

  it("uses TJPR as primary when configured, with visible fixture fallback", async () => {
    const provider = getJurisprudenceProvider({ JURISPRUDENCE_PROVIDER: "tjpr" });

    expect(provider.name).toBe("resilient(tjpr+fixture)");
  });

  it("rejects unknown provider names", () => {
    expect(() => getJurisprudenceProvider({ JURISPRUDENCE_PROVIDER: "cnj" })).toThrow(/JURISPRUDENCE_PROVIDER/);
  });
});
