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

  it("encodes accented search terms as ISO-8859-1, not UTF-8", async () => {
    // Medido contra o portal em 2026-09-13: ele decodifica criterioPesquisa como ISO-8859-1 mesmo
    // declarando charset=UTF-8 na resposta. UTF-8 percent-encoding vira mojibake lá e a busca some
    // (0 resultados) para qualquer termo acentuado — "saúde", "indenização" etc.
    const fetchImpl = vi.fn<typeof fetch>(async () => htmlResponse(searchHtml));
    const provider = createTjprProvider({ baseUrl: "https://portal.tjpr.jus.br", fetchImpl });

    await provider.search({ query: "plano saúde indenização" });

    const requestedUrl = String(fetchImpl.mock.calls[0]?.[0]);
    // "ú" = U+00FA -> ISO-8859-1 %FA; "ç" = U+00E7 -> %E7; "ã" = U+00E3 -> %E3.
    expect(requestedUrl).toContain("criterioPesquisa=plano%20sa%FAde%20indeniza%E7%E3o");
    expect(requestedUrl).not.toContain("%C3%BA");
    expect(requestedUrl).not.toContain("%C3%A7");
  });

  it("reopens decisions through the canonical URL discovered by search", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(htmlResponse(searchHtml))
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

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(String(fetchImpl.mock.calls[2]?.[0])).not.toContain("jsessionid");
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

describe("TjprProvider — paginação (HU-13/HU-38)", () => {
  /** Uma linha de resultado por id, para distinguir páginas diferentes nas asserções. */
  function pageHtml(ids: string[], total = 62): string {
    const rows = ids
      .map(
        (id) => `
    <tr class="even">
      <td>
        <input type="checkbox" name="idsSelecionados" value="${id}">
        <a href="/jurisprudencia/j/${id}/caso-0018288-78.2024.8.16.0019">0018288-78.2024.8.16.0019</a>
        Data Julgamento: 16/05/2025
      </td>
      <td class="juris-tabela-ementa">Plano de saúde. Cobertura de exame.</td>
    </tr>`,
      )
      .join("");
    return `<html><body><td>${total} registro(s) encontrado(s)</td>${rows}</body></html>`;
  }

  const PAGINATION = {
    pageParam: "pagina",
    pageSizeParam: "tamanhoPagina",
    firstPageIndex: 1,
    pageSize: 20,
    maxPages: 3,
    itemsCap: 60,
  };

  it("usa pageNumber por padrão, parâmetro observado no navegador do TJPR", async () => {
    const pages = [pageHtml(["1", "2"]), pageHtml(["3", "4"]), pageHtml(["5", "6"])];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const page = Number(new URL(String(input)).searchParams.get("pageNumber"));
      return htmlResponse(pages[page - 1]!);
    });
    const provider = createTjprProvider({ baseUrl: "https://portal.tjpr.jus.br", fetchImpl });

    const result = await provider.search({ query: "plano de saude" });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(new URL(String(fetchImpl.mock.calls[0]![0])).searchParams.get("pageNumber")).toBe("1");
    expect(new URL(String(fetchImpl.mock.calls[1]![0])).searchParams.get("pageNumber")).toBe("2");
    expect(result.isError).toBe(false);
    if (result.isError) return;
    expect(result.data.items.map((item) => item.id)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(result.metadata?.pagesFetched).toBe(3);
  });

  it("com o parâmetro configurado, percorre as páginas e junta os resultados", async () => {
    const pages = [pageHtml(["1", "2"]), pageHtml(["3", "4"]), pageHtml(["5", "6"])];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const page = Number(new URL(String(input)).searchParams.get("pagina"));
      return htmlResponse(pages[page - 1]!);
    });
    const provider = createTjprProvider({
      baseUrl: "https://portal.tjpr.jus.br",
      fetchImpl,
      pagination: PAGINATION,
    });

    const result = await provider.search({ query: "plano de saude" });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.isError).toBe(false);
    if (result.isError) return;
    expect(result.data.items.map((item) => item.id)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(result.data.totalCount).toBe(62);
    expect(result.metadata?.pagesFetched).toBe(3);
  });

  it("para de paginar quando a página não traz nada novo", async () => {
    // É o que acontece se o portal ignorar o parâmetro: devolve sempre a mesma página.
    const fetchImpl = vi.fn<typeof fetch>(async () => htmlResponse(pageHtml(["1", "2"])));
    const provider = createTjprProvider({
      baseUrl: "https://portal.tjpr.jus.br",
      fetchImpl,
      pagination: PAGINATION,
    });

    const result = await provider.search({ query: "plano de saude" });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.isError).toBe(false);
    if (result.isError) return;
    expect(result.data.items).toHaveLength(2);
  });

  it("falha numa página seguinte preserva o que já veio", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const page = Number(new URL(String(input)).searchParams.get("pagina"));
      return page === 1 ? htmlResponse(pageHtml(["1", "2"])) : htmlResponse("erro", 500);
    });
    const provider = createTjprProvider({
      baseUrl: "https://portal.tjpr.jus.br",
      fetchImpl,
      pagination: PAGINATION,
    });

    const result = await provider.search({ query: "plano de saude" });

    // Descartar duas páginas boas por causa da terceira seria pior do que seguir com o que veio.
    expect(result.isError).toBe(false);
    if (result.isError) return;
    expect(result.data.items).toHaveLength(2);
    expect(result.metadata?.pagesFetched).toBe(1);
  });

  it("falha na primeira página continua sendo falha da busca", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => htmlResponse("erro", 500));
    const provider = createTjprProvider({
      baseUrl: "https://portal.tjpr.jus.br",
      fetchImpl,
      pagination: PAGINATION,
    });

    expect((await provider.search({ query: "plano de saude" })).isError).toBe(true);
  });

  it("respeita o teto de itens coletados mesmo com páginas sobrando", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const page = Number(new URL(String(input)).searchParams.get("pagina"));
      // Ids numéricos porque é o que o portal usa — e desde a validação da URL de decisão um id
      // não numérico não formaria um link abrível, logo o item nem seria publicado.
      return htmlResponse(pageHtml([`${page}01`, `${page}02`, `${page}03`]));
    });
    const provider = createTjprProvider({
      baseUrl: "https://portal.tjpr.jus.br",
      fetchImpl,
      pagination: { ...PAGINATION, itemsCap: 4 },
    });

    const result = await provider.search({ query: "plano de saude" });

    expect(result.isError).toBe(false);
    if (result.isError) return;
    expect(result.data.items).toHaveLength(4);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

/**
 * As duas regras abaixo saíram de uma medição contra o portal em 2026-09-13, não de leitura de
 * documentação: a URL canônica com o sufixo devolve 200, o atalho só com o id devolve 404, e
 * `idsTipoDecisaoSelecionados=3` reduz `plano de saude` a 62 decisões de competência (243 sem o
 * parâmetro).
 */
describe("TjprProvider — só publica o que é rastreável", () => {
  const shortcutHtml = `
<html><body>
  <td>1 registro(s) encontrado(s)</td>
  <tr class="even">
    <td>
      <input type="checkbox" name="idsSelecionados" value="4100000032734133">
      <a href="/jurisprudencia/j/4100000032734133">0018288-78.2024.8.16.0019</a>
      Data Julgamento: 16/05/2025
    </td>
    <td class="juris-tabela-ementa">Plano de saúde. Cobertura de exame.</td>
  </tr>
</body></html>`;

  it("descarta a linha cujo href é o atalho sem sufixo, que o portal responde com 404", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => htmlResponse(shortcutHtml));
    const provider = createTjprProvider({ baseUrl: "https://portal.tjpr.jus.br", fetchImpl });

    const result = await provider.search({ query: "plano de saude" });

    expect(result.isError).toBe(false);
    if (result.isError) return;
    // Publicar o item só adiaria o problema: ele gastaria uma chamada de modelo no Scratchpad para
    // depois ser bloqueado por HU-27 no relatório, por não ter link abrível.
    expect(result.data.items).toHaveLength(0);
  });

  it("não filtra por tipo de decisão enquanto o valor correto não for confirmado (HU-38)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => htmlResponse(searchHtml));
    const provider = createTjprProvider({ baseUrl: "https://portal.tjpr.jus.br", fetchImpl });

    await provider.search({ query: "plano de saude" });

    const url = new URL(String(fetchImpl.mock.calls[0]![0]));
    expect(url.searchParams.has("idsTipoDecisaoSelecionados")).toBe(false);
  });

  it("envia o tipo de decisão quando configurado", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => htmlResponse(searchHtml));
    const provider = createTjprProvider({
      baseUrl: "https://portal.tjpr.jus.br",
      fetchImpl,
      tipoDecisao: "2",
    });

    await provider.search({ query: "plano de saude" });

    const url = new URL(String(fetchImpl.mock.calls[0]![0]));
    expect(url.searchParams.get("idsTipoDecisaoSelecionados")).toBe("2");
  });
});
