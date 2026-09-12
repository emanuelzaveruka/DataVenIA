import { describe, expect, it } from "vitest";
import { buildTrend, buildTrendSummary, classifyConvergence } from "../trend";

describe("buildTrendSummary", () => {
  it("expresses the trend as absolute counts, exactly as §3.10 exemplifies", () => {
    expect(buildTrendSummary({ supportingCount: 6, opposingCount: 3, mixedCount: 1 })).toBe(
      "6 de 10 decisões analisadas sustentam a tese, 3 contrárias, 1 mista.",
    );
  });

  it("agrees in number when there is a single decision on a side", () => {
    expect(buildTrendSummary({ supportingCount: 1, opposingCount: 1, mixedCount: 2 })).toBe(
      "1 de 4 decisões analisadas sustentam a tese, 1 contrária, 2 mistas.",
    );
  });

  it("never produces a percentage or a chance-of-winning figure (HU-26)", () => {
    const summary = buildTrendSummary({ supportingCount: 9, opposingCount: 1, mixedCount: 0 });
    expect(summary).not.toMatch(/%/);
    expect(summary.toLowerCase()).not.toContain("chance");
  });

  it("says plainly when nothing was analyzed", () => {
    expect(buildTrendSummary({ supportingCount: 0, opposingCount: 0, mixedCount: 0 })).toContain("Nenhuma decisão");
  });
});

describe("classifyConvergence", () => {
  it("reports a small sample as insufficient instead of inferring a trend (§3.10)", () => {
    expect(classifyConvergence({ supportingCount: 2, opposingCount: 1, mixedCount: 0 })).toBe("AMOSTRA_INSUFICIENTE");
  });

  it("classifies a dominant majority as high convergence", () => {
    expect(classifyConvergence({ supportingCount: 8, opposingCount: 1, mixedCount: 1 })).toBe("ALTA");
  });

  it("classifies a clear but not dominant majority as moderate", () => {
    expect(classifyConvergence({ supportingCount: 6, opposingCount: 3, mixedCount: 1 })).toBe("MODERADA");
  });

  it("classifies an even split as divided jurisprudence, never picking a side", () => {
    expect(classifyConvergence({ supportingCount: 5, opposingCount: 5, mixedCount: 0 })).toBe("DIVIDIDA");
    expect(classifyConvergence({ supportingCount: 4, opposingCount: 4, mixedCount: 2 })).toBe("DIVIDIDA");
  });

  it("keeps the internal thresholds out of the exposed trend object", () => {
    const trend = buildTrend({ supportingCount: 6, opposingCount: 3, mixedCount: 1 });
    expect(Object.keys(trend)).toEqual([
      "analyzedCount",
      "supportingCount",
      "opposingCount",
      "mixedCount",
      "summary",
      "convergence",
    ]);
  });
});
