import { describe, expect, it } from "vitest";
import { createFixtureProvider } from "../fixture";
import { FIXTURE_SEARCH_ITEMS } from "../fixtures/tjpr-demo-case";

describe("FixtureProvider (HU-37)", () => {
  it("returns items with a populated official source url and source=TJPR", async () => {
    const provider = createFixtureProvider();

    const result = await provider.search({ query: "plano de saúde" });

    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.data.items.length).toBeGreaterThan(0);
      for (const item of result.data.items) {
        expect(item.url).toMatch(/^https?:\/\//);
        expect(item.source).toBe("TJPR");
      }
    }
  });

  it("never dead-ends the demo: falls back to the full catalog when no item matches the query terms", async () => {
    const provider = createFixtureProvider();

    const result = await provider.search({ query: "xilofone marciano intergalatico" });

    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.data.items.length).toBe(FIXTURE_SEARCH_ITEMS.length);
    }
  });

  it("narrows results with keyword-relevant queries instead of always returning everything", async () => {
    const provider = createFixtureProvider();

    const result = await provider.search({ query: "home care" });

    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.data.items.length).toBeLessThan(FIXTURE_SEARCH_ITEMS.length);
      expect(result.data.items.some((item) => item.id === "fixture-003")).toBe(true);
    }
  });

  it("applies chamber/judge/period filters (HU-13 refine-search path)", async () => {
    const provider = createFixtureProvider();

    const result = await provider.search({
      query: "plano de saúde",
      filters: { judgingBody: "3ª Câmara Cível" },
    });

    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.data.items.length).toBeGreaterThan(0);
      for (const item of result.data.items) {
        expect(item.chamber).toBe("3ª Câmara Cível");
      }
    }
  });

  it("fetches a raw decision with fullText by id", async () => {
    const provider = createFixtureProvider();

    const result = await provider.fetchDecision("fixture-001");

    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.data.fullText).toBeTruthy();
      expect(result.data.sourceUrl).toMatch(/^https?:\/\//);
    }
  });

  it("fails with a NOT_FOUND business error for an unknown decisionId, not silently", async () => {
    const provider = createFixtureProvider();

    const result = await provider.fetchDecision("does-not-exist");

    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("FIXTURE_DECISION_NOT_FOUND");
      expect(result.error.category).toBe("NOT_FOUND");
    }
  });
});
