import { describe, expect, it, vi } from "vitest";
import { createTjprProvider } from "../tjpr";

const searchHtml = `
<html>
  <body>
    <td>62 registro(s) encontrado(s), exibindo de 1 até 50</td>
    <tr class="even">
      <td>
        <input type="checkbox" name="idsSelecionados" value="4100000032734133">
        <a href="/jurisprudencia/j/4100000032734133/Dúvida/exame de competência-0018288-78.2024.8.16.0019;jsessionid=ABC123">
          0018288-78.2024.8.16.0019
        </a>
        <font class="competencia">&nbsp;Dúvida</font>
        Data Julgamento: 16/05/2025
      </td>
      <td class="juris-tabela-ementa">
        <div id="ementa4100000032734133">
          Plano de saúde. Cobertura de exame. <span class="high">Dano moral</span>.
        </div>
      </td>
    </tr>
    <tr class="odd">
      <td>
        <input type="checkbox" name="idsSelecionados" value="4100000000000000">
        <a href="/jurisprudencia/j/4100000000000000/segredo-0000000-00.2025.8.16.0000">
          0000000-00.2025.8.16.0000
        </a>
      </td>
      <td class="juris-tabela-ementa">Conteúdo pendente de análise por Segredo de Justiça</td>
    </tr>
  </body>
</html>`;

const decisionHtml = `
<html>
  <body>
    <div style="display: none;" id="ementaRef4100000032734133">
      (TJPR - 1ª Vice-Presidência - 0018288-78.2024.8.16.0019 - Ponta Grossa -
      Rel.: DESEMBARGADOR HAYTON LEE SWAIN FILHO - J. 16.05.2025)
    </div>
    <div id="ementa4100000032734133">
      EMENTA: Plano de saúde. Exame de competência.
    </div>
    <div id="texto4100000032734133">
      Vistos.<br>Trata-se de dúvida relacionada ao processo 0018288-78.2024.8.16.0019.
    </div>
  </body>
</html>`;

function htmlResponse(body: string, status = 200): Response {
  return new Response(new TextEncoder().encode(body), {
    status,
    headers: { "content-type": "text/html;charset=UTF-8" },
  });
}

describe("TjprProvider", () => {
  it("searches the public HTML endpoint and normalizes usable rows", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => htmlResponse(searchHtml));
    const provider = createTjprProvider({ baseUrl: "https://portal.tjpr.jus.br", fetchImpl });

    const result = await provider.search({ query: "plano de saude" });

    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.metadata?.source).toBe("tjpr");
      expect(result.data.totalCount).toBe(62);
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0]).toMatchObject({
        id: "4100000032734133",
        processNumber: "0018288-78.2024.8.16.0019",
        court: "TJPR",
        judgmentDate: "2025-05-16",
        source: "TJPR",
      });
      expect(result.data.items[0]?.summary).toContain("Plano de saúde");
      expect(result.data.items[0]?.summary).not.toContain("<span");
      expect(result.data.items[0]?.url).toBe(
        "https://portal.tjpr.jus.br/jurisprudencia/j/4100000032734133/D%C3%BAvida/exame%20de%20compet%C3%AAncia-0018288-78.2024.8.16.0019",
      );
    }

    const requestedUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe("/jurisprudencia/publico/pesquisa.do");
    expect(requestedUrl.searchParams.get("criterioPesquisa")).toBe("plano de saude");
  });

  it("reopens decisions through the canonical URL discovered by search", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(htmlResponse(searchHtml))
      .mockResolvedValueOnce(htmlResponse(decisionHtml));
    const provider = createTjprProvider({ baseUrl: "https://portal.tjpr.jus.br", fetchImpl });

    await provider.search({ query: "plano de saude" });
    const result = await provider.fetchDecision("4100000032734133");

    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.metadata?.source).toBe("tjpr");
      expect(result.data).toMatchObject({
        id: "4100000032734133",
        processNumber: "0018288-78.2024.8.16.0019",
        court: "TJPR",
        judgingBody: "1ª Vice-Presidência",
        rapporteur: "DESEMBARGADOR HAYTON LEE SWAIN FILHO",
        judgmentDate: "2025-05-16",
      });
      expect(result.data.fullText).toContain("Trata-se de dúvida");
    }

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1]?.[0])).not.toContain("jsessionid");
  });

  it("does not guess /jurisprudencia/j/{id} when the search URL is unknown", async () => {
    const provider = createTjprProvider({ fetchImpl: vi.fn() });

    const result = await provider.fetchDecision("4100000032734133");

    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("TJPR_DECISION_URL_NOT_FOUND");
      expect(result.error.category).toBe("NOT_FOUND");
    }
  });

  it("returns a retryable upstream error for server failures", async () => {
    const provider = createTjprProvider({ fetchImpl: vi.fn<typeof fetch>(async () => htmlResponse("erro", 503)) });

    const result = await provider.search({ query: "plano" });

    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("TJPR_HTTP_503");
      expect(result.error.isRetryable).toBe(true);
    }
  });
});
