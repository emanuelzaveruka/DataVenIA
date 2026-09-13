import { createAppError } from "../errors/app-error";
import { toolFailure, toolSuccess, type ToolResult } from "../errors/tool-result";
import type { JurisprudenceQuery, JurisprudenceSearchItem, JurisprudenceSearchResult, RawDecision } from "../schemas/search.schema";
import type { JurisprudenceProvider } from "./jurisprudence-provider";
import {
  SEARCH_COLLECTED_ITEMS_CAP,
  SEARCH_MAX_PAGES,
  SEARCH_PAGE_SIZE,
} from "../config/limits";
import { TJPR_DECISION_PATH_PATTERN } from "../config/official-sources";

const DEFAULT_TJPR_BASE_URL = "https://portal.tjpr.jus.br";
const TJPR_ACCEPT_HEADER = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const PROCESS_NUMBER_PATTERN = /\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4}/;

/**
 * Como pedir a página seguinte ao portal.
 *
 * O parâmetro de página foi validado contra o HTML público do portal em 2026-09-13: o navegador
 * seta `pageNumber=2` nos links de "Próxima Página", e a mesma chave funciona via GET direto sem
 * sessão especial. O parâmetro `pageSize` também aparece no formulário, mas não foi promovido a
 * default porque `pageSize=20` não fez o portal exibir 20 decisões do TJPR por página de forma
 * confiável; até nova validação, limitamos pelo teto local (`itemsCap`) em vez de depender dele.
 */
export interface TjprPaginationConfig {
  /** Nome do parâmetro de página (ex.: `pagina`, `pageNumber`, `numPagina` — a confirmar). */
  pageParam?: string;
  /** Nome do parâmetro de tamanho de página (a interface do portal oferece 20 e 50). */
  pageSizeParam?: string;
  /** Índice da primeira página: 1 na maioria dos portais, 0 em alguns. */
  firstPageIndex: number;
  pageSize: number;
  maxPages: number;
  /** Teto de itens coletados, somando todas as páginas. */
  itemsCap: number;
}

export const DEFAULT_TJPR_PAGINATION: TjprPaginationConfig = {
  pageParam: "pageNumber",
  pageSizeParam: undefined,
  firstPageIndex: 1,
  pageSize: SEARCH_PAGE_SIZE,
  maxPages: SEARCH_MAX_PAGES,
  itemsCap: SEARCH_COLLECTED_ITEMS_CAP,
};

/** Lê os dois nomes pendentes do ambiente, para testar o achado do DevTools sem tocar no código. */
export function paginationFromEnv(
  env: Partial<NodeJS.ProcessEnv> = process.env,
  base: TjprPaginationConfig = DEFAULT_TJPR_PAGINATION,
): TjprPaginationConfig {
  const firstPageIndex = Number.parseInt(env.TJPR_FIRST_PAGE_INDEX ?? "", 10);
  return {
    ...base,
    pageParam: env.TJPR_PAGE_PARAM?.trim() || base.pageParam,
    pageSizeParam: env.TJPR_PAGE_SIZE_PARAM?.trim() || base.pageSizeParam,
    firstPageIndex: Number.isFinite(firstPageIndex) ? firstPageIndex : base.firstPageIndex,
  };
}

interface TjprProviderOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  pagination?: TjprPaginationConfig;
  /**
   * Valor de `idsTipoDecisaoSelecionados`. Ausente por padrão — ver `buildSearchUrl`.
   */
  tipoDecisao?: string;
}

function providerError(params: {
  code: string;
  category: "NETWORK" | "TIMEOUT" | "RATE_LIMIT" | "UPSTREAM" | "PARSING" | "NOT_FOUND";
  description: string;
  operation: string;
  isRetryable: boolean;
  userMessage?: string;
  metadata?: Record<string, unknown>;
}) {
  return createAppError({
    ...params,
    severity: "ERROR",
    source: "tjpr",
  });
}

function errorFromStatus(status: number, operation: string, url: string) {
  const category = status === 404 ? "NOT_FOUND" : status === 429 ? "RATE_LIMIT" : "UPSTREAM";
  return providerError({
    code: `TJPR_HTTP_${status}`,
    category,
    description: `TJPR returned HTTP ${status} for ${url}`,
    operation,
    isRetryable: status === 429 || status >= 500,
    userMessage: "Não foi possível consultar o TJPR agora.",
    metadata: { status, url },
  });
}

function stripSessionId(url: string): string {
  return url.replace(/;jsessionid=[^?"'\s<>]*/i, "");
}

/**
 * Resolve o href da linha de resultado contra o portal e **recusa** o que não tiver o formato de uma
 * página de decisão. Verificado contra o portal em 2026-09-13: só
 * `/jurisprudencia/j/{id}/{classe}/{assunto}-{numeroProcesso}` responde 200; o atalho sem o sufixo
 * responde 404. Um href truncado aqui viraria, lá na frente, um achado sem link abrível — depois de
 * já ter gasto uma chamada de modelo no Scratchpad. Recusar na origem é mais barato e mais honesto.
 */
function decisionUrl(value: string, baseUrl: string): string | undefined {
  const decoded = decodeHtmlEntities(stripSessionId(value.trim()));
  let resolved: URL;
  try {
    resolved = new URL(decoded, baseUrl);
  } catch {
    return undefined;
  }

  return TJPR_DECISION_PATH_PATTERN.test(resolved.pathname) ? resolved.toString() : undefined;
}

function decodeHtmlEntities(value: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " ",
    aacute: "á",
    eacute: "é",
    iacute: "í",
    oacute: "ó",
    uacute: "ú",
    Aacute: "Á",
    Eacute: "É",
    Iacute: "Í",
    Oacute: "Ó",
    Uacute: "Ú",
    agrave: "à",
    Agrave: "À",
    acirc: "â",
    ecirc: "ê",
    ocirc: "ô",
    Acirc: "Â",
    Ecirc: "Ê",
    Ocirc: "Ô",
    atilde: "ã",
    otilde: "õ",
    Atilde: "Ã",
    Otilde: "Õ",
    ccedil: "ç",
    Ccedil: "Ç",
  };

  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (entity, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const codePoint = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }

    if (body.startsWith("#")) {
      const codePoint = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }

    return entities[body] ?? entity;
  });
}

function cleanText(html: string): string {
  return decodeHtmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|td|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstMatch(value: string, pattern: RegExp): string | undefined {
  const match = value.match(pattern);
  return match?.[1]?.trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseBrazilianDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/(\d{2})[/.](\d{2})[/.](\d{4})/);
  if (!match) return undefined;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function toBrazilianDate(value: string | undefined): string | undefined {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

const LATIN1_UNRESERVED = /[A-Za-z0-9\-_.!~*'()]/;

/**
 * O endpoint de busca (`pesquisa.do`) decodifica `criterioPesquisa` e os demais parâmetros de texto
 * como ISO-8859-1, não UTF-8 — apesar da resposta declarar `charset=UTF-8`. Medido em 2026-09-13:
 * "saúde" percent-encoded em UTF-8 (`sa%C3%BAde`) volta ecoado como mojibake (`saÃºde`) no próprio
 * formulário e a busca dá 0 resultados; o mesmo termo em ISO-8859-1 (`sa%FAde`) ecoa corretamente e
 * bate exatamente a contagem da versão sem acento (243 em ambos). `URLSearchParams`/`URL` sempre
 * codificam em UTF-8 e não têm opção de trocar, por isso a query string da busca é montada à mão
 * aqui. (A URL de decisão individual — `decisionUrl` abaixo — é outro endpoint e usa UTF-8
 * normalmente; isso foi validado à parte em `docs/tjpr-portal-validacao.md`.)
 */
function encodeLatin1QueryValue(value: string): string {
  let result = "";
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (LATIN1_UNRESERVED.test(char)) {
      result += char;
    } else if (codePoint <= 0xff) {
      result += `%${codePoint.toString(16).toUpperCase().padStart(2, "0")}`;
    } else {
      // Fora do alcance de ISO-8859-1 (ex.: CJK, emoji): não há equivalente correto no charset do
      // portal, então cai para UTF-8 padrão em vez de descartar o caractere silenciosamente.
      result += encodeURIComponent(char);
    }
  }
  return result;
}

function buildSearchUrl(
  query: JurisprudenceQuery,
  baseUrl: string,
  options?: { pagination?: { config: TjprPaginationConfig; page: number }; tipoDecisao?: string },
): string {
  const pagination = options?.pagination;
  const params: Array<[string, string]> = [
    ["actionType", "pesquisar"],
    ["criterioPesquisa", query.query],
    ["ambito", "7"],
    ["idLocalPesquisa", "1"],
    ["segredoJustica", "pesquisar com"],
  ];

  // `idsTipoDecisaoSelecionados` é um filtro de verdade, e o valor `3` que estava fixo aqui era o
  // errado: medido contra o portal em 2026-09-13, `plano de saude` devolve 62 registros com `3` —
  // **todos** classificados "Dúvida/exame de competência", ou seja, decisões de competência da 1ª
  // Vice-Presidência — contra 243 sem o parâmetro e 182 com `2`. Qual valor significa "Acórdão"
  // ainda é pergunta para a inspeção manual de HU-38 (`docs/tjpr-portal-validacao.md`), e §9 proíbe
  // descobrir por tentativa e erro; até lá, o padrão é não filtrar, que é o recorte mais amplo e o
  // único que não exclui jurisprudência de mérito por engano.
  if (options?.tipoDecisao) {
    params.push(["idsTipoDecisaoSelecionados", options.tipoDecisao]);
  }

  if (query.filters?.periodStart) {
    params.push(["dataJulgamentoInicio", toBrazilianDate(query.filters.periodStart) ?? query.filters.periodStart]);
  }
  if (query.filters?.periodEnd) {
    params.push(["dataJulgamentoFim", toBrazilianDate(query.filters.periodEnd) ?? query.filters.periodEnd]);
  }
  if (query.filters?.judgingBody) {
    params.push(["nomeOrgaoJulgador", query.filters.judgingBody]);
  }
  if (query.filters?.judge) {
    params.push(["nomeRelator", query.filters.judge]);
  }

  // Só entra na URL quando o nome do parâmetro é conhecido. Sem ele, a única página pedível é a
  // que o portal serve por padrão — e é melhor buscar uma página honestamente do que três iguais.
  if (pagination?.config.pageSizeParam) {
    params.push([pagination.config.pageSizeParam, String(pagination.config.pageSize)]);
  }
  if (pagination?.config.pageParam) {
    params.push([
      pagination.config.pageParam,
      String(pagination.config.firstPageIndex + pagination.page),
    ]);
  }

  const base = new URL("/jurisprudencia/publico/pesquisa.do", baseUrl).toString();
  const queryString = params.map(([key, value]) => `${key}=${encodeLatin1QueryValue(value)}`).join("&");
  return `${base}?${queryString}`;
}

async function fetchHtml(fetchImpl: typeof fetch, url: string, operation: string): Promise<ToolResult<string>> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: TJPR_ACCEPT_HEADER },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    return toolFailure(providerError({
      code: "TJPR_NETWORK_ERROR",
      category: "NETWORK",
      description: error instanceof Error ? error.message : "Unknown TJPR network error",
      operation,
      isRetryable: true,
      userMessage: "Não foi possível conectar ao TJPR agora.",
      metadata: { url },
    }));
  }

  if (!response.ok) {
    return toolFailure(errorFromStatus(response.status, operation, url));
  }

  const bytes = await response.arrayBuffer();
  const charset = response.headers.get("content-type")?.match(/charset=([^;]+)/i)?.[1]?.trim().toLowerCase();
  const decoder = new TextDecoder(charset || "iso-8859-1");
  return toolSuccess(decoder.decode(bytes), { source: "tjpr" });
}

function parseSearchItem(rowHtml: string, baseUrl: string): JurisprudenceSearchItem | undefined {
  const id = firstMatch(rowHtml, /name=["']idsSelecionados["'][^>]*value=["']([^"']+)["']/i)
    ?? firstMatch(rowHtml, /\/jurisprudencia\/j\/(\d+)/i);
  const rawHref = firstMatch(rowHtml, /href=["']([^"']*\/jurisprudencia\/j\/\d+[^"']*)["']/i);
  const processNumber = rowHtml.match(PROCESS_NUMBER_PATTERN)?.[0];
  const summaryHtml = firstMatch(rowHtml, /<td[^>]*class=["'][^"']*juris-tabela-ementa[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);
  const summary = summaryHtml ? cleanText(summaryHtml) : undefined;

  if (!id || !rawHref || !processNumber) return undefined;
  if (!summary || /conte[uú]do pendente de an[aá]lise/i.test(summary)) return undefined;

  const url = rawHref ? decisionUrl(rawHref, baseUrl) : undefined;
  if (!url) return undefined;

  const title = firstMatch(rowHtml, /<font[^>]*class=["']competencia["'][^>]*>([\s\S]*?)<\/font>/i);
  const judgmentDate = parseBrazilianDate(firstMatch(rowHtml, /Data\s+Julgamento:\s*([\s\S]{0,120}?\d{2}\/\d{2}\/\d{4})/i));

  return {
    id,
    processNumber,
    title: title ? cleanText(title) : undefined,
    court: "TJPR",
    judgmentDate,
    summary,
    url,
    source: "TJPR",
  };
}

function parseSearchHtml(html: string, baseUrl: string): JurisprudenceSearchResult {
  const rows = html.match(/<tr[^>]*class=["'][^"']*(?:even|odd)[^"']*["'][^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const items = rows
    .map((row) => parseSearchItem(row, baseUrl))
    .filter((item): item is JurisprudenceSearchItem => Boolean(item));
  const totalCountRaw = firstMatch(html, /(\d+)\s+registro\(s\)\s+encontrado\(s\)/i);
  const totalCount = totalCountRaw ? Number.parseInt(totalCountRaw, 10) : items.length;

  return { items, totalCount: Number.isFinite(totalCount) ? totalCount : items.length };
}

function parseHiddenRef(ref: string | undefined) {
  if (!ref) return {};
  const cleaned = cleanText(ref);
  const parts = cleaned.replace(/^\(|\)$/g, "").split(" - ").map((part) => part.trim()).filter(Boolean);
  const rapporteur = firstMatch(cleaned, /Rel\.:\s*(.*?)\s*-\s*J\./i);
  const judgmentDate = parseBrazilianDate(firstMatch(cleaned, /J\.\s*(\d{2}\.\d{2}\.\d{4})/i));
  return {
    judgingBody: parts[1],
    rapporteur,
    judgmentDate,
  };
}

function extractDivById(html: string, id: string): string | undefined {
  return firstMatch(html, new RegExp(`<div[^>]*id=["']${escapeRegExp(id)}["'][^>]*>([\\s\\S]*?)<\\/div>`, "i"));
}

function parseDecisionHtml(id: string, html: string, sourceUrl: string): RawDecision {
  const ref = parseHiddenRef(extractDivById(html, `ementaRef${id}`));
  const summary = cleanText(extractDivById(html, `ementa${id}`) ?? "");
  const fullText = cleanText(extractDivById(html, `texto${id}`) ?? "");
  const processNumber = html.match(PROCESS_NUMBER_PATTERN)?.[0];

  return {
    id,
    processNumber,
    court: "TJPR",
    judgingBody: ref.judgingBody,
    rapporteur: ref.rapporteur,
    judgmentDate: ref.judgmentDate,
    summary: summary || undefined,
    fullText: fullText || undefined,
    sourceUrl,
  };
}

export function createTjprProvider(options: TjprProviderOptions = {}): JurisprudenceProvider {
  const baseUrl = options.baseUrl ?? DEFAULT_TJPR_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const pagination = options.pagination ?? DEFAULT_TJPR_PAGINATION;
  const tipoDecisao = options.tipoDecisao;
  const knownDecisionUrls = new Map<string, string>();

  return {
    name: "tjpr",

    async search(query: JurisprudenceQuery): Promise<ToolResult<JurisprudenceSearchResult>> {
      const startedAt = Date.now();
      const firstUrl = buildSearchUrl(query, baseUrl, {
        pagination: { config: pagination, page: 0 },
        tipoDecisao,
      });
      // Sem o nome do parâmetro de página, pedir a página 2 devolveria a 1 de novo: uma página é o
      // máximo honesto. Com ele, o teto é o menor entre maxPages e o teto de itens coletados.
      const maxPages = pagination.pageParam ? pagination.maxPages : 1;

      const items: JurisprudenceSearchItem[] = [];
      const seen = new Set<string>();
      let totalCount = 0;
      let pagesFetched = 0;

      for (let page = 0; page < maxPages; page += 1) {
        const url =
          page === 0
            ? firstUrl
            : buildSearchUrl(query, baseUrl, { pagination: { config: pagination, page }, tipoDecisao });
        const html = await fetchHtml(fetchImpl, url, "tjpr.search");
        // Falha na primeira página é falha da busca; numa página seguinte, é motivo para parar com
        // o que já veio — descartar duas páginas boas por causa da terceira seria pior.
        if (html.isError) {
          if (page === 0) return html;
          break;
        }

        const parsed = parseSearchHtml(html.data, baseUrl);
        pagesFetched += 1;
        totalCount = Math.max(totalCount, parsed.totalCount);

        const novos = parsed.items.filter((item) => !seen.has(item.id));
        for (const item of novos) {
          seen.add(item.id);
          items.push(item);
          knownDecisionUrls.set(item.id, item.url);
        }

        // Página que não trouxe nada novo significa que o portal ignorou o parâmetro de paginação
        // (ou que acabaram os resultados). Insistir só gastaria requisição contra a mesma página.
        if (novos.length === 0 || items.length >= pagination.itemsCap) break;
      }

      return toolSuccess(
        { items: items.slice(0, pagination.itemsCap), totalCount: totalCount || items.length },
        { source: "tjpr", durationMs: Date.now() - startedAt, url: firstUrl, pagesFetched },
      );
    },

    async fetchDecision(decisionId: string): Promise<ToolResult<RawDecision>> {
      const startedAt = Date.now();
      const sourceUrl = knownDecisionUrls.get(decisionId);
      if (!sourceUrl) {
        return toolFailure(providerError({
          code: "TJPR_DECISION_URL_NOT_FOUND",
          category: "NOT_FOUND",
          description: `TJPR decision ${decisionId} is missing its canonical search-result URL`,
          operation: "tjpr.fetchDecision",
          isRetryable: false,
          userMessage: "Não foi possível reabrir a decisão do TJPR porque a URL oficial não veio da busca.",
          metadata: { decisionId },
        }));
      }

      const html = await fetchHtml(fetchImpl, sourceUrl, "tjpr.fetchDecision");
      if (html.isError) return html;

      return toolSuccess(parseDecisionHtml(decisionId, html.data, sourceUrl), {
        source: "tjpr",
        durationMs: Date.now() - startedAt,
        url: sourceUrl,
      });
    },
  };
}
