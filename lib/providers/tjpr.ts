import { createAppError } from "../errors/app-error";
import { toolFailure, toolSuccess, type ToolResult } from "../errors/tool-result";
import type { JurisprudenceQuery, JurisprudenceSearchItem, JurisprudenceSearchResult, RawDecision } from "../schemas/search.schema";
import type { JurisprudenceProvider } from "./jurisprudence-provider";

const DEFAULT_TJPR_BASE_URL = "https://portal.tjpr.jus.br";
const TJPR_ACCEPT_HEADER = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const PROCESS_NUMBER_PATTERN = /\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4}/;

interface TjprProviderOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
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

function absoluteUrl(value: string, baseUrl: string): string {
  const decoded = decodeHtmlEntities(stripSessionId(value.trim()));
  return new URL(decoded, baseUrl).toString();
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

function buildSearchUrl(query: JurisprudenceQuery, baseUrl: string): string {
  const url = new URL("/jurisprudencia/publico/pesquisa.do", baseUrl);
  url.searchParams.set("actionType", "pesquisar");
  url.searchParams.set("criterioPesquisa", query.query);
  url.searchParams.set("ambito", "7");
  url.searchParams.set("idLocalPesquisa", "1");
  url.searchParams.set("idsTipoDecisaoSelecionados", "3");
  url.searchParams.set("segredoJustica", "pesquisar com");

  if (query.filters?.periodStart) {
    url.searchParams.set("dataJulgamentoInicio", toBrazilianDate(query.filters.periodStart) ?? query.filters.periodStart);
  }
  if (query.filters?.periodEnd) {
    url.searchParams.set("dataJulgamentoFim", toBrazilianDate(query.filters.periodEnd) ?? query.filters.periodEnd);
  }
  if (query.filters?.judgingBody) {
    url.searchParams.set("nomeOrgaoJulgador", query.filters.judgingBody);
  }
  if (query.filters?.judge) {
    url.searchParams.set("nomeRelator", query.filters.judge);
  }

  return url.toString();
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

  const title = firstMatch(rowHtml, /<font[^>]*class=["']competencia["'][^>]*>([\s\S]*?)<\/font>/i);
  const judgmentDate = parseBrazilianDate(firstMatch(rowHtml, /Data\s+Julgamento:\s*([\s\S]{0,120}?\d{2}\/\d{2}\/\d{4})/i));

  return {
    id,
    processNumber,
    title: title ? cleanText(title) : undefined,
    court: "TJPR",
    judgmentDate,
    summary,
    url: absoluteUrl(rawHref, baseUrl),
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
  const knownDecisionUrls = new Map<string, string>();

  return {
    name: "tjpr",

    async search(query: JurisprudenceQuery): Promise<ToolResult<JurisprudenceSearchResult>> {
      const startedAt = Date.now();
      const url = buildSearchUrl(query, baseUrl);
      const html = await fetchHtml(fetchImpl, url, "tjpr.search");
      if (html.isError) return html;

      const result = parseSearchHtml(html.data, baseUrl);
      for (const item of result.items) {
        knownDecisionUrls.set(item.id, item.url);
      }

      return toolSuccess(result, { source: "tjpr", durationMs: Date.now() - startedAt });
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
      });
    },
  };
}
