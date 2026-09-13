import { describe, expect, it } from "vitest";
import { TJPR_OFFICIAL_HOST, isOfficialTjprUrl } from "../official-sources";

/**
 * Os casos abaixo não são hipotéticos: cada URL foi consultada contra o portal em 2026-09-13 e o
 * comentário registra o status que ela devolveu. É o que sustenta a regra — um link só é oficial
 * para HU-27 se for um link que o advogado consegue abrir.
 */
describe("isOfficialTjprUrl", () => {
  const decisionUrl =
    "https://portal.tjpr.jus.br/jurisprudencia/j/4100000032734133/D%C3%BAvida/exame%20de%20compet%C3%AAncia-0018288-78.2024.8.16.0019";

  it("accepts the canonical decision URL returned by the search results (HTTP 200)", () => {
    expect(isOfficialTjprUrl(decisionUrl)).toBe(true);
  });

  it("accepts the same path unencoded, since URL normalises it", () => {
    expect(
      isOfficialTjprUrl(
        new URL(
          "/jurisprudencia/j/4100000032734133/Dúvida/exame de competência-0018288-78.2024.8.16.0019",
          `https://${TJPR_OFFICIAL_HOST}`,
        ).toString(),
      ),
    ).toBe(true);
  });

  it("rejects the id-only shortcut, which the portal answers with 404", () => {
    expect(isOfficialTjprUrl("https://portal.tjpr.jus.br/jurisprudencia/j/4100000032734133")).toBe(false);
  });

  it("rejects the public search root, which is itself a 404", () => {
    expect(isOfficialTjprUrl("https://portal.tjpr.jus.br/jurisprudencia/publico/")).toBe(false);
  });

  it("rejects the fixture's invented SPA fragment", () => {
    expect(isOfficialTjprUrl("https://portal.tjpr.jus.br/jurisprudencia/publico/#/decisao/fixture-001")).toBe(false);
  });

  it("rejects plain HTTP even on the official host", () => {
    expect(isOfficialTjprUrl(decisionUrl.replace("https:", "http:"))).toBe(false);
  });

  it("rejects look-alike hosts", () => {
    expect(isOfficialTjprUrl(decisionUrl.replace(TJPR_OFFICIAL_HOST, "portal.tjpr.jus.br.example.com"))).toBe(false);
    expect(isOfficialTjprUrl(decisionUrl.replace(TJPR_OFFICIAL_HOST, "fixture.datavenia.invalid"))).toBe(false);
  });

  it("rejects an absent or malformed URL", () => {
    expect(isOfficialTjprUrl(undefined)).toBe(false);
    expect(isOfficialTjprUrl("")).toBe(false);
    expect(isOfficialTjprUrl("/jurisprudencia/j/41/x")).toBe(false);
  });
});
