/**
 * Host oficial único da fonte de jurisprudência (HU-36: um só tribunal; §7.1: "restringir hosts
 * permitidos, nunca executar URLs arbitrárias"). Centralizado aqui porque duas regras distintas
 * dependem dele: a fixture monta suas URLs de demonstração sobre este domínio (HU-37) e o
 * relatório final recusa exibir um achado cuja URL não aponte para a fonte oficial (HU-27).
 */
export const TJPR_OFFICIAL_HOST = "portal.tjpr.jus.br";

/**
 * HU-27 — "link quebrado ou ausente para uma decisão citada bloqueia a exibição daquele item".
 * Sem rede: o que dá para afirmar deterministicamente é que a URL existe, é bem formada, usa
 * HTTPS e aponta para o domínio oficial do TJPR. Um link que não passa nisso não é rastreável
 * até a fonte e, por isso, não pode sustentar um achado exibido ao advogado.
 */
export function isOfficialTjprUrl(url: string | undefined): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === TJPR_OFFICIAL_HOST;
  } catch {
    return false;
  }
}

/**
 * Nome do único tribunal que o produto pesquisa (HU-36, docs/escopo.md).
 *
 * A peça ENVIADA pode ser de qualquer foro — é o documento do cliente. O que é TJPR-only é a fonte
 * de jurisprudência. Manter os dois no mesmo lugar evita a confusão de achar que o produto recusa
 * peça de fora do Paraná.
 */
export const TRIBUNAL_PESQUISADO = "TJPR";

/**
 * O tribunal citado em texto livre é o TJPR?
 *
 * `CaseAnalysis.court` vem do modelo lendo a peça, então chega como "TJPR", "Tribunal de Justiça do
 * Paraná" ou "Tribunal de Justiça do Estado do Paraná". A comparação é por normalização, não por
 * igualdade: exigir uma grafia exata faria uma peça do Paraná ser anunciada como de outro tribunal.
 *
 * Ausência de tribunal devolve `undefined`, não `false` — "a peça não diz" e "a peça é de outro
 * tribunal" são coisas diferentes, e só a segunda merece aviso na tela.
 */
export function isTribunalDoParana(court: string | undefined): boolean | undefined {
  if (!court?.trim()) return undefined;

  const normalizado = court
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return /\btjpr\b/.test(normalizado) || /\bparana\b/.test(normalizado);
}
